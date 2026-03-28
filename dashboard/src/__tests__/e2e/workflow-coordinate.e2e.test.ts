import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';

import { createCoordinatorRoutes } from '../../server/coordinator/coordinator-routes.js';
import type { WorkflowCoordinator } from '../../server/coordinator/workflow-coordinator.js';
import type { CoordinateSession, CoordinateStep } from '../../shared/coordinate-types.js';

// ---------------------------------------------------------------------------
// L3 E2E: Workflow Coordinate — Session lifecycle, clarification, stop/resume
//
// Flow: Start session → analyze chain → step transitions → complete
//       Clarification: start → clarification_needed → clarify → resume
//       Stop/Resume: start → stop → resume → continue
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockStep(overrides?: Partial<CoordinateStep>): CoordinateStep {
  return {
    index: 0,
    cmd: 'maestro-plan',
    args: '',
    status: 'pending',
    processId: null,
    analysis: null,
    summary: null,
    ...overrides,
  };
}

function createMockSession(overrides?: Partial<CoordinateSession>): CoordinateSession {
  return {
    sessionId: `coord-${Date.now().toString(36)}`,
    status: 'running',
    intent: 'implement authentication',
    chainName: 'analyze-plan-execute',
    tool: 'claude',
    autoMode: true,
    currentStep: 0,
    steps: [
      createMockStep({ index: 0, cmd: 'maestro-analyze', args: '-q', status: 'completed', summary: 'Analysis done', qualityScore: 85 }),
      createMockStep({ index: 1, cmd: 'maestro-plan', args: '', status: 'running' }),
      createMockStep({ index: 2, cmd: 'maestro-execute', args: '', status: 'pending' }),
    ],
    avgQuality: 85,
    ...overrides,
  };
}

interface CoordinatorState {
  session: CoordinateSession | null;
  clarificationPending: boolean;
}

function createMockCoordinator() {
  const state: CoordinatorState = { session: null, clarificationPending: false };
  const calls: { method: string; args: unknown[] }[] = [];

  const coordinator = {
    start: vi.fn(async (intent: string, opts?: Record<string, unknown>) => {
      calls.push({ method: 'start', args: [intent, opts] });
      state.session = createMockSession({
        intent,
        tool: (opts?.tool as string) ?? 'claude',
        autoMode: (opts?.autoMode as boolean) ?? true,
      });
      return state.session;
    }),

    stop: vi.fn(async () => {
      calls.push({ method: 'stop', args: [] });
      if (state.session) {
        state.session = { ...state.session, status: 'paused' };
      }
    }),

    resume: vi.fn(async (sessionId?: string) => {
      calls.push({ method: 'resume', args: [sessionId] });
      if (state.session) {
        state.session = { ...state.session, status: 'running' };
        return state.session;
      }
      return null;
    }),

    clarify: vi.fn(async (sessionId: string, response: string) => {
      calls.push({ method: 'clarify', args: [sessionId, response] });
      if (state.session && state.session.sessionId === sessionId) {
        state.session = { ...state.session, status: 'running' };
        state.clarificationPending = false;
      }
    }),

    getSession: vi.fn(() => state.session),

    destroy: vi.fn(),
  } as unknown as WorkflowCoordinator;

  return { coordinator, state, calls };
}

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

let app: Hono;
let mock: ReturnType<typeof createMockCoordinator>;

