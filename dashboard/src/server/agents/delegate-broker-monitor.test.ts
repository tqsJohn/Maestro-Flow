import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentManager } from './agent-manager.js';
import { DelegateBrokerMonitor } from './delegate-broker-monitor.js';
import { DashboardEventBus } from '../state/event-bus.js';

vi.mock('node:fs', () => ({
  appendFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(() => true),
}));

describe('DelegateBrokerMonitor', () => {
  let agentManager: AgentManager;
  let eventBus: DashboardEventBus;

  beforeEach(() => {
    vi.useFakeTimers();
    eventBus = new DashboardEventBus();
    agentManager = new AgentManager(eventBus);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('projects broker events into dashboard agent processes and entries', async () => {
    let polled = false;
    const broker = {
      registerSession: vi.fn(),
      heartbeat: vi.fn(),
      publishEvent: vi.fn(),
      pollEvents: vi.fn(() => {
        if (polled) {
          return [];
        }
        polled = true;
        return [
          {
            eventId: 1,
            sequence: 1,
            jobId: 'job-1',
            type: 'queued',
            createdAt: '2026-04-08T10:00:00.000Z',
            status: 'queued',
            payload: { summary: 'Queued for execution' },
            metadata: { tool: 'codex', prompt: 'Inspect async delegate', workDir: 'D:/maestro2' },
          },
          {
            eventId: 2,
            sequence: 2,
            jobId: 'job-1',
            type: 'snapshot',
            createdAt: '2026-04-08T10:00:01.000Z',
            status: 'running',
            payload: { summary: 'Collecting context' },
          },
          {
            eventId: 3,
            sequence: 3,
            jobId: 'job-1',
            type: 'completed',
            createdAt: '2026-04-08T10:00:02.000Z',
            status: 'completed',
            payload: { summary: 'Finished successfully' },
          },
        ];
      }),
      ack: vi.fn(() => 3),
      getJob: vi.fn(() => ({
        jobId: 'job-1',
        status: 'completed',
        createdAt: '2026-04-08T10:00:00.000Z',
        updatedAt: '2026-04-08T10:00:02.000Z',
        lastEventId: 3,
        lastEventType: 'completed',
        latestSnapshot: { outputPreview: 'Finished successfully' },
        metadata: { tool: 'codex', prompt: 'Inspect async delegate', workDir: 'D:/maestro2' },
      })),
      listJobEvents: vi.fn(() => []),
      requestCancel: vi.fn(),
    };

    const monitor = new DelegateBrokerMonitor({
      agentManager,
      eventBus,
      broker: broker as any,
      pollIntervalMs: 1000,
    });

    monitor.start();
    await (monitor as any).poll();
    monitor.stop();

    const process = agentManager.listProcesses().find((item) => item.id === 'cli-history-job-1');
    expect(process).toBeTruthy();
    expect(process?.status).toBe('stopped');

    const entries = agentManager.getEntries('cli-history-job-1');
    expect(entries.some((entry) => entry.type === 'user_message')).toBe(true);
    expect(entries.some((entry) => entry.type === 'assistant_message')).toBe(true);
    expect(entries.some((entry) => entry.type === 'status_change')).toBe(true);
    expect(broker.ack).toHaveBeenCalled();
  });
});
