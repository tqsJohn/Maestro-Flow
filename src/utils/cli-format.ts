// ---------------------------------------------------------------------------
// Shared CLI formatting and status utilities
// Used by cli command, delegate command, tools, delegate-control, and relay.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import type { EntryLike, ExecutionMeta } from '../agents/cli-history-store.js';

// ---------------------------------------------------------------------------
// Status derivation
// ---------------------------------------------------------------------------

export function deriveExecutionStatus(meta: ExecutionMeta | null): string {
  if (!meta) {
    return 'unknown';
  }

  if (meta.cancelledAt) {
    return 'cancelled';
  }

  if (meta.exitCode === undefined && !meta.completedAt) {
    return 'running';
  }

  if (meta.exitCode === 0) {
    return 'completed';
  }

  return meta.exitCode === undefined ? 'unknown' : `exit:${meta.exitCode}`;
}

export type DelegateJobLike = {
  status: string;
  metadata?: Record<string, unknown> | null;
} | null;

export function deriveDelegateStatus(
  meta: ExecutionMeta | null,
  job: DelegateJobLike,
): string {
  if (
    (job?.status === 'running' || job?.status === 'queued')
    && job.metadata
    && typeof job.metadata.cancelRequestedAt === 'string'
  ) {
    return 'cancelling';
  }
  return job?.status ?? deriveExecutionStatus(meta);
}

// ---------------------------------------------------------------------------
// String formatting
// ---------------------------------------------------------------------------

export function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

/**
 * Collapse newlines to spaces, trim, then truncate with "...".
 * Used by CLI table output (cli show, delegate show).
 */
export function truncate(text: string, max: number): string {
  const oneLine = text.replace(/\n/g, ' ').trim();
  if (oneLine.length <= max) return oneLine;
  return oneLine.slice(0, max - 3) + '...';
}

/**
 * Truncate without newline collapsing — just cutoff with "...".
 * Used by channel relay notifications.
 */
export function truncateRaw(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max - 3) + '...';
}

/**
 * Truncate with ellipsis indicator for history/resume context.
 * Uses different suffix from other truncate variants.
 */
export function truncateForHistory(s: string, max: number): string {
  return s.length <= max ? s : s.substring(0, max) + '\u2026[truncated]';
}

// ---------------------------------------------------------------------------
// Execution entry reading
// ---------------------------------------------------------------------------

export function readExecutionEntries(
  store: { jsonlPathFor(execId: string): string },
  execId: string,
): EntryLike[] {
  try {
    const raw = readFileSync(store.jsonlPathFor(execId), 'utf-8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as EntryLike;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is EntryLike => entry !== null);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Broker event summarization
// ---------------------------------------------------------------------------

/**
 * CLI-friendly single-line summary of a broker event.
 * Used by `delegate status` and `delegate tail` commands.
 */
export function summarizeBrokerEventCli(event: {
  eventId: number;
  type: string;
  status?: string;
  payload: Record<string, unknown>;
  snapshot?: unknown;
}): string {
  const payloadSummary = typeof event.payload.summary === 'string'
    ? event.payload.summary
    : typeof event.payload.message === 'string'
      ? event.payload.message
      : null;
  const progress = event.snapshot && typeof event.snapshot === 'object' && event.snapshot !== null
    && 'progress' in event.snapshot && typeof (event.snapshot as Record<string, unknown>).progress === 'number'
    ? ` progress=${(event.snapshot as Record<string, unknown>).progress}%`
    : '';
  return `${event.eventId} ${event.type}${event.status ? ` (${event.status})` : ''}${progress}${payloadSummary ? ` ${payloadSummary}` : ''}`;
}

/**
 * Structured summary of a broker event (object return).
 * Used by MCP tools (delegate_status, delegate_tail).
 */
export function summarizeBrokerEventStructured(event: {
  eventId: number;
  sequence: number;
  type: string;
  createdAt: string;
  status?: string;
  snapshot?: unknown;
  payload: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    eventId: event.eventId,
    sequence: event.sequence,
    type: event.type,
    createdAt: event.createdAt,
    status: event.status ?? null,
    summary: typeof event.payload.summary === 'string'
      ? event.payload.summary
      : typeof event.payload.message === 'string'
        ? event.payload.message
        : null,
    snapshot: event.snapshot ?? null,
  };
}
