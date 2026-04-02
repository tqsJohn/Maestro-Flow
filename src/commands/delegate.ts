// ---------------------------------------------------------------------------
// `maestro delegate` — prompt-first task delegation
// ---------------------------------------------------------------------------

import type { Command } from 'commander';
import { resolve } from 'node:path';
import { CliAgentRunner } from '../agents/cli-agent-runner.js';
import { CliHistoryStore } from '../agents/cli-history-store.js';
import type { ExecutionMeta } from '../agents/cli-history-store.js';
import { loadCliToolsConfig, selectTool } from '../config/cli-tools-config.js';

function statusLabel(meta: ExecutionMeta): string {
  if (meta.exitCode === undefined && !meta.completedAt) return 'running';
  if (meta.exitCode === 0) return 'done';
  return `exit:${meta.exitCode ?? '?'}`;
}

function truncate(text: string, max: number): string {
  const oneLine = text.replace(/\n/g, ' ').trim();
  if (oneLine.length <= max) return oneLine;
  return oneLine.slice(0, max - 3) + '...';
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

export function registerDelegateCommand(program: Command): void {
  const delegate = program
    .command('delegate [prompt]')
    .description('Delegate a prompt to a CLI agent tool');

  // ---- Main action ---------------------------------------------------------

  delegate
    .option('--to <tool>', 'CLI tool to delegate to (gemini, qwen, codex, claude, opencode)')
    .option('--mode <mode>', 'Execution mode (analysis or write)', 'analysis')
    .option('--model <model>', 'Model override')
    .option('--cd <dir>', 'Working directory')
    .option('--rule <template>', 'Template name — auto-loads protocol + template')
    .option('--id <id>', 'Execution ID (auto-generated if omitted)')
    .option('--resume [id]', 'Resume previous session (last if no id)')
    .option('--includeDirs <dirs>', 'Additional directories (comma-separated)')
    .action(async (prompt: string | undefined, opts: {
      to?: string;
      mode: string;
      model?: string;
      cd?: string;
      rule?: string;
      id?: string;
      resume?: string | true;
      includeDirs?: string;
    }) => {
      if (!prompt) {
        console.error('error: prompt is required. Usage: maestro delegate "your prompt"');
        process.exit(1);
      }

      const config = await loadCliToolsConfig();
      const selected = selectTool(opts.to, config);

      const toolName = selected?.name ?? opts.to ?? 'gemini';
      const model = opts.model ?? selected?.entry?.primaryModel;
      const mode = opts.mode as 'analysis' | 'write';

      if (mode !== 'analysis' && mode !== 'write') {
        console.error(`Invalid mode: ${opts.mode}. Use "analysis" or "write".`);
        process.exit(1);
      }

      try {
        const runner = new CliAgentRunner();
        const exitCode = await runner.run({
          prompt,
          tool: toolName,
          mode,
          model,
          workDir: resolve(opts.cd ?? process.cwd()),
          rule: opts.rule,
          execId: opts.id,
          resume: opts.resume === true ? 'last' : opts.resume,
          includeDirs: opts.includeDirs?.split(',').map(d => d.trim()).filter(Boolean),
        });
        process.exit(exitCode);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Delegate failed: ${message}`);
        process.exit(1);
      }
    });

  // ---- show subcommand -----------------------------------------------------

  delegate
    .command('show')
    .description('List recent delegated executions')
    .option('--all', 'Include full history')
    .action((opts: { all?: boolean }) => {
      const store = new CliHistoryStore();
      const limit = opts.all ? 100 : 20;
      const items = store.listRecent(limit);

      if (items.length === 0) {
        console.log('No recent executions.');
        return;
      }

      const colId = 24;
      const colTool = 10;
      const colMode = 10;
      const colStatus = 10;
      const colPrompt = 50;

      const header = [
        padRight('ID', colId),
        padRight('Tool', colTool),
        padRight('Mode', colMode),
        padRight('Status', colStatus),
        padRight('Prompt', colPrompt),
      ].join('  ');

      console.log(header);
      console.log('-'.repeat(header.length));

      for (const meta of items) {
        const row = [
          padRight(meta.execId, colId),
          padRight(meta.tool, colTool),
          padRight(meta.mode, colMode),
          padRight(statusLabel(meta), colStatus),
          padRight(truncate(meta.prompt, colPrompt), colPrompt),
        ].join('  ');
        console.log(row);
      }
    });

  // ---- output subcommand ---------------------------------------------------

  delegate
    .command('output <id>')
    .description('Get assistant output for a delegated execution')
    .option('--verbose', 'Show full metadata and raw output')
    .action((id: string, opts: { verbose?: boolean }) => {
      const store = new CliHistoryStore();
      const meta = store.loadMeta(id);

      if (!meta) {
        console.error(`Execution not found: ${id}`);
        process.exit(1);
      }

      if (opts.verbose) {
        console.log(`ID:     ${meta.execId}`);
        console.log(`Tool:   ${meta.tool}`);
        console.log(`Mode:   ${meta.mode}`);
        console.log(`Status: ${statusLabel(meta)}`);
        console.log(`Start:  ${meta.startedAt}`);
        if (meta.completedAt) {
          console.log(`End:    ${meta.completedAt}`);
        }
        console.log('---');
      }

      const output = store.getOutput(id);
      if (!output) {
        console.error(`No output available for: ${id}`);
        process.exit(1);
      }

      process.stdout.write(output);
    });
}
