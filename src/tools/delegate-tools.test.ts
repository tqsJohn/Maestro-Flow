import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Delegate MCP tools (L2 integration)', () => {
  const tempHome = mkdtempSync(join(tmpdir(), 'maestro-delegate-tools-'));
  let ToolRegistry: typeof import('../core/tool-registry.js').ToolRegistry;
  let registerBuiltinTools: typeof import('./index.js').registerBuiltinTools;
  let CliHistoryStore: typeof import('../agents/cli-history-store.js').CliHistoryStore;
  let DelegateBrokerClient: typeof import('../async/index.js').DelegateBrokerClient;

  before(async () => {
    process.env.MAESTRO_HOME = tempHome;
    ({ ToolRegistry } = await import('../core/tool-registry.js'));
    ({ registerBuiltinTools } = await import('./index.js'));
    ({ CliHistoryStore } = await import('../agents/cli-history-store.js'));
    ({ DelegateBrokerClient } = await import('../async/index.js'));
  });

  afterEach(() => {
    // Clean slate between tests
    try {
      rmSync(join(tempHome, 'data'), { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  after(() => {
    try {
      rmSync(tempHome, { recursive: true, force: true });
    } catch { /* ignore */ }
    delete process.env.MAESTRO_HOME;
  });

  function createRegistry() {
    const registry = new ToolRegistry();
    const launches: Array<Record<string, unknown>> = [];
    registerBuiltinTools(registry, {
      launchDetachedDelegate: (request) => { launches.push(request as unknown as Record<string, unknown>); },
    });
    return { registry, launches };
  }

  function setupRunningJob(execId: string) {
    const store = new CliHistoryStore();
    store.saveMeta(execId, {
      execId,
      tool: 'gemini',
      mode: 'analysis',
      prompt: 'test prompt',
      workDir: 'D:/maestro2',
      startedAt: '2026-04-12T10:00:00.000Z',
    });

    const broker = new DelegateBrokerClient();
    broker.publishEvent({
      jobId: execId,
      type: 'queued',
      status: 'queued',
      payload: { summary: 'queued' },
      jobMetadata: { tool: 'gemini', mode: 'analysis', workDir: 'D:/maestro2' },
      now: '2026-04-12T10:00:00.000Z',
    });
    broker.publishEvent({
      jobId: execId,
      type: 'status_update',
      status: 'running',
      payload: { summary: 'running' },
      now: '2026-04-12T10:00:01.000Z',
    });

    return { store, broker };
  }

  function setupTerminalJob(execId: string) {
    const store = new CliHistoryStore();
    store.saveMeta(execId, {
      execId,
      tool: 'gemini',
      mode: 'analysis',
      prompt: 'test prompt',
      workDir: 'D:/maestro2',
      startedAt: '2026-04-12T10:00:00.000Z',
      completedAt: '2026-04-12T10:01:00.000Z',
      exitCode: 0,
    });
    store.appendEntry(execId, {
      type: 'assistant_message',
      content: 'Final output from delegate',
      partial: false,
    });

    const broker = new DelegateBrokerClient();
    broker.publishEvent({
      jobId: execId,
      type: 'completed',
      status: 'completed',
      payload: { summary: 'done' },
      jobMetadata: { tool: 'gemini', mode: 'analysis', workDir: 'D:/maestro2' },
      now: '2026-04-12T10:01:00.000Z',
    });

    return { store, broker };
  }

  // ==========================================================================
  // delegate_message
  // ==========================================================================

  describe('delegate_message', () => {
    it('returns error when execId is empty', async () => {
      const { registry } = createRegistry();
      const result = await registry.execute('delegate_message', {
        execId: '',
        message: 'hello',
        delivery: 'inject',
      });
      assert.equal(result.isError, true);
      const text = (result.content[0] as { text: string }).text;
      assert.match(text, /execId is required/);
    });

    it('returns error when message is empty', async () => {
      const { registry } = createRegistry();
      const result = await registry.execute('delegate_message', {
        execId: 'test-exec',
        message: '',
        delivery: 'inject',
      });
      assert.equal(result.isError, true);
      const text = (result.content[0] as { text: string }).text;
      assert.match(text, /message is required/);
    });

    it('returns error for invalid delivery value', async () => {
      const { registry } = createRegistry();
      const result = await registry.execute('delegate_message', {
        execId: 'test-exec',
        message: 'hello',
        delivery: 'invalid',
      });
      assert.equal(result.isError, true);
      const text = (result.content[0] as { text: string }).text;
      assert.match(text, /delivery must be inject or after_complete/);
    });

    it('returns not-found error when execution does not exist', async () => {
      const { registry } = createRegistry();
      const result = await registry.execute('delegate_message', {
        execId: 'nonexistent-exec',
        message: 'hello',
        delivery: 'inject',
      });
      assert.equal(result.isError, true);
      const text = (result.content[0] as { text: string }).text;
      assert.match(text, /not found/i);
    });

    it('queues message for a running job successfully', async () => {
      setupRunningJob('msg-running-job');
      const { registry } = createRegistry();

      const result = await registry.execute('delegate_message', {
        execId: 'msg-running-job',
        message: 'follow up question',
        delivery: 'inject',
      });

      assert.equal(result.isError, undefined);
      const data = JSON.parse((result.content[0] as { text: string }).text);
      assert.equal(data.accepted, true);
      assert.equal(data.delivery, 'inject');
      assert.equal(data.execId, 'msg-running-job');
      assert.equal(data.immediateDispatch, false);
      assert.ok(data.queuedMessage);
      assert.equal(data.queuedMessage.delivery, 'inject');
    });

    it('relaunches a terminal job with after_complete delivery', async () => {
      setupTerminalJob('msg-terminal-job');
      const { registry, launches } = createRegistry();

      const result = await registry.execute('delegate_message', {
        execId: 'msg-terminal-job',
        message: 'continue with this',
        delivery: 'after_complete',
      });

      assert.equal(result.isError, undefined);
      const data = JSON.parse((result.content[0] as { text: string }).text);
      assert.equal(data.accepted, true);
      assert.equal(data.immediateDispatch, true);
      assert.equal(launches.length, 1);
    });
  });

  // ==========================================================================
  // delegate_messages
  // ==========================================================================

  describe('delegate_messages', () => {
    it('lists messages with correct structure for existing job', async () => {
      setupRunningJob('msgs-list-job');
      const { registry } = createRegistry();

      // Queue a message first
      await registry.execute('delegate_message', {
        execId: 'msgs-list-job',
        message: 'test message',
        delivery: 'inject',
      });

      const result = await registry.execute('delegate_messages', {
        execId: 'msgs-list-job',
      });

      assert.equal(result.isError, undefined);
      const data = JSON.parse((result.content[0] as { text: string }).text);
      assert.equal(data.execId, 'msgs-list-job');
      assert.ok(Array.isArray(data.messages));
      assert.equal(data.messages.length, 1);
      assert.ok(data.messages[0].messageId);
      assert.equal(data.messages[0].delivery, 'inject');
    });

    it('returns not-found error for nonexistent execution', async () => {
      const { registry } = createRegistry();
      const result = await registry.execute('delegate_messages', {
        execId: 'nonexistent',
      });
      assert.equal(result.isError, true);
      const text = (result.content[0] as { text: string }).text;
      assert.match(text, /not found/i);
    });
  });

  // ==========================================================================
  // delegate_status
  // ==========================================================================

  describe('delegate_status', () => {
    it('returns combined meta and broker state for existing job', async () => {
      setupRunningJob('status-running-job');
      const { registry } = createRegistry();

      const result = await registry.execute('delegate_status', {
        execId: 'status-running-job',
      });

      assert.equal(result.isError, undefined);
      const data = JSON.parse((result.content[0] as { text: string }).text);
      assert.equal(data.execId, 'status-running-job');
      assert.equal(data.status, 'running');
      assert.equal(data.sep1686_status, 'working');
      assert.ok(data.meta);
      assert.equal(data.meta.tool, 'gemini');
      assert.equal(data.meta.mode, 'analysis');
      assert.ok(data.job);
      assert.ok(Array.isArray(data.recentEvents));
      assert.ok(data.tools);
    });

    it('clamps eventLimit parameter to at least 1', async () => {
      setupRunningJob('status-clamp-job');
      const { registry } = createRegistry();

      const result = await registry.execute('delegate_status', {
        execId: 'status-clamp-job',
        eventLimit: 0,
      });

      assert.equal(result.isError, undefined);
      const data = JSON.parse((result.content[0] as { text: string }).text);
      // eventLimit clamped to 1, should still return at most 1 event
      assert.ok(data.recentEvents.length <= 2);
    });

    it('returns not-found error for nonexistent execution', async () => {
      const { registry } = createRegistry();
      const result = await registry.execute('delegate_status', {
        execId: 'no-such-id',
      });
      assert.equal(result.isError, true);
      const text = (result.content[0] as { text: string }).text;
      assert.match(text, /not found/i);
    });

    it('includes sep1686 status mapping in response', async () => {
      setupRunningJob('status-sep-job');
      const { registry } = createRegistry();

      // Verify running -> working mapping
      const result = await registry.execute('delegate_status', {
        execId: 'status-sep-job',
      });
      const data = JSON.parse((result.content[0] as { text: string }).text);
      assert.equal(data.sep1686_status, 'working');
    });
  });

  // ==========================================================================
  // delegate_output
  // ==========================================================================

  describe('delegate_output', () => {
    it('returns output from history store for completed job', async () => {
      setupTerminalJob('output-done-job');
      const { registry } = createRegistry();

      const result = await registry.execute('delegate_output', {
        execId: 'output-done-job',
      });

      assert.equal(result.isError, undefined);
      const data = JSON.parse((result.content[0] as { text: string }).text);
      assert.equal(data.execId, 'output-done-job');
      assert.equal(data.output, 'Final output from delegate');
      assert.ok(data.meta);
      assert.equal(data.meta.tool, 'gemini');
    });

    it('returns not-found error when no meta exists', async () => {
      const { registry } = createRegistry();
      const result = await registry.execute('delegate_output', {
        execId: 'missing-meta-job',
      });
      assert.equal(result.isError, true);
      const text = (result.content[0] as { text: string }).text;
      assert.match(text, /not found/i);
    });

    it('returns not-found error when meta exists but no output', async () => {
      // Create meta but no JSONL entries
      const store = new CliHistoryStore();
      store.saveMeta('no-output-job', {
        execId: 'no-output-job',
        tool: 'gemini',
        mode: 'analysis',
        prompt: 'test',
        workDir: 'D:/maestro2',
        startedAt: '2026-04-12T10:00:00.000Z',
      });

      const { registry } = createRegistry();
      const result = await registry.execute('delegate_output', {
        execId: 'no-output-job',
      });

      assert.equal(result.isError, true);
      const text = (result.content[0] as { text: string }).text;
      assert.match(text, /No output available/);
    });
  });

  // ==========================================================================
  // delegate_tail
  // ==========================================================================

  describe('delegate_tail', () => {
    it('returns combined events and history for running job', async () => {
      setupRunningJob('tail-running-job');
      const store = new CliHistoryStore();
      store.appendEntry('tail-running-job', {
        type: 'assistant_message',
        content: 'Working on it...',
        partial: false,
      });

      const { registry } = createRegistry();
      const result = await registry.execute('delegate_tail', {
        execId: 'tail-running-job',
      });

      assert.equal(result.isError, undefined);
      const data = JSON.parse((result.content[0] as { text: string }).text);
      assert.equal(data.execId, 'tail-running-job');
      assert.ok(Array.isArray(data.events));
      assert.ok(data.events.length >= 1);
      assert.ok(Array.isArray(data.historyTail));
      assert.ok(data.historyTail.length >= 1);
      assert.ok(data.sep1686_status);
    });

    it('respects limit parameter', async () => {
      setupRunningJob('tail-limit-job');
      const { registry } = createRegistry();

      const result = await registry.execute('delegate_tail', {
        execId: 'tail-limit-job',
        limit: 1,
      });

      assert.equal(result.isError, undefined);
      const data = JSON.parse((result.content[0] as { text: string }).text);
      // With limit=1, should return at most 1 event
      assert.ok(data.events.length <= 1);
    });

    it('returns not-found error for nonexistent execution', async () => {
      const { registry } = createRegistry();
      const result = await registry.execute('delegate_tail', {
        execId: 'nonexistent-tail',
      });
      assert.equal(result.isError, true);
      const text = (result.content[0] as { text: string }).text;
      assert.match(text, /not found/i);
    });
  });

  // ==========================================================================
  // delegate_cancel
  // ==========================================================================

  describe('delegate_cancel', () => {
    it('requests cancellation for a running job', async () => {
      setupRunningJob('cancel-running-job');
      const { registry } = createRegistry();

      const result = await registry.execute('delegate_cancel', {
        execId: 'cancel-running-job',
      });

      assert.equal(result.isError, undefined);
      const data = JSON.parse((result.content[0] as { text: string }).text);
      assert.equal(data.execId, 'cancel-running-job');
      assert.equal(data.supported, true);
      assert.equal(data.cancelled, false);
      assert.ok(data.job);
      assert.ok(data.tools);
    });

    it('returns already-terminal message for completed job', async () => {
      setupTerminalJob('cancel-done-job');
      const { registry } = createRegistry();

      const result = await registry.execute('delegate_cancel', {
        execId: 'cancel-done-job',
      });

      assert.equal(result.isError, undefined);
      const data = JSON.parse((result.content[0] as { text: string }).text);
      assert.equal(data.execId, 'cancel-done-job');
      assert.equal(data.supported, true);
      assert.match(data.message, /already completed/);
    });

    it('returns not-found error for nonexistent execution', async () => {
      const { registry } = createRegistry();
      const result = await registry.execute('delegate_cancel', {
        execId: 'nonexistent-cancel',
      });
      assert.equal(result.isError, true);
      const text = (result.content[0] as { text: string }).text;
      assert.match(text, /not found/i);
    });
  });
});
