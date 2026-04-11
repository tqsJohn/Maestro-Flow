import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Hono } from 'hono';

const TEST_MAESTRO_HOME = join(tmpdir(), 'maestro-dashboard-async-followup-e2e');
process.env.MAESTRO_HOME = TEST_MAESTRO_HOME;

const { CliHistoryStore } = await import('../../../../src/agents/cli-history-store.js');
const { DelegateBrokerClient } = await import('../../../../src/async/index.js');
const { DashboardEventBus } = await import('../../server/state/event-bus.js');
const { AgentManager } = await import('../../server/agents/agent-manager.js');
const { DelegateBrokerMonitor } = await import('../../server/agents/delegate-broker-monitor.js');
const { AgentWsHandler } = await import('../../server/ws/handlers/agent-handler.js');
const { createCliHistoryRoutes } = await import('../../server/routes/cli-history.js');
const { createAgentRoutes } = await import('../../server/routes/agents.js');

class MockWebSocket {
  readyState = 1;
  sent: string[] = [];

  send(data: string): void {
    this.sent.push(data);
  }
}

describe('E2E: async delegate follow-up channel', () => {
  let historyStore: InstanceType<typeof CliHistoryStore>;
  let broker: InstanceType<typeof DelegateBrokerClient>;
  let eventBus: InstanceType<typeof DashboardEventBus>;
  let agentManager: InstanceType<typeof AgentManager>;
  let monitor: InstanceType<typeof DelegateBrokerMonitor>;
  let handler: InstanceType<typeof AgentWsHandler>;
  let app: Hono;

  beforeEach(async () => {
    try {
      await rm(TEST_MAESTRO_HOME, { recursive: true, force: true });
    } catch {
      // SQLite temp files may still be held briefly.
    }
    await mkdir(TEST_MAESTRO_HOME, { recursive: true });

    historyStore = new CliHistoryStore();
    broker = new DelegateBrokerClient();
    eventBus = new DashboardEventBus();
    agentManager = new AgentManager(eventBus);
    monitor = new DelegateBrokerMonitor({
      agentManager,
      eventBus,
      broker,
      pollIntervalMs: 60_000,
    });
    handler = new AgentWsHandler(agentManager, eventBus, 'D:/maestro2/.workflow');

    app = new Hono();
    app.route('/', createCliHistoryRoutes());
    app.route('/', createAgentRoutes(agentManager));
  });

  afterEach(async () => {
    monitor.stop();
    eventBus.removeAllListeners();
    try {
      await rm(TEST_MAESTRO_HOME, { recursive: true, force: true });
    } catch {
      // SQLite temp files may still be held briefly.
    }
  });

  it('queues after_complete follow-ups through WS and exposes them via REST plus synthetic chat entries', async () => {
    historyStore.saveMeta('job-e2e-after', {
      execId: 'job-e2e-after',
      tool: 'codex',
      mode: 'analysis',
      prompt: 'Inspect async delegate flow',
      workDir: 'D:/maestro2',
      startedAt: '2026-04-08T10:00:00.000Z',
    });
    broker.publishEvent({
      jobId: 'job-e2e-after',
      type: 'queued',
      status: 'running',
      payload: { summary: 'Delegate started' },
      jobMetadata: {
        tool: 'codex',
        mode: 'analysis',
        workDir: 'D:/maestro2',
        prompt: 'Inspect async delegate flow',
      },
      now: '2026-04-08T10:00:00.000Z',
    });

    monitor.start();
    await (monitor as any).poll();

    const ws = new MockWebSocket();
    const broadcast = vi.fn() as unknown as (
      type: import('../../shared/ws-protocol.js').WsEventType,
      data: unknown,
    ) => void;

    await handler.handle('delegate:message', {
      action: 'delegate:message',
      processId: 'cli-history-job-e2e-after',
      content: 'Continue after the current pass',
      delivery: 'after_complete',
    }, ws as any, broadcast);

    await (monitor as any).poll();

    const messagesRes = await app.request('/api/cli-history/job-e2e-after/messages');
    expect(messagesRes.status).toBe(200);
    const messages = await messagesRes.json() as Array<Record<string, unknown>>;
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      delivery: 'after_complete',
      message: 'Continue after the current pass',
      status: 'queued',
    });

    const entriesRes = await app.request('/api/agents/cli-history-job-e2e-after/entries');
    expect(entriesRes.status).toBe(200);
    const entries = await entriesRes.json() as Array<Record<string, unknown>>;
    expect(entries.some((entry) => entry.type === 'user_message' && entry.content === 'Inspect async delegate flow')).toBe(true);
    expect(entries.some((entry) => entry.type === 'user_message' && entry.content === 'Continue after the current pass')).toBe(true);

    const process = agentManager.listProcesses().find((item) => item.id === 'cli-history-job-e2e-after');
    expect(process?.interactive).toBe(true);
    expect(process?.status).toBe('running');
  });

  it('queues inject follow-ups through WS for CLI poller pickup', async () => {
    historyStore.saveMeta('job-e2e-inject', {
      execId: 'job-e2e-inject',
      tool: 'codex',
      mode: 'analysis',
      prompt: 'Inject-capable async delegate',
      workDir: 'D:/maestro2',
      startedAt: '2026-04-08T10:05:00.000Z',
    });
    broker.publishEvent({
      jobId: 'job-e2e-inject',
      type: 'queued',
      status: 'running',
      payload: { summary: 'Delegate started' },
      jobMetadata: {
        tool: 'codex',
        mode: 'analysis',
        workDir: 'D:/maestro2',
        prompt: 'Inject-capable async delegate',
      },
      now: '2026-04-08T10:05:00.000Z',
    });

    monitor.start();
    await (monitor as any).poll();

    await handler.handle('delegate:message', {
      action: 'delegate:message',
      processId: 'cli-history-job-e2e-inject',
      content: 'Inject this follow-up message',
      delivery: 'inject',
    }, new MockWebSocket() as any, vi.fn() as any);

    await (monitor as any).poll();

    // inject delivery queues the message for CLI poller pickup — no cancel at dashboard level
    const messagesRes = await app.request('/api/cli-history/job-e2e-inject/messages');
    expect(messagesRes.status).toBe(200);
    const messages = await messagesRes.json() as Array<Record<string, unknown>>;
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      delivery: 'inject',
      message: 'Inject this follow-up message',
      status: 'queued',
    });

    // Process stays running — cancel/inject decision is made by CLI runner poller
    const process = agentManager.listProcesses().find((item) => item.id === 'cli-history-job-e2e-inject');
    expect(process?.status).toBe('running');

    const entries = agentManager.getEntries('cli-history-job-e2e-inject');
    expect(entries.some((entry) => entry.type === 'user_message' && entry.content === 'Inject this follow-up message')).toBe(true);
  });
});
