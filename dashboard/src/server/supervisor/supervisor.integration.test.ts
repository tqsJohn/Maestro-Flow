import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';

import { DashboardEventBus } from '../state/event-bus.js';
import { TaskSchedulerService } from './task-scheduler-service.js';
import { SelfLearningService } from './self-learning-service.js';
import { ExtensionManager } from './extension-manager.js';
import { createSupervisorRoutes } from '../routes/supervisor.js';
import type { JournalEvent } from '../../shared/journal-types.js';
import type { ScheduledTask } from '../../shared/schedule-types.js';

// ---------------------------------------------------------------------------
// Minimal mocks for external dependencies only
// ---------------------------------------------------------------------------

class MockJournal {
  private events: JournalEvent[] = [];

  addEvent(event: JournalEvent): void { this.events.push(event); }
  async readAll(): Promise<JournalEvent[]> { return [...this.events]; }
  async getEventsForIssue(issueId: string): Promise<JournalEvent[]> {
    return this.events.filter((e) => e.issueId === issueId);
  }
}

class MockAgentManager {
  listAdapterTypes(): string[] { return ['claude-code', 'gemini']; }
}

class MockPromptRegistry {
  private builders = new Map<string, { name: string; build: (ctx: any) => Promise<string> }>([
    ['direct', { name: 'direct', build: async (ctx: any) => `Direct: ${JSON.stringify(ctx)}` }],
  ]);
  register(b: any): void { this.builders.set(b.name, b); }
  get(name: string) { return this.builders.get(name); }
  list(): string[] { return Array.from(this.builders.keys()); }
}

function makeEvent(
  type: string, issueId: string, timestamp: string,
  extra: Record<string, unknown> = {},
): JournalEvent {
  const base = { type, issueId, timestamp, ...extra };
  if (type === 'issue:dispatched') return { ...base, processId: extra.processId ?? 'pid', executor: extra.executor ?? 'unknown' } as JournalEvent;
  if (type === 'issue:completed') return { ...base, processId: extra.processId ?? 'pid' } as JournalEvent;
  if (type === 'issue:failed') return { ...base, processId: extra.processId ?? 'pid', error: extra.error ?? 'err', retryCount: 0 } as JournalEvent;
  return base as JournalEvent;
}

