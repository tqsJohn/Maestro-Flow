import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TEST_MAESTRO_HOME = join(tmpdir(), 'maestro-async-delegate-tests');
process.env.MAESTRO_HOME = TEST_MAESTRO_HOME;

const { CliHistoryStore } = await import('../agents/cli-history-store.js');
const { DelegateBrokerClient } = await import('../async/index.js');
const { ToolRegistry } = await import('../core/tool-registry.js');
const { registerBuiltinTools } = await import('./index.js');

describe('registerBuiltinTools delegate tools', () => {
  beforeEach(() => {
    mkdirSync(TEST_MAESTRO_HOME, { recursive: true });
  });

  after(() => {
    try {
      rmSync(TEST_MAESTRO_HOME, { recursive: true, force: true });
    } catch {
      // SQLite may still hold the temp file open until process exit.
    }
  });

  it('registers delegate inspection tools', () => {
    const registry = new ToolRegistry();
    registerBuiltinTools(registry);

    const names = registry.list().map((tool) => tool.name);
    assert.ok(names.includes('delegate_message'));
    assert.ok(names.includes('delegate_messages'));
    assert.ok(names.includes('delegate_status'));
    assert.ok(names.includes('delegate_output'));
    assert.ok(names.includes('delegate_tail'));
    assert.ok(names.includes('delegate_cancel'));
  });

  it('returns structured status, output, and tail data from broker and history state', async () => {
    const registry = new ToolRegistry();
    registerBuiltinTools(registry);

    const store = new CliHistoryStore();
    const broker = new DelegateBrokerClient();

    store.saveMeta('job-1', {
      execId: 'job-1',
      tool: 'codex',
      model: 'gpt-5.4',
      mode: 'write',
      prompt: 'Summarize async job state',
      workDir: 'D:/maestro2',
      startedAt: '2026-04-07T02:00:00.000Z',
      completedAt: '2026-04-07T02:05:00.000Z',
      exitCode: 0,
    });
    store.appendEntry('job-1', {
      type: 'assistant_message',
      content: 'Hello from the delegated worker.',
      partial: false,
    });
    store.appendEntry('job-1', {
      type: 'tool_use',
      name: 'read_file',
      status: 'completed',
      result: 'ok',
    });

    broker.registerSession({
      sessionId: 'tools-test-session',
      now: '2026-04-07T02:00:00.000Z',
    });
    broker.publishEvent({
      jobId: 'job-1',
      type: 'snapshot',
      status: 'running',
      snapshot: { phase: 'collect', progress: 50 },
      payload: { summary: 'collecting context' },
      jobMetadata: { tool: 'codex', mode: 'write' },
      now: '2026-04-07T02:01:00.000Z',
    });
    broker.publishEvent({
      jobId: 'job-1',
      type: 'completed',
      status: 'completed',
      payload: { summary: 'done' },
      now: '2026-04-07T02:05:00.000Z',
    });

    const statusResult = await registry.execute('delegate_status', { execId: 'job-1', eventLimit: 2 });
    const statusJson = JSON.parse(statusResult.content[0].text) as Record<string, unknown>;
    assert.equal(statusJson.status, 'completed');
    assert.equal((statusJson.meta as Record<string, unknown>).tool, 'codex');
    assert.equal((statusJson.job as Record<string, unknown>).lastEventType, 'completed');
    assert.equal(((statusJson.recentEvents as Array<Record<string, unknown>>)[0]).type, 'snapshot');

    const outputResult = await registry.execute('delegate_output', { execId: 'job-1' });
    const outputJson = JSON.parse(outputResult.content[0].text) as Record<string, unknown>;
    assert.equal(outputJson.status, 'completed');
    assert.equal(outputJson.output, 'Hello from the delegated worker.');

    const tailResult = await registry.execute('delegate_tail', { execId: 'job-1', limit: 2 });
    const tailJson = JSON.parse(tailResult.content[0].text) as Record<string, unknown>;
    assert.equal((tailJson.events as Array<Record<string, unknown>>).length, 2);
    assert.equal((tailJson.historyTail as Array<Record<string, unknown>>).length, 2);
    assert.equal(((tailJson.historyTail as Array<Record<string, unknown>>)[0]).type, 'assistant_message');
  });

  it('queues follow-up messages for active delegates and exposes them via delegate_messages', async () => {
    const registry = new ToolRegistry();
    registerBuiltinTools(registry);

    const store = new CliHistoryStore();
    const broker = new DelegateBrokerClient();
    store.saveMeta('job-msg', {
      execId: 'job-msg',
      tool: 'codex',
      mode: 'analysis',
      prompt: 'Active delegate',
      workDir: 'D:/maestro2',
      startedAt: '2026-04-08T12:00:00.000Z',
    });
    broker.publishEvent({
      jobId: 'job-msg',
      type: 'status_update',
      status: 'running',
      payload: { summary: 'running' },
      jobMetadata: { tool: 'codex', mode: 'analysis' },
      now: '2026-04-08T12:00:01.000Z',
    });

    const messageResult = await registry.execute('delegate_message', {
      execId: 'job-msg',
      message: 'Refine the plan after current pass',
      delivery: 'after_complete',
    });
    const messageJson = JSON.parse(messageResult.content[0].text) as Record<string, unknown>;
    assert.equal(messageJson.accepted, true);
    assert.equal(messageJson.delivery, 'after_complete');
    assert.equal(messageJson.status, 'running');

    const messagesResult = await registry.execute('delegate_messages', { execId: 'job-msg' });
    const messagesJson = JSON.parse(messagesResult.content[0].text) as Record<string, unknown>;
    const messages = messagesJson.messages as Array<Record<string, unknown>>;
    assert.equal(messages.length, 1);
    assert.equal(messages[0].delivery, 'after_complete');
    assert.equal(messages[0].status, 'queued');

    const statusResult = await registry.execute('delegate_status', { execId: 'job-msg' });
    const statusJson = JSON.parse(statusResult.content[0].text) as Record<string, unknown>;
    const queuedMessages = statusJson.queuedMessages as Array<Record<string, unknown>>;
    assert.equal(queuedMessages.length, 1);
    assert.equal(queuedMessages[0].delivery, 'after_complete');
  });

  it('requests cancellation through the broker for delegate_cancel', async () => {
    const registry = new ToolRegistry();
    registerBuiltinTools(registry);

    const store = new CliHistoryStore();
    store.saveMeta('job-2', {
      execId: 'job-2',
      tool: 'codex',
      mode: 'analysis',
      prompt: 'Check cancel support',
      workDir: 'D:/maestro2',
      startedAt: '2026-04-07T03:00:00.000Z',
    });

    const result = await registry.execute('delegate_cancel', { execId: 'job-2' });
    const json = JSON.parse(result.content[0].text) as Record<string, unknown>;

    assert.equal(json.supported, true);
    assert.equal(json.cancelled, false);
    assert.equal(json.status, 'cancelling');
    assert.match(String(json.message), /Cancellation requested/);
  });
});
