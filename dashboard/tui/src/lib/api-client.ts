// ---------------------------------------------------------------------------
// Typed API client — fetch wrappers for dashboard REST endpoints
// ---------------------------------------------------------------------------

import {
  API_ENDPOINTS,
  ISSUE_API_ENDPOINTS,
  TEAM_API_ENDPOINTS,
  EXECUTION_API_ENDPOINTS,
} from '@shared/constants.js';
import type { Issue, CreateIssueRequest } from '@shared/issue-types.js';
import type {
  BoardState,
  PhaseCard,
  TaskCard,
  ProjectState,
} from '@shared/types.js';

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    message?: string,
  ) {
    super(message ?? `API error: ${status} ${statusText}`);
    this.name = 'ApiError';
  }
}

// ---------------------------------------------------------------------------
// Internal fetch helper
// ---------------------------------------------------------------------------

async function request<T>(baseUrl: string, endpoint: string, init?: RequestInit): Promise<T> {
  const url = `${baseUrl}${endpoint}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!res.ok) {
    throw new ApiError(res.status, res.statusText);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export interface HealthResponse {
  status: string;
}

export function fetchHealth(baseUrl: string): Promise<HealthResponse> {
  return request<HealthResponse>(baseUrl, API_ENDPOINTS.HEALTH);
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export function fetchBoard(baseUrl: string): Promise<BoardState> {
  return request<BoardState>(baseUrl, API_ENDPOINTS.BOARD);
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export function fetchProject(baseUrl: string): Promise<ProjectState> {
  return request<ProjectState>(baseUrl, API_ENDPOINTS.PROJECT);
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

export function fetchPhases(baseUrl: string): Promise<PhaseCard[]> {
  return request<PhaseCard[]>(baseUrl, API_ENDPOINTS.PHASES);
}

// ---------------------------------------------------------------------------
// Tasks (per phase)
// ---------------------------------------------------------------------------

export function fetchTasks(baseUrl: string, phaseNumber: number): Promise<TaskCard[]> {
  const endpoint = API_ENDPOINTS.PHASE_TASKS.replace(':n', String(phaseNumber));
  return request<TaskCard[]>(baseUrl, endpoint);
}

// ---------------------------------------------------------------------------
// Artifacts
// ---------------------------------------------------------------------------

export function fetchArtifacts(baseUrl: string): Promise<unknown[]> {
  return request<unknown[]>(baseUrl, API_ENDPOINTS.ARTIFACTS);
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

export function fetchIssues(baseUrl: string): Promise<Issue[]> {
  return request<Issue[]>(baseUrl, ISSUE_API_ENDPOINTS.ISSUES);
}

export function createIssue(baseUrl: string, body: CreateIssueRequest): Promise<Issue> {
  return request<Issue>(baseUrl, ISSUE_API_ENDPOINTS.ISSUES, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Team sessions
// ---------------------------------------------------------------------------

export interface TeamSession {
  sessionId: string;
  [key: string]: unknown;
}

export function fetchTeamSessions(baseUrl: string): Promise<TeamSession[]> {
  return request<TeamSession[]>(baseUrl, TEAM_API_ENDPOINTS.SESSIONS);
}

export function fetchTeamSession(baseUrl: string, sessionId: string): Promise<TeamSession> {
  const endpoint = TEAM_API_ENDPOINTS.SESSION.replace(':sessionId', sessionId);
  return request<TeamSession>(baseUrl, endpoint);
}

// ---------------------------------------------------------------------------
// Execution status
// ---------------------------------------------------------------------------

export function fetchExecutionStatus(baseUrl: string): Promise<unknown> {
  return request<unknown>(baseUrl, EXECUTION_API_ENDPOINTS.STATUS);
}
