// ---------------------------------------------------------------------------
// Execution REST API routes — dispatch, cancel, status, supervisor control
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import type { ExecutionScheduler } from '../execution/execution-scheduler.js';
import type { AgentType } from '../../shared/agent-types.js';

/**
 * Execution routes following the Hono factory pattern.
 *
 * POST   /api/execution/dispatch       { issueId, executor? }
 * POST   /api/execution/batch          { issueIds, executor?, maxConcurrency? }
 * POST   /api/execution/cancel/:id     cancel running/queued issue
 * GET    /api/execution/status         supervisor status snapshot
 * PUT    /api/execution/supervisor     { enabled, config? }
 */
export function createExecutionRoutes(scheduler: ExecutionScheduler): Hono {
  const app = new Hono();

  // POST /api/execution/dispatch — dispatch single issue
  app.post('/api/execution/dispatch', async (c) => {
    try {
      const body = await c.req.json<Record<string, unknown>>();
      const issueId = body.issueId as string;
      if (!issueId) {
        return c.json({ error: 'Missing "issueId"' }, 400);
      }
      const executor = body.executor as AgentType | undefined;
      await scheduler.executeIssue(issueId, executor);
      return c.json({ ok: true, issueId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  // POST /api/execution/batch — dispatch multiple issues
  app.post('/api/execution/batch', async (c) => {
    try {
      const body = await c.req.json<Record<string, unknown>>();
      const issueIds = body.issueIds as string[];
      if (!Array.isArray(issueIds) || issueIds.length === 0) {
        return c.json({ error: 'Missing or empty "issueIds"' }, 400);
      }
      const executor = body.executor as AgentType | undefined;
      const maxConcurrency = body.maxConcurrency as number | undefined;
      await scheduler.executeBatch(issueIds, executor, maxConcurrency);
      return c.json({ ok: true, count: issueIds.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  // POST /api/execution/cancel/:id — cancel a running/queued issue
  app.post('/api/execution/cancel/:id', async (c) => {
    try {
      const id = c.req.param('id');
      await scheduler.cancelIssue(id);
      return c.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  // GET /api/execution/status — supervisor status snapshot
  app.get('/api/execution/status', (c) => {
    return c.json(scheduler.getStatus());
  });

  // PUT /api/execution/supervisor — toggle supervisor on/off + config
  app.put('/api/execution/supervisor', async (c) => {
    try {
      const body = await c.req.json<Record<string, unknown>>();
      const enabled = body.enabled as boolean | undefined;
      const config = body.config as Record<string, unknown> | undefined;

      if (config) {
        scheduler.updateConfig(config);
      }

      if (enabled === true) {
        scheduler.startSupervisor();
      } else if (enabled === false) {
        scheduler.stopSupervisor();
      }

      return c.json({ ok: true, status: scheduler.getStatus() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  return app;
}
