import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the Agent SDK before importing CommanderAgent
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

import { CommanderAgent } from './commander-agent.js';
import { DEFAULT_COMMANDER_CONFIG } from '../../shared/commander-types.js';
import type { CommanderConfig, Assessment, PriorityAction, Decision } from '../../shared/commander-types.js';
import type { DashboardEventBus } from '../state/event-bus.js';
import type { StateManager } from '../state/state-manager.js';
import type { ExecutionScheduler } from '../execution/execution-scheduler.js';
import type { AgentManager } from '../agents/agent-manager.js';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockEventBus(): DashboardEventBus {
  return {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as DashboardEventBus;
}

function createMockStateManager(): StateManager {
  return {
    getProject: vi.fn().mockReturnValue({
      name: 'test-project',
      current_phase: null,
    }),
    getPhase: vi.fn().mockReturnValue(undefined),
  } as unknown as StateManager;
}

function createMockExecutionScheduler(): ExecutionScheduler {
  return {
    getStatus: vi.fn().mockReturnValue({
      running: [],
      queued: [],
      stats: { totalCompleted: 0, totalFailed: 0 },
    }),
    executeIssue: vi.fn().mockResolvedValue(undefined),
  } as unknown as ExecutionScheduler;
}

function createMockAgentManager(): AgentManager {
  return {} as AgentManager;
}

function createAgent(configOverride?: Partial<CommanderConfig>): {
  agent: CommanderAgent;
  eventBus: ReturnType<typeof createMockEventBus>;
  stateManager: ReturnType<typeof createMockStateManager>;
  scheduler: ReturnType<typeof createMockExecutionScheduler>;
} {
  const eventBus = createMockEventBus();
  const stateManager = createMockStateManager();
  const scheduler = createMockExecutionScheduler();
  const agentManager = createMockAgentManager();

  const agent = new CommanderAgent(
    eventBus,
    stateManager,
    scheduler,
    agentManager,
    '/tmp/test-workflow',
    configOverride,
  );

  return { agent, eventBus, stateManager, scheduler };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CommanderAgent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Lifecycle ---
  describe('lifecycle', () => {
    it('initializes with idle status', () => {
      const { agent } = createAgent();
      const state = agent.getState();

      expect(state.status).toBe('idle');
      expect(state.tickCount).toBe(0);
      expect(state.lastDecision).toBeNull();
      expect(state.activeWorkers).toBe(0);
      expect(state.sessionId).toBeTruthy();
    });

    it('stop sets status to idle', () => {
      const { agent } = createAgent();
      agent.stop();
      expect(agent.getState().status).toBe('idle');
    });

    it('pause sets status to paused', () => {
      const { agent } = createAgent();
      agent.pause();
      expect(agent.getState().status).toBe('paused');
    });

    it('resume from paused sets status to idle', () => {
      const { agent } = createAgent();
      agent.pause();
      expect(agent.getState().status).toBe('paused');

      agent.resume();
      expect(agent.getState().status).toBe('idle');
    });

    it('resume does nothing if not paused', () => {
      const { agent } = createAgent();
      // status is 'idle', not 'paused'
      agent.resume();
      expect(agent.getState().status).toBe('idle');
    });

    it('stop clears timers', () => {
      const { agent } = createAgent();
      // Simulate start by directly checking stop behavior
      agent.stop();
      // No timers should throw
      agent.stop(); // double stop should be safe
      expect(agent.getState().status).toBe('idle');
    });
  });

  // --- updateConfig ---
  describe('updateConfig', () => {
    it('updates config fields', () => {
      const { agent } = createAgent();
      agent.updateConfig({ maxConcurrentWorkers: 10 });
      expect(agent.getConfig().maxConcurrentWorkers).toBe(10);
    });

    it('applies profile preset when switching profiles', () => {
      const { agent } = createAgent();
      agent.updateConfig({ profile: 'production' });

      const config = agent.getConfig();
      expect(config.profile).toBe('production');
    });

    it('emits status after config update', () => {
      const { agent, eventBus } = createAgent();
      agent.updateConfig({ pollIntervalMs: 5_000 });

      expect(eventBus.emit).toHaveBeenCalled();
    });
  });

  // --- getState / getConfig ---
  describe('getState and getConfig', () => {
    it('getState returns a copy', () => {
      const { agent } = createAgent();
      const state1 = agent.getState();
      const state2 = agent.getState();

      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2); // different object references
    });

    it('getConfig returns a copy', () => {
      const { agent } = createAgent();
      const config1 = agent.getConfig();
      const config2 = agent.getConfig();

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2);
    });
  });

  // --- test_commander_decide_filters_by_threshold ---
  describe('decide: filters by threshold', () => {
    it('approves low-risk actions when threshold is low', () => {
      const { agent } = createAgent({ autoApproveThreshold: 'low' });

      const assessment: Assessment = {
        priority_actions: [
          { type: 'execute_issue', target: 'ISS-1', reason: 'Fix bug', risk: 'low', executor: 'claude-code' },
          { type: 'execute_issue', target: 'ISS-2', reason: 'Refactor', risk: 'medium', executor: 'claude-code' },
          { type: 'execute_issue', target: 'ISS-3', reason: 'Major change', risk: 'high', executor: 'claude-code' },
        ],
        observations: [],
        risks: [],
      };

      // Access private decide via tick simulation - use type assertion
      const decide = (agent as any).decide.bind(agent);
      const decision: Decision = decide('test', assessment, {
        project: { name: 'test' },
        openIssues: [],
        runningWorkers: 0,
        maxWorkers: 3,
        recentDecisions: [],
        workDir: '/tmp',
      });

      // Only low-risk should be approved
      expect(decision.actions.some(a => a.target === 'ISS-1')).toBe(true);
      expect(decision.deferred.some(a => a.target === 'ISS-2')).toBe(true);
      expect(decision.deferred.some(a => a.target === 'ISS-3')).toBe(true);
    });

    it('approves medium-risk actions when threshold is medium', () => {
      const { agent } = createAgent({ autoApproveThreshold: 'medium' });

      const assessment: Assessment = {
        priority_actions: [
          { type: 'execute_issue', target: 'ISS-1', reason: 'Fix', risk: 'low', executor: 'claude-code' },
          { type: 'execute_issue', target: 'ISS-2', reason: 'Refactor', risk: 'medium', executor: 'claude-code' },
          { type: 'execute_issue', target: 'ISS-3', reason: 'Major', risk: 'high', executor: 'claude-code' },
        ],
        observations: [],
        risks: [],
      };

      const decide = (agent as any).decide.bind(agent);
      const decision: Decision = decide('test', assessment, {
        project: { name: 'test' },
        openIssues: [],
        runningWorkers: 0,
        maxWorkers: 3,
        recentDecisions: [],
        workDir: '/tmp',
      });

      // Low and medium should be approved
      expect(decision.actions.some(a => a.target === 'ISS-1')).toBe(true);
      expect(decision.actions.some(a => a.target === 'ISS-2')).toBe(true);
      // High risk deferred
      expect(decision.deferred.some(a => a.target === 'ISS-3')).toBe(true);
    });

    it('approves all risk levels when threshold is high', () => {
      const { agent } = createAgent({ autoApproveThreshold: 'high' });

      const assessment: Assessment = {
        priority_actions: [
          { type: 'execute_issue', target: 'ISS-1', reason: 'Fix', risk: 'low', executor: 'claude-code' },
          { type: 'execute_issue', target: 'ISS-2', reason: 'Refactor', risk: 'medium', executor: 'claude-code' },
          { type: 'execute_issue', target: 'ISS-3', reason: 'Major', risk: 'high', executor: 'claude-code' },
        ],
        observations: [],
        risks: [],
      };

      const decide = (agent as any).decide.bind(agent);
      const decision: Decision = decide('test', assessment, {
        project: { name: 'test' },
        openIssues: [],
        runningWorkers: 0,
        maxWorkers: 3,
        recentDecisions: [],
        workDir: '/tmp',
      });

      expect(decision.actions).toHaveLength(3);
      expect(decision.deferred).toHaveLength(0);
    });
  });

  // --- test_commander_decide_respects_capacity ---
  describe('decide: respects capacity', () => {
    it('defers execute_issue actions when no worker slots available', () => {
      const { agent } = createAgent({
        autoApproveThreshold: 'high',
        maxConcurrentWorkers: 2,
      });

      const assessment: Assessment = {
        priority_actions: [
          { type: 'execute_issue', target: 'ISS-1', reason: 'Fix', risk: 'low', executor: 'claude-code' },
          { type: 'execute_issue', target: 'ISS-2', reason: 'Refactor', risk: 'low', executor: 'claude-code' },
          { type: 'execute_issue', target: 'ISS-3', reason: 'More work', risk: 'low', executor: 'claude-code' },
        ],
        observations: [],
        risks: [],
      };

      const decide = (agent as any).decide.bind(agent);
      const decision: Decision = decide('test', assessment, {
        project: { name: 'test' },
        openIssues: [],
        runningWorkers: 1, // 1 already running, max 2 -> 1 slot available
        maxWorkers: 2,
        recentDecisions: [],
        workDir: '/tmp',
      });

      // Only 1 slot available, so only 1 execute_issue should be approved
      const executeActions = decision.actions.filter(a => a.type === 'execute_issue');
      expect(executeActions).toHaveLength(1);

      const deferredExecute = decision.deferred.filter(a => a.type === 'execute_issue');
      expect(deferredExecute).toHaveLength(2);
    });

    it('non-execution actions do not consume worker slots', () => {
      const { agent } = createAgent({
        autoApproveThreshold: 'high',
        maxConcurrentWorkers: 1,
      });

      const assessment: Assessment = {
        priority_actions: [
          { type: 'flag_blocker', target: 'ISS-10', reason: 'Blocked', risk: 'low', executor: '' },
          { type: 'create_issue', target: 'new-bug', reason: 'Found bug', risk: 'low', executor: '' },
          { type: 'execute_issue', target: 'ISS-1', reason: 'Fix', risk: 'low', executor: 'claude-code' },
        ],
        observations: [],
        risks: [],
      };

      const decide = (agent as any).decide.bind(agent);
      const decision: Decision = decide('test', assessment, {
        project: { name: 'test' },
        openIssues: [],
        runningWorkers: 0,
        maxWorkers: 1,
        recentDecisions: [],
        workDir: '/tmp',
      });

      // All 3 should be approved: flag_blocker and create_issue don't use slots
      expect(decision.actions).toHaveLength(3);
      expect(decision.deferred).toHaveLength(0);
    });

    it('sorts actions by priority (execute_issue first)', () => {
      const { agent } = createAgent({ autoApproveThreshold: 'high' });

      const assessment: Assessment = {
        priority_actions: [
          { type: 'create_issue', target: 'new', reason: 'New', risk: 'low', executor: '' },
          { type: 'execute_issue', target: 'ISS-1', reason: 'Fix', risk: 'low', executor: 'claude-code' },
          { type: 'flag_blocker', target: 'block', reason: 'Blocked', risk: 'low', executor: '' },
        ],
        observations: [],
        risks: [],
      };

      const decide = (agent as any).decide.bind(agent);
      const decision: Decision = decide('test', assessment, {
        project: { name: 'test' },
        openIssues: [],
        runningWorkers: 0,
        maxWorkers: 5,
        recentDecisions: [],
        workDir: '/tmp',
      });

      // Should be sorted: execute_issue, flag_blocker, create_issue
      const types = decision.actions.map(a => a.type);
      expect(types.indexOf('execute_issue')).toBeLessThan(types.indexOf('flag_blocker'));
      expect(types.indexOf('flag_blocker')).toBeLessThan(types.indexOf('create_issue'));
    });
  });

  // --- Circuit breaker ---
  describe('circuit breaker', () => {
    it('tick is skipped when paused', async () => {
      const { agent, scheduler } = createAgent();
      agent.pause();

      await (agent as any).tick('test');

      // getStatus should not have been called during tick since it was skipped
      expect(agent.getState().tickCount).toBe(0);
    });
  });

  // --- Decision structure ---
  describe('decision structure', () => {
    it('produces well-formed Decision object', () => {
      const { agent } = createAgent({ autoApproveThreshold: 'low' });

      const assessment: Assessment = {
        priority_actions: [
          { type: 'execute_issue', target: 'ISS-1', reason: 'Fix', risk: 'low', executor: 'claude-code' },
        ],
        observations: ['System healthy'],
        risks: ['None'],
      };

      const decide = (agent as any).decide.bind(agent);
      const decision: Decision = decide('scheduled_tick', assessment, {
        project: { name: 'test' },
        openIssues: [],
        runningWorkers: 0,
        maxWorkers: 3,
        recentDecisions: [],
        workDir: '/tmp',
      });

      expect(decision.id).toBeTruthy();
      expect(decision.timestamp).toBeTruthy();
      expect(decision.trigger).toBe('scheduled_tick');
      expect(decision.assessment).toBe(assessment);
      expect(decision.actions).toBeInstanceOf(Array);
      expect(decision.deferred).toBeInstanceOf(Array);
    });
  });
});
