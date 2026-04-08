import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('CliAgentRunner', () => {
  const tempHome = mkdtempSync(join(tmpdir(), 'maestro-cli-runner-'));
  let CliAgentRunner: typeof import('./cli-agent-runner.js').CliAgentRunner;
  let CliHistoryStore: typeof import('./cli-history-store.js').CliHistoryStore;

  before(async () => {
    process.env.MAESTRO_HOME = tempHome;
    ({ CliAgentRunner } = await import('./cli-agent-runner.js'));
    ({ CliHistoryStore } = await import('./cli-history-store.js'));
  });

  beforeEach(() => {
    rmSync(tempHome, { recursive: true, force: true });
  });

  after(() => {
    rmSync(tempHome, { recursive: true, force: true });
    delete process.env.MAESTRO_HOME;
  });

  it('publishes lifecycle, snapshot, and final broker events while preserving history', async () => {
    const publishedEvents: Array<Record<string, unknown>> = [];
    const bridgeCalls: string[] = [];
    const adapter = {
      async spawn() {
        return {
          id: 'proc-1',
          type: 'codex',
          status: 'running',
          config: { type: 'codex', prompt: 'final prompt', workDir: 'D:/maestro2' },
          startedAt: '2026-04-07T11:00:00.000Z',
        };
      },
      async stop() {
        return;
      },
      onEntry(processId: string, cb: (entry: Record<string, unknown>) => void) {
        queueMicrotask(() => {
          cb({
            id: 'entry-1',
            processId,
            timestamp: '2026-04-07T11:00:01.000Z',
            type: 'assistant_message',
            content: 'Worker output',
            partial: false,
          });
          cb({
            id: 'entry-2',
            processId,
            timestamp: '2026-04-07T11:00:02.000Z',
            type: 'status_change',
            status: 'stopped',
          });
        });
        return () => {
          return;
        };
      },
    };

    const brokerClient = {
      registerSession() {
        throw new Error('not implemented');
      },
      heartbeat() {
        throw new Error('not implemented');
      },
      publishEvent(input: Record<string, unknown>) {
        publishedEvents.push(input);
        return {
          eventId: publishedEvents.length,
          sequence: publishedEvents.length,
          jobId: String(input.jobId),
          type: String(input.type),
          createdAt: '2026-04-07T11:00:03.000Z',
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
      queueMessage() {
        throw new Error('not implemented');
      },
      listMessages() {
        return [];
      },
      updateMessage() {
        return null;
      },
    };

    const bridge = {
      async tryConnect() {
        return false;
      },
      forwardSpawn() {
        bridgeCalls.push('spawn');
      },
      forwardEntry() {
        bridgeCalls.push('entry');
      },
      forwardStopped() {
        bridgeCalls.push('stopped');
      },
      close() {
        bridgeCalls.push('close');
      },
    };

    const runner = new CliAgentRunner({
      brokerClient,
      createAdapter: async () => adapter,
      createBridge: () => bridge,
      renderEntry: () => undefined,
      now: () => '2026-04-07T11:00:03.000Z',
    });

    const exitCode = await runner.run({
      execId: 'exec-runner',
      prompt: 'Investigate async broker updates',
      tool: 'codex',
      mode: 'analysis',
      workDir: 'D:/maestro2',
    });

    const store = new CliHistoryStore();
    const meta = store.loadMeta('exec-runner');

    assert.equal(exitCode, 0);
    assert.ok(meta);
    assert.equal(meta.exitCode, 0);
    assert.equal(store.getOutput('exec-runner'), 'Worker output');

    assert.deepEqual(
      publishedEvents.map((event) => event.type),
      ['status_update', 'snapshot', 'completed'],
    );
    assert.equal(publishedEvents[0].status, 'running');
    assert.equal(publishedEvents[1].status, 'running');
    assert.equal(publishedEvents[2].status, 'completed');

    const snapshotEvent = publishedEvents[1];
    assert.equal((snapshotEvent.payload as Record<string, unknown>).summary, 'Worker output');
    assert.equal((snapshotEvent.snapshot as Record<string, unknown>).outputPreview, 'Worker output');
    assert.deepEqual(bridgeCalls, ['spawn', 'entry', 'entry', 'stopped', 'close']);
  });

  it('treats a broker cancel request as a cancelled execution and stops the adapter', async () => {
    const publishedEvents: Array<Record<string, unknown>> = [];
    let stopCalls = 0;
    const adapter = {
      async spawn() {
        return {
          id: 'proc-cancel',
          type: 'codex',
          status: 'running',
          config: { type: 'codex', prompt: 'final prompt', workDir: 'D:/maestro2' },
          startedAt: '2026-04-08T09:00:00.000Z',
        };
      },
      async stop() {
        stopCalls += 1;
      },
      onEntry(processId: string, cb: (entry: Record<string, unknown>) => void) {
        queueMicrotask(() => {
          cb({
            id: 'entry-cancel-1',
            processId,
            timestamp: '2026-04-08T09:00:01.000Z',
            type: 'status_change',
            status: 'stopped',
            reason: 'Cancelled',
          });
        });
        return () => undefined;
      },
    };

    const brokerClient = {
      registerSession() {
        throw new Error('not implemented');
      },
      heartbeat() {
        throw new Error('not implemented');
      },
      publishEvent(input: Record<string, unknown>) {
        publishedEvents.push(input);
        return {
          eventId: publishedEvents.length,
          sequence: publishedEvents.length,
          jobId: String(input.jobId),
          type: String(input.type),
          createdAt: '2026-04-08T09:00:02.000Z',
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
        return {
          jobId: 'exec-cancelled',
          status: 'running',
          createdAt: '2026-04-08T09:00:00.000Z',
          updatedAt: '2026-04-08T09:00:01.000Z',
          lastEventId: 1,
          lastEventType: 'cancel_requested',
          latestSnapshot: null,
          metadata: { cancelRequestedAt: '2026-04-08T09:00:01.000Z' },
        };
      },
      listJobEvents() {
        return [];
      },
      requestCancel() {
        throw new Error('not implemented');
      },
      queueMessage() {
        throw new Error('not implemented');
      },
      listMessages() {
        return [];
      },
      updateMessage() {
        return null;
      },
    };

    const runner = new CliAgentRunner({
      brokerClient,
      createAdapter: async () => adapter,
      createBridge: () => ({
        async tryConnect() {
          return false;
        },
        forwardSpawn() {
          return;
        },
        forwardEntry() {
          return;
        },
        forwardStopped() {
          return;
        },
        close() {
          return;
        },
      }),
      renderEntry: () => undefined,
      now: () => '2026-04-08T09:00:02.000Z',
    });

    const exitCode = await runner.run({
      execId: 'exec-cancelled',
      prompt: 'Cancel me',
      tool: 'codex',
      mode: 'analysis',
      workDir: 'D:/maestro2',
    });

    const store = new CliHistoryStore();
    const meta = store.loadMeta('exec-cancelled');
    assert.equal(exitCode, 130);
    assert.equal(stopCalls, 1);
    assert.ok(meta?.cancelledAt);
    assert.equal(meta?.exitCode, 130);
    assert.equal(publishedEvents.at(-1)?.type, 'cancelled');
  });

  it('dispatches queued follow-up messages after successful completion', async () => {
    const publishedEvents: Array<Record<string, unknown>> = [];
    const updatedMessages: Array<Record<string, unknown>> = [];
    const spawnedFollowups: Array<{ execId: string; prompt: string }> = [];
    const adapter = {
      async spawn() {
        return {
          id: 'proc-followup',
          type: 'codex',
          status: 'running',
          config: { type: 'codex', prompt: 'final prompt', workDir: 'D:/maestro2' },
          startedAt: '2026-04-08T10:00:00.000Z',
        };
      },
      async stop() {
        return;
      },
      onEntry(processId: string, cb: (entry: Record<string, unknown>) => void) {
        queueMicrotask(() => {
          cb({
            id: 'entry-followup-1',
            processId,
            timestamp: '2026-04-08T10:00:01.000Z',
            type: 'status_change',
            status: 'stopped',
          });
        });
        return () => undefined;
      },
    };

    const brokerClient = {
      registerSession() {
        throw new Error('not implemented');
      },
      heartbeat() {
        throw new Error('not implemented');
      },
      publishEvent(input: Record<string, unknown>) {
        publishedEvents.push(input);
        return {
          eventId: publishedEvents.length,
          sequence: publishedEvents.length,
          jobId: String(input.jobId),
          type: String(input.type),
          createdAt: '2026-04-08T10:00:02.000Z',
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
      queueMessage() {
        throw new Error('not implemented');
      },
      listMessages() {
        return [{
          messageId: 'msg-1',
          createdAt: '2026-04-08T10:00:01.000Z',
          delivery: 'after_complete',
          message: 'Continue with the next change',
          status: 'queued',
        }];
      },
      updateMessage(input: Record<string, unknown>) {
        updatedMessages.push(input);
        return {
          messageId: 'msg-1',
          createdAt: '2026-04-08T10:00:01.000Z',
          delivery: 'after_complete',
          message: 'Continue with the next change',
          status: String(input.status),
          dispatchedAt: '2026-04-08T10:00:02.000Z',
          dispatchReason: String(input.dispatchReason ?? ''),
        };
      },
    };

    const runner = new CliAgentRunner({
      brokerClient,
      createAdapter: async () => adapter,
      createBridge: () => ({
        async tryConnect() {
          return false;
        },
        forwardSpawn() {
          return;
        },
        forwardEntry() {
          return;
        },
        forwardStopped() {
          return;
        },
        close() {
          return;
        },
      }),
      spawnDetachedDelegate: (_options, execId, prompt) => {
        spawnedFollowups.push({ execId, prompt });
        return true;
      },
      renderEntry: () => undefined,
      now: () => '2026-04-08T10:00:02.000Z',
    });

    const exitCode = await runner.run({
      execId: 'exec-followup',
      prompt: 'Complete current task',
      tool: 'codex',
      mode: 'analysis',
      workDir: 'D:/maestro2',
    });

    assert.equal(exitCode, 0);
    assert.deepEqual(spawnedFollowups, [{
      execId: 'exec-followup',
      prompt: 'Continue with the next change',
    }]);
    assert.equal(updatedMessages.length, 1);
    assert.equal(updatedMessages[0].status, 'dispatched');
    assert.equal(updatedMessages[0].dispatchReason, 'completed');
  });
});