beforeEach(() => {
  mock = createMockCoordinator();
  app = new Hono();
  app.route('/', createCoordinatorRoutes(mock.coordinator));
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function startSession(intent: string, opts?: Record<string, unknown>) {
  const res = await app.request('/api/coordinate/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intent, ...opts }),
  });
  return { res, body: (await res.json()) as Record<string, unknown> };
}

async function getStatus() {
  const res = await app.request('/api/coordinate/status');
  return (await res.json()) as { session: CoordinateSession | null };
}

// ---------------------------------------------------------------------------
// E2E: Coordinate session lifecycle
// ---------------------------------------------------------------------------

describe('E2E: Workflow Coordinate — session lifecycle, clarification, stop/resume', () => {

  // ── Session start + status ──────────────────────────────────────────────
  describe('Session start and status', () => {
    it('starts a coordinate session with intent and returns session state', async () => {
      const { res, body } = await startSession('implement user authentication', { tool: 'gemini', autoMode: true });

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.session).toBeDefined();

      const session = body.session as CoordinateSession;
      expect(session.intent).toBe('implement user authentication');
      expect(session.status).toBe('running');
      expect(session.chainName).toBe('analyze-plan-execute');
      expect(session.steps).toHaveLength(3);

      // Verify coordinator was called with correct args
      expect(mock.calls[0].method).toBe('start');
      expect(mock.calls[0].args[0]).toBe('implement user authentication');
    });

    it('returns session via status endpoint after start', async () => {
      await startSession('build API endpoints');

      const status = await getStatus();
      expect(status.session).not.toBeNull();
      expect(status.session!.intent).toBe('build API endpoints');
      expect(status.session!.status).toBe('running');
    });

    it('returns null session when no session exists', async () => {
      const status = await getStatus();
      expect(status.session).toBeNull();
    });

    it('rejects start without intent', async () => {
      const res = await app.request('/api/coordinate/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain('intent');
    });

    it('returns 500 when starting while session already running', async () => {
      (mock.coordinator.start as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Session already running'),
      );

      const { res, body } = await startSession('conflict intent');
      expect(res.status).toBe(500);
      expect(body.error).toBe('Session already running');
    });
  });

  // ── Session steps and chain analysis ────────────────────────────────────
  describe('Chain steps inspection', () => {
    it('session contains step metadata with correct statuses', async () => {
      const { body } = await startSession('refactor auth module');
      const session = body.session as CoordinateSession;

      // First step completed, second running, third pending
      expect(session.steps[0].status).toBe('completed');
      expect(session.steps[0].cmd).toBe('maestro-analyze');
      expect(session.steps[0].qualityScore).toBe(85);
      expect(session.steps[0].summary).toBe('Analysis done');

      expect(session.steps[1].status).toBe('running');
      expect(session.steps[1].cmd).toBe('maestro-plan');

      expect(session.steps[2].status).toBe('pending');
      expect(session.steps[2].cmd).toBe('maestro-execute');
    });

    it('avgQuality reflects completed steps', async () => {
      const { body } = await startSession('optimize performance');
      const session = body.session as CoordinateSession;
      expect(session.avgQuality).toBe(85);
    });
  });

  // ── Stop and Resume ─────────────────────────────────────────────────────
  describe('Stop and resume', () => {
    it('stops a running session and transitions to paused', async () => {
      await startSession('implement feature');

      // Stop
      const stopRes = await app.request('/api/coordinate/stop', { method: 'POST' });
      expect(stopRes.status).toBe(200);
      const stopBody = (await stopRes.json()) as { ok: boolean };
      expect(stopBody.ok).toBe(true);

      // Verify paused
      const status = await getStatus();
      expect(status.session!.status).toBe('paused');
    });

    it('resumes a paused session', async () => {
      await startSession('implement feature');

      // Stop first
      await app.request('/api/coordinate/stop', { method: 'POST' });

      // Resume
      const resumeRes = await app.request('/api/coordinate/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: mock.state.session!.sessionId }),
      });
      expect(resumeRes.status).toBe(200);
      const resumeBody = (await resumeRes.json()) as { ok: boolean; session: CoordinateSession };
      expect(resumeBody.ok).toBe(true);
      expect(resumeBody.session.status).toBe('running');

      // Verify status endpoint
      const status = await getStatus();
      expect(status.session!.status).toBe('running');
    });

    it('resumes without sessionId (latest session)', async () => {
      await startSession('build dashboard');
      await app.request('/api/coordinate/stop', { method: 'POST' });

      const resumeRes = await app.request('/api/coordinate/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(resumeRes.status).toBe(200);

      expect(mock.calls.find((c) => c.method === 'resume')!.args[0]).toBeUndefined();
    });

    it('returns 404 when no session to resume', async () => {
      // No session started
      (mock.coordinator.resume as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const res = await app.request('/api/coordinate/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain('No session found');
    });

    it('returns 500 when stop throws', async () => {
      (mock.coordinator.stop as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Agent cleanup failed'),
      );

      const res = await app.request('/api/coordinate/stop', { method: 'POST' });
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Agent cleanup failed');
    });
  });

  // ── Clarification flow ─────────────────────────────────────────────────
  describe('Clarification flow', () => {
    it('sends clarification response to coordinator', async () => {
      await startSession('ambiguous intent');
      const sessionId = mock.state.session!.sessionId;

      // Simulate clarification needed (in real flow, this comes via WS event)
      mock.state.session = { ...mock.state.session!, status: 'awaiting_clarification' };
      mock.state.clarificationPending = true;

      // Verify awaiting_clarification state
      const status = await getStatus();
      expect(status.session!.status).toBe('awaiting_clarification');

      // Send clarification
      const clarifyRes = await app.request('/api/coordinate/clarify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, response: 'Use PostgreSQL for the database' }),
      });
      expect(clarifyRes.status).toBe(200);
      const clarifyBody = (await clarifyRes.json()) as { ok: boolean };
      expect(clarifyBody.ok).toBe(true);

      // Verify coordinator received clarification
      const clarifyCalls = mock.calls.filter((c) => c.method === 'clarify');
      expect(clarifyCalls).toHaveLength(1);
      expect(clarifyCalls[0].args[0]).toBe(sessionId);
      expect(clarifyCalls[0].args[1]).toBe('Use PostgreSQL for the database');

      // Verify session resumed to running
      const statusAfter = await getStatus();
      expect(statusAfter.session!.status).toBe('running');
    });

    it('rejects clarify without sessionId', async () => {
      const res = await app.request('/api/coordinate/clarify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: 'some answer' }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain('sessionId');
    });

    it('rejects clarify without response', async () => {
      const res = await app.request('/api/coordinate/clarify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'some-id' }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain('response');
    });

    it('returns 500 when clarify throws', async () => {
      (mock.coordinator.clarify as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Intent classification failed'),
      );

      const res = await app.request('/api/coordinate/clarify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'test-session', response: 'answer' }),
      });
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Intent classification failed');
    });
  });

  // ── Full lifecycle: start → stop → resume → clarify → complete ─────────
  describe('Full coordinate lifecycle', () => {
    it('start → run steps → stop → resume → complete', async () => {
      // Step 1: Start
      const { body: startBody } = await startSession('build notification system', {
        tool: 'claude',
        autoMode: false,
      });
      expect((startBody.session as CoordinateSession).status).toBe('running');

      // Step 2: Check progress
      let status = await getStatus();
      expect(status.session!.steps).toHaveLength(3);
      const completedSteps = status.session!.steps.filter((s) => s.status === 'completed');
      expect(completedSteps.length).toBeGreaterThan(0);

      // Step 3: Stop mid-execution
      await app.request('/api/coordinate/stop', { method: 'POST' });
      status = await getStatus();
      expect(status.session!.status).toBe('paused');

      // Step 4: Resume
      const resumeRes = await app.request('/api/coordinate/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(resumeRes.status).toBe(200);
      status = await getStatus();
      expect(status.session!.status).toBe('running');

      // Step 5: Verify all coordinator methods were called in order
      const methodOrder = mock.calls.map((c) => c.method);
      expect(methodOrder).toEqual(['start', 'stop', 'resume']);
    });

    it('start → clarification → respond → session continues', async () => {
      // Start
      await startSession('implement complex feature');
      const sessionId = mock.state.session!.sessionId;

      // Simulate clarification_needed
      mock.state.session = { ...mock.state.session!, status: 'awaiting_clarification' };

      // Verify paused for clarification
      let status = await getStatus();
      expect(status.session!.status).toBe('awaiting_clarification');

      // Send clarification
      await app.request('/api/coordinate/clarify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, response: 'Use Redis for caching' }),
      });

      // Verify resumed
      status = await getStatus();
      expect(status.session!.status).toBe('running');

      // Verify call sequence
      const methodOrder = mock.calls.map((c) => c.method);
      expect(methodOrder).toEqual(['start', 'clarify']);
    });
  });
});
