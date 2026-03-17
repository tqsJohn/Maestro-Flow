// ---------------------------------------------------------------------------
// Execution system types — orchestrator state, supervisor config, slots
// ---------------------------------------------------------------------------

import type { AgentType } from './agent-types.js';

// ---------------------------------------------------------------------------
// Execution slot — tracks a running agent for an issue
// ---------------------------------------------------------------------------

export interface ExecutionSlot {
  issueId: string;
  processId: string;
  executor: AgentType;
  startedAt: string;
  lastActivityAt: string;
}

// ---------------------------------------------------------------------------
// Issue execution state — embedded in Issue record
// ---------------------------------------------------------------------------

export type IssueExecutionStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'retrying';

export interface IssueExecution {
  status: IssueExecutionStatus;
  processId?: string;
  startedAt?: string;
  completedAt?: string;
  retryCount: number;
  lastError?: string;
}

// ---------------------------------------------------------------------------
// Prompt & supervisor configuration
// ---------------------------------------------------------------------------

export type PromptMode = 'skill' | 'direct';
export type SupervisorStrategy = 'priority' | 'smart';

export interface SupervisorConfig {
  enabled: boolean;
  strategy: SupervisorStrategy;
  pollIntervalMs: number;
  maxConcurrentAgents: number;
  stallTimeoutMs: number;
  maxRetries: number;
  retryBackoffMs: number;
  defaultPromptMode: PromptMode;
  defaultExecutor: AgentType;
}

export const DEFAULT_SUPERVISOR_CONFIG: SupervisorConfig = {
  enabled: false,
  strategy: 'priority',
  pollIntervalMs: 30_000,
  maxConcurrentAgents: 3,
  stallTimeoutMs: 300_000,
  maxRetries: 2,
  retryBackoffMs: 60_000,
  defaultPromptMode: 'direct',
  defaultExecutor: 'claude-code',
};

// ---------------------------------------------------------------------------
// Supervisor runtime status snapshot
// ---------------------------------------------------------------------------

export interface SupervisorStatus {
  enabled: boolean;
  running: ExecutionSlot[];
  queued: string[];
  retrying: { issueId: string; retryAt: string }[];
  lastTickAt: string | null;
  stats: {
    totalDispatched: number;
    totalCompleted: number;
    totalFailed: number;
  };
}
