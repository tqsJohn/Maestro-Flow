import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Command } from 'commander';

describe('delegate command', () => {
  const tempHome = mkdtempSync(join(tmpdir(), 'maestro-delegate-command-'));
  let registerDelegateCommand: typeof import('./delegate.js').registerDelegateCommand;
  let launchDetachedDelegateWorker: typeof import('./delegate.js').launchDetachedDelegateWorker;
  let CliHistoryStore: typeof import('../agents/cli-history-store.js').CliHistoryStore;

  before(async () => {
    process.env.MAESTRO_HOME = tempHome;
    ({ registerDelegateCommand, launchDetachedDelegateWorker } = await import('./delegate.js'));
    ({ CliHistoryStore } = await import('../agents/cli-history-store.js'));
  });

  beforeEach(() => {
    try {
      rmSync(tempHome, { recursive: true, force: true });
    } catch {
      // SQLite temp file may still be held until process exit.
    }
  });

  after(() => {
    try {
      rmSync(tempHome, { recursive: true, force: true });
    } catch {
      // SQLite temp file may still be held until process exit.
    }
    delete process.env.MAESTRO_HOME;
  });

  it('launches a detached async worker and writes running metadata immediately', () => {
    const store = new CliHistoryStore();
    const spawnCalls: Array<{ command: string; args: readonly string[]; options: unknown; unrefCalled: boolean }> = [];
    const brokerEvents: Array<Record<string, unknown>> = [];

    launchDetachedDelegateWorker({
      prompt: 'inspect project state',
      tool: 'codex',
      mode: 'analysis',
      workDir: 'D:/maestro2',
      execId: 'exec-async',
      resume: 'last',
      includeDirs: ['src', 'tests'],
      sessionId: 'session-1',
      backend: 'direct',
    }, {
      historyStore: store,
      brokerClient: {
        registerSession() {
          throw new Error('not implemented');
        },
        heartbeat() {
          throw new Error('not implemented');
        },
        publishEvent(input) {
          brokerEvents.push(input as Record<string, unknown>);
          return {
            eventId: 1,
            sequence: 1,
            jobId: String(input.jobId),
            type: String(input.type),
            createdAt: '2026-04-07T10:00:00.000Z',
            payload: (input.payload ?? {}) as Record<string, unknown>,
          };
        },
        pollEvents() {
          return [];
        },
        ack() {
          return 0;
        },
        getJob() {
          return null;
        },
        listJobEvents() {
          return [];
        },
        requestCancel() {
          throw new Error('not implemented');
        },
      } as any,
      entryScript: 'D:/maestro2/bin/maestro.js',
      now: () => '2026-04-07T10:00:00.000Z',
      spawnProcess: (command, args, options) => {
        const call = { command, args, options, unrefCalled: false };
        spawnCalls.push(call);
        return {
          pid: 4321,
          unref() {
            call.unrefCalled = true;
          },
        };
      },
    });

    const meta = store.loadMeta('exec-async');
    assert.ok(meta);
    assert.equal(meta.startedAt, '2026-04-07T10:00:00.000Z');
    assert.equal(meta.completedAt, undefined);
    assert.equal(meta.exitCode, undefined);

    assert.equal(spawnCalls.length, 1);
    assert.equal(spawnCalls[0].command, process.execPath);
    assert.deepEqual(spawnCalls[0].args, [
      'D:/maestro2/bin/maestro.js',
      'delegate',
      'inspect project state',
      '--worker',
      '--to',
      'codex',
      '--mode',
      'analysis',
      '--cd',
      'D:/maestro2',
      '--id',
      'exec-async',
      '--backend',
      'direct',
      '--resume',
      'last',
      '--includeDirs',
      'src,tests',
      '--session',
      'session-1',
    ]);
    const spawnOptions = spawnCalls[0].options as { cwd: string; detached: boolean; stdio: string; env: NodeJS.ProcessEnv };
    assert.equal(spawnOptions.cwd, 'D:/maestro2');
    assert.equal(spawnOptions.detached, true);
    assert.equal(spawnOptions.stdio, 'ignore');
    assert.equal(spawnOptions.env.MAESTRO_DISABLE_DASHBOARD_BRIDGE, '1');
    assert.equal(spawnCalls[0].unrefCalled, true);
    assert.equal(brokerEvents.length, 1);
    assert.equal(brokerEvents[0].type, 'queued');
  });

  it('keeps show and output working against persisted history', async () => {
    const store = new CliHistoryStore();
    store.saveMeta('exec-show', {
      execId: 'exec-show',
      tool: 'gemini',
      mode: 'analysis',
      prompt: 'Summarize the repo',
      workDir: 'D:/maestro2',
      startedAt: '2026-04-07T10:05:00.000Z',
      completedAt: '2026-04-07T10:06:00.000Z',
      exitCode: 0,
    });
    store.appendEntry('exec-show', {
      type: 'assistant_message',
      content: 'Repository summary output',
      partial: false,
    });

    const logs: string[] = [];
    const stdoutChunks: string[] = [];
    const originalLog = console.log;
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);

    console.log = (...args: unknown[]) => {
      logs.push(args.map((value) => String(value)).join(' '));
    };
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdoutChunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'));
      return true;
    }) as typeof process.stdout.write;

    try {
      const showProgram = new Command();
      registerDelegateCommand(showProgram);
      await showProgram.parseAsync(['delegate', 'show'], { from: 'user' });

      const outputProgram = new Command();
      registerDelegateCommand(outputProgram);
      await outputProgram.parseAsync(['delegate', 'output', 'exec-show'], { from: 'user' });
    } finally {
      console.log = originalLog;
      process.stdout.write = originalStdoutWrite;
    }

    assert.match(logs.join('\n'), /exec-show/);
    assert.match(logs.join('\n'), /Repository summary output|Summarize the repo/);
    assert.equal(stdoutChunks.join(''), 'Repository summary output');
  });

  it('supports status, tail, and cancel subcommands for async delegates', async () => {
    const store = new CliHistoryStore();
    store.saveMeta('exec-async-status', {
      execId: 'exec-async-status',
      tool: 'codex',
      mode: 'analysis',
      prompt: 'Track async delegate',
      workDir: 'D:/maestro2',
      startedAt: '2026-04-08T10:00:00.000Z',
    });
    store.appendEntry('exec-async-status', {
      type: 'assistant_message',
      content: 'Collecting context',
      partial: false,
    });

    const { DelegateBrokerClient } = await import('../async/index.js');
    const broker = new DelegateBrokerClient();
    broker.publishEvent({
      jobId: 'exec-async-status',
      type: 'queued',
      status: 'queued',
      payload: { summary: 'Queued' },
      jobMetadata: { tool: 'codex', mode: 'analysis', prompt: 'Track async delegate', workDir: 'D:/maestro2' },
      now: '2026-04-08T10:00:00.000Z',
    });

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map((value) => String(value)).join(' '));
    };

    try {
      const statusProgram = new Command();
      registerDelegateCommand(statusProgram);
      await statusProgram.parseAsync(['delegate', 'status', 'exec-async-status'], { from: 'user' });

      const tailProgram = new Command();
      registerDelegateCommand(tailProgram);
      await tailProgram.parseAsync(['delegate', 'tail', 'exec-async-status', '--events', '1', '--history', '1'], { from: 'user' });

      const cancelProgram = new Command();
      registerDelegateCommand(cancelProgram);
      await cancelProgram.parseAsync(['delegate', 'cancel', 'exec-async-status'], { from: 'user' });
    } finally {
      console.log = originalLog;
    }

    assert.match(logs.join('\n'), /Status: queued/);
    assert.match(logs.join('\n'), /Broker Events/);
    assert.match(logs.join('\n'), /Collecting context/);
    assert.match(logs.join('\n'), /Cancellation requested for exec-async-status/);
  });
});
