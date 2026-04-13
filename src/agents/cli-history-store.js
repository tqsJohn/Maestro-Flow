// ---------------------------------------------------------------------------
// CLI History Store
// Persistent JSONL storage for CLI execution history with resume support.
// ---------------------------------------------------------------------------
import { join } from 'node:path';
import { appendFileSync, writeFileSync, readFileSync, readdirSync, statSync, } from 'node:fs';
import { paths } from '../config/paths.js';
import { truncateForHistory } from '../utils/cli-format.js';
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** Entry types to include when building a resume prompt. */
const RESUME_INCLUDE_TYPES = new Set([
    'assistant_message',
    'tool_use',
    'file_change',
    'command_exec',
    'error',
]);
/** Warn when resume context exceeds this char count. */
const RESUME_CONTEXT_WARN_CHARS = 32_000;
/** Max chars per tool_use result or command_exec output in resume context. */
const RESUME_ENTRY_MAX_CHARS = 4_096;
const SNAPSHOT_OUTPUT_PREVIEW_CHARS = 240;
// ---------------------------------------------------------------------------
// CliHistoryStore
// ---------------------------------------------------------------------------
export class CliHistoryStore {
    get dir() {
        return paths.cliHistory;
    }
    jsonlPath(execId) {
        return join(this.dir, `${execId}.jsonl`);
    }
    metaPath(execId) {
        return join(this.dir, `${execId}.meta.json`);
    }
    /** Expose JSONL file path for a given execution (used by watch). */
    jsonlPathFor(execId) {
        return this.jsonlPath(execId);
    }
    // ---- Write operations ---------------------------------------------------
    /** Append a single entry as one JSONL line. */
    appendEntry(execId, entry) {
        paths.ensure(this.dir);
        appendFileSync(this.jsonlPath(execId), JSON.stringify(entry) + '\n', 'utf-8');
    }
    /** Save (or overwrite) execution metadata. */
    saveMeta(execId, meta) {
        paths.ensure(this.dir);
        writeFileSync(this.metaPath(execId), JSON.stringify(meta, null, 2), 'utf-8');
    }
    // ---- Read operations ----------------------------------------------------
    /** Load execution metadata, or null if not found. */
    loadMeta(execId) {
        try {
            const raw = readFileSync(this.metaPath(execId), 'utf-8');
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }
    /**
     * Load JSONL entries filtered for resume context.
     * Excludes status_change, token_usage, thinking, approval_*, user_message,
     * and partial assistant_message entries.
     */
    loadForResume(execId) {
        let raw;
        try {
            raw = readFileSync(this.jsonlPath(execId), 'utf-8');
        }
        catch {
            return [];
        }
        const entries = [];
        for (const line of raw.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed)
                continue;
            try {
                const entry = JSON.parse(trimmed);
                if (!RESUME_INCLUDE_TYPES.has(entry.type))
                    continue;
                // Skip partial assistant messages
                if (entry.type === 'assistant_message' && entry.partial === true)
                    continue;
                // For tool_use, only include completed
                if (entry.type === 'tool_use' && entry.status !== 'completed')
                    continue;
                entries.push(entry);
            }
            catch {
                // skip malformed lines
            }
        }
        return entries;
    }
    /**
     * Build a resume prompt by loading previous session context and wrapping
     * it with the new prompt.
     *
     * Supports single or comma-separated execIds for merge scenarios.
     */
    buildResumePrompt(execIds, newPrompt) {
        const ids = Array.isArray(execIds) ? execIds : execIds.split(',').map(s => s.trim());
        const sections = [];
        for (const id of ids) {
            const meta = this.loadMeta(id);
            const entries = this.loadForResume(id);
            if (entries.length === 0 && !meta)
                continue;
            const header = meta
                ? `Tool: ${meta.tool} | Mode: ${meta.mode}`
                : `Session: ${id}`;
            const formatted = entries.map(e => formatEntry(e)).join('\n');
            sections.push(`${header}\n\n${formatted}`);
        }
        if (sections.length === 0) {
            return newPrompt;
        }
        const result = [
            '=== PREVIOUS CONVERSATION ===',
            sections.join('\n\n---\n\n'),
            '',
            '=== NEW REQUEST ===',
            newPrompt,
        ].join('\n');
        if (result.length > RESUME_CONTEXT_WARN_CHARS) {
            console.error(`Warning: resume context is ${Math.round(result.length / 1024)}KB — may exceed model context limit.`);
        }
        return result;
    }
    // ---- Query operations ---------------------------------------------------
    /** List recent execution metadata, sorted by modification time descending. */
    listRecent(limit = 20) {
        try {
            const files = readdirSync(this.dir)
                .filter(f => f.endsWith('.meta.json'))
                .map(f => ({
                name: f,
                mtime: statSync(join(this.dir, f)).mtimeMs,
            }))
                .sort((a, b) => b.mtime - a.mtime)
                .slice(0, limit);
            const results = [];
            for (const f of files) {
                try {
                    const raw = readFileSync(join(this.dir, f.name), 'utf-8');
                    results.push(JSON.parse(raw));
                }
                catch {
                    // skip corrupt meta files
                }
            }
            return results;
        }
        catch {
            return [];
        }
    }
    /** Get final output text from an execution's JSONL. */
    getOutput(execId) {
        let raw;
        try {
            raw = readFileSync(this.jsonlPath(execId), 'utf-8');
        }
        catch {
            return '';
        }
        const parts = [];
        for (const line of raw.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed)
                continue;
            try {
                const entry = JSON.parse(trimmed);
                if (entry.type === 'assistant_message' && entry.partial !== true) {
                    parts.push(String(entry.content ?? ''));
                }
            }
            catch {
                // skip
            }
        }
        return parts.join('');
    }
    /** Build a compact snapshot for async broker updates from persisted history. */
    buildSnapshot(execId) {
        const meta = this.loadMeta(execId);
        if (!meta) {
            return null;
        }
        const output = this.getOutput(execId);
        const normalizedOutput = output.replace(/\s+/g, ' ').trim();
        const status = meta.cancelledAt
            ? 'cancelled'
            : meta.exitCode === undefined && !meta.completedAt
                ? 'running'
                : meta.exitCode === 0
                    ? 'completed'
                    : 'failed';
        return {
            execId: meta.execId,
            tool: meta.tool,
            mode: meta.mode,
            workDir: meta.workDir,
            prompt: meta.prompt,
            startedAt: meta.startedAt,
            completedAt: meta.completedAt ?? null,
            exitCode: meta.exitCode ?? null,
            status,
            outputPreview: truncateForHistory(normalizedOutput, SNAPSHOT_OUTPUT_PREVIEW_CHARS),
            outputChars: output.length,
        };
    }
}
// ---------------------------------------------------------------------------
// Entry formatting for resume prompt
// ---------------------------------------------------------------------------
function formatEntry(entry) {
    switch (entry.type) {
        case 'assistant_message':
            return String(entry.content ?? '');
        case 'tool_use':
            return `[Tool ${String(entry.name ?? 'unknown')}: ${truncateForHistory(String(entry.result ?? ''), RESUME_ENTRY_MAX_CHARS)}]`;
        case 'file_change':
            return `[File ${String(entry.action ?? 'change')}: ${String(entry.path ?? '')}]`;
        case 'command_exec': {
            const output = entry.output ? `\n${truncateForHistory(String(entry.output), RESUME_ENTRY_MAX_CHARS)}` : '';
            return `[Exec: ${String(entry.command ?? '')}]${output}`;
        }
        case 'error':
            return `[Error: ${String(entry.message ?? '')}]`;
        default:
            return `[${entry.type}]`;
    }
}
//# sourceMappingURL=cli-history-store.js.map