function req(app: Hono, method: string, path: string, body?: unknown) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  return app.request(path, init);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Supervisor Integration', () => {
  let workflowRoot: string;
  let eventBus: DashboardEventBus;
  let journal: MockJournal;
  let schedulerService: TaskSchedulerService;
  let learningService: SelfLearningService;
  let extensionManager: ExtensionManager;
  let promptRegistry: MockPromptRegistry;
  let app: Hono;

  beforeEach(async () => {
    workflowRoot = join(tmpdir(), `test-supervisor-integ-${randomUUID()}`);
    await mkdir(workflowRoot, { recursive: true });

    eventBus = new DashboardEventBus();
    journal = new MockJournal();
    promptRegistry = new MockPromptRegistry();

    schedulerService = new TaskSchedulerService(eventBus, workflowRoot);
    await schedulerService.start();

    learningService = new SelfLearningService(eventBus, journal as any, workflowRoot);

    extensionManager = new ExtensionManager(
      eventBus,
      new MockAgentManager() as any,
      promptRegistry as any,
    );
    extensionManager.init();

    app = createSupervisorRoutes(
      learningService as any,
      schedulerService as any,
      extensionManager as any,
      promptRegistry as any,
    );
  });

  afterEach(async () => {
    schedulerService.stop();
    eventBus.removeAllListeners();
    await rm(workflowRoot, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // REST → TaskSchedulerService (real service)
  // -------------------------------------------------------------------------
  describe('REST → TaskSchedulerService (real service)', () => {
    it('POST+GET: created task appears in list', async () => {
      const createRes = await req(app, 'POST', '/api/supervisor/schedules', {
        name: 'Integ Test',
        cronExpression: '0 * * * *',
        taskType: 'health-check',
        enabled: false,
        config: {},
      });
      expect(createRes.status).toBe(200);
      const created = (await createRes.json() as { task: ScheduledTask }).task;

      const listRes = await req(app, 'GET', '/api/supervisor/schedules');
      expect(listRes.status).toBe(200);
      const { tasks } = await listRes.json() as { tasks: ScheduledTask[] };
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe(created.id);
      expect(tasks[0].name).toBe('Integ Test');
    });

    it('POST+PUT+DELETE: full CRUD lifecycle', async () => {
      // Create
      const createRes = await req(app, 'POST', '/api/supervisor/schedules', {
        name: 'CRUD',
        cronExpression: '0 * * * *',
        taskType: 'custom',
        enabled: false,
        config: {},
      });
      const { task: created } = await createRes.json() as { task: ScheduledTask };

      // Update
      const updateRes = await req(app, 'PUT', `/api/supervisor/schedules/${created.id}`, {
        name: 'CRUD Updated',
        enabled: true,
      });
      expect(updateRes.status).toBe(200);
      const { task: updated } = await updateRes.json() as { task: ScheduledTask };
      expect(updated.name).toBe('CRUD Updated');
      expect(updated.enabled).toBe(true);

      // Verify via list
      const listRes = await req(app, 'GET', '/api/supervisor/schedules');
      const { tasks } = await listRes.json() as { tasks: ScheduledTask[] };
      expect(tasks[0].name).toBe('CRUD Updated');

      // Delete
      const deleteRes = await req(app, 'DELETE', `/api/supervisor/schedules/${created.id}`);
      expect(deleteRes.status).toBe(200);

      // Verify gone
      const list2 = await req(app, 'GET', '/api/supervisor/schedules');
      const { tasks: remaining } = await list2.json() as { tasks: ScheduledTask[] };
      expect(remaining).toHaveLength(0);
    });

    it('POST+run: manual trigger records history', async () => {
      const createRes = await req(app, 'POST', '/api/supervisor/schedules', {
        name: 'Run Me',
        cronExpression: '0 * * * *',
        taskType: 'health-check',
        enabled: false,
        config: {},
      });
      const { task: created } = await createRes.json() as { task: ScheduledTask };

      const runRes = await req(app, 'POST', `/api/supervisor/schedules/${created.id}/run`);
      expect(runRes.status).toBe(200);
      const { result } = await runRes.json() as { result: { status: string } };
      expect(result.status).toBe('success');

      // Verify history via direct service access
      const task = schedulerService.getTask(created.id);
      expect(task!.history).toHaveLength(1);
      expect(task!.lastRun).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // REST → SelfLearningService (real service)
  // -------------------------------------------------------------------------
  describe('REST → SelfLearningService (real service)', () => {
    it('GET stats returns live data after analyze()', async () => {
      journal.addEvent(makeEvent('issue:dispatched', 'INT-1', '2026-01-01T00:00:00Z', { executor: 'gemini' }));
      journal.addEvent(makeEvent('issue:completed', 'INT-1', '2026-01-01T00:05:00Z'));

      await learningService.analyze();

      const res = await req(app, 'GET', '/api/supervisor/learning/stats');
      expect(res.status).toBe(200);
      const data = await res.json() as { totalCommands: number; uniquePatterns: number };
      expect(data.totalCommands).toBe(1);
      expect(data.uniquePatterns).toBe(1);
    });

    it('GET kb returns entries after addKnowledgeEntry()', async () => {
      await learningService.addKnowledgeEntry({
        topic: 'Integration',
        content: 'Integration test kb entry',
        source: 'manual',
        tags: ['test'],
      });

      const res = await req(app, 'GET', '/api/supervisor/learning/kb');
      expect(res.status).toBe(200);
      const { entries } = await res.json() as { entries: { topic: string }[] };
      expect(entries).toHaveLength(1);
      expect(entries[0].topic).toBe('Integration');
    });
  });

  // -------------------------------------------------------------------------
  // EventBus → SelfLearningService incremental update
  // -------------------------------------------------------------------------
  describe('EventBus → SelfLearningService incremental', () => {
    it('execution:completed updates pattern via event bus', async () => {
      const issueId = 'EVT-001';
      journal.addEvent(makeEvent('issue:dispatched', issueId, '2026-01-01T00:00:00Z', { executor: 'codex' }));
      journal.addEvent(makeEvent('issue:completed', issueId, '2026-01-01T00:01:00Z'));

      eventBus.emit('execution:completed', { issueId, processId: 'p1' } as any);
      await new Promise((r) => setTimeout(r, 500));

      const patterns = learningService.getPatterns();
      const codex = patterns.find((p) => p.command === 'codex');
      expect(codex).toBeDefined();
      expect(codex!.successRate).toBe(1);
      expect(codex!.frequency).toBe(1);
    });

    it('execution:failed updates pattern with 0 success rate', async () => {
      const issueId = 'EVT-002';
      journal.addEvent(makeEvent('issue:dispatched', issueId, '2026-01-01T00:00:00Z', { executor: 'fail-exec' }));
      journal.addEvent(makeEvent('issue:failed', issueId, '2026-01-01T00:01:00Z'));

      eventBus.emit('execution:failed', { issueId, processId: 'p2', error: 'timeout' } as any);
      await new Promise((r) => setTimeout(r, 500));

      const patterns = learningService.getPatterns();
      const p = patterns.find((x) => x.command === 'fail-exec');
      expect(p).toBeDefined();
      expect(p!.successRate).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // ExtensionManager → REST
  // -------------------------------------------------------------------------
  describe('ExtensionManager → REST', () => {
    it('init() extensions appear in GET /extensions', async () => {
      const res = await req(app, 'GET', '/api/supervisor/extensions');
      expect(res.status).toBe(200);
      const { extensions } = await res.json() as { extensions: { name: string; type: string }[] };

      // 1 builder (direct) + 2 adapters (claude-code, gemini) = 3
      expect(extensions).toHaveLength(3);

      const builders = extensions.filter((e) => e.type === 'builder');
      const adapters = extensions.filter((e) => e.type === 'adapter');
      expect(builders).toHaveLength(1);
      expect(builders[0].name).toBe('direct');
      expect(adapters).toHaveLength(2);
    });
  });
});
