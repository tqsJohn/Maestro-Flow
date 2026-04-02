import { useReducer, useEffect, useCallback } from 'react';
import { useWsEvent } from '../providers/WsProvider.js';
import { useApi } from '../providers/ApiProvider.js';
import { AGENT_API_ENDPOINTS } from '@shared/constants.js';
import type {
  AgentProcess,
  NormalizedEntry,
  ApprovalRequest,
  ThoughtData,
  AgentStatusPayload,
  AgentStoppedPayload,
  AgentThoughtPayload,
  AgentStreamingPayload,
} from '@shared/agent-types.js';

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export interface AgentState {
  processes: Record<string, AgentProcess>;
  entries: Record<string, NormalizedEntry[]>;
  pendingApprovals: Record<string, ApprovalRequest>;
  activeProcessId: string | null;
  thoughts: Record<string, ThoughtData>;
  streaming: Record<string, boolean>;
}

const initialState: AgentState = {
  processes: {},
  entries: {},
  pendingApprovals: {},
  activeProcessId: null,
  thoughts: {},
  streaming: {},
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type Action =
  | { type: 'PROCESS_SPAWNED'; process: AgentProcess }
  | { type: 'PROCESS_STOPPED'; processId: string }
  | { type: 'STATUS_CHANGED'; payload: AgentStatusPayload }
  | { type: 'ENTRY_RECEIVED'; entry: NormalizedEntry }
  | { type: 'APPROVAL_RECEIVED'; approval: ApprovalRequest }
  | { type: 'APPROVAL_RESOLVED'; requestId: string }
  | { type: 'THOUGHT_RECEIVED'; payload: AgentThoughtPayload }
  | { type: 'STREAMING_CHANGED'; payload: AgentStreamingPayload }
  | { type: 'SET_ACTIVE'; processId: string | null }
  | { type: 'SET_PROCESSES'; processes: AgentProcess[] };

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function reducer(state: AgentState, action: Action): AgentState {
  switch (action.type) {
    case 'PROCESS_SPAWNED': {
      const p = action.process;
      return {
        ...state,
        processes: { ...state.processes, [p.id]: p },
        entries: { ...state.entries, [p.id]: state.entries[p.id] ?? [] },
        activeProcessId: state.activeProcessId ?? p.id,
      };
    }
    case 'PROCESS_STOPPED': {
      const procs = { ...state.processes };
      if (procs[action.processId]) {
        procs[action.processId] = { ...procs[action.processId], status: 'stopped' };
      }
      const approvals = { ...state.pendingApprovals };
      for (const [k, v] of Object.entries(approvals)) {
        if (v.processId === action.processId) delete approvals[k];
      }
      return { ...state, processes: procs, pendingApprovals: approvals };
    }
    case 'STATUS_CHANGED': {
      const { processId, status } = action.payload;
      const procs = { ...state.processes };
      if (procs[processId]) {
        procs[processId] = { ...procs[processId], status };
      }
      return { ...state, processes: procs };
    }
    case 'ENTRY_RECEIVED': {
      const entry = action.entry;
      const pid = entry.processId;
      const existing = state.entries[pid] ?? [];

      // Merge partial assistant messages
      if (entry.type === 'assistant_message' && entry.partial) {
        const lastIdx = existing.length - 1;
        const last = existing[lastIdx];
        if (last && last.type === 'assistant_message' && last.partial) {
          const updated = [...existing];
          updated[lastIdx] = entry;
          return { ...state, entries: { ...state.entries, [pid]: updated } };
        }
      }
      // Replace completed partial
      if (entry.type === 'assistant_message' && !entry.partial) {
        const lastIdx = existing.length - 1;
        const last = existing[lastIdx];
        if (last && last.type === 'assistant_message' && last.partial) {
          const updated = [...existing];
          updated[lastIdx] = entry;
          return { ...state, entries: { ...state.entries, [pid]: updated } };
        }
      }

      return { ...state, entries: { ...state.entries, [pid]: [...existing, entry] } };
    }
    case 'APPROVAL_RECEIVED':
      return {
        ...state,
        pendingApprovals: { ...state.pendingApprovals, [action.approval.id]: action.approval },
      };
    case 'APPROVAL_RESOLVED': {
      const approvals = { ...state.pendingApprovals };
      delete approvals[action.requestId];
      return { ...state, pendingApprovals: approvals };
    }
    case 'THOUGHT_RECEIVED':
      return {
        ...state,
        thoughts: { ...state.thoughts, [action.payload.processId]: action.payload.thought },
      };
    case 'STREAMING_CHANGED':
      return {
        ...state,
        streaming: { ...state.streaming, [action.payload.processId]: action.payload.streaming },
      };
    case 'SET_ACTIVE':
      return { ...state, activeProcessId: action.processId };
    case 'SET_PROCESSES': {
      const procs: Record<string, AgentProcess> = {};
      for (const p of action.processes) {
        procs[p.id] = p;
      }
      return {
        ...state,
        processes: procs,
        activeProcessId: state.activeProcessId ?? action.processes[0]?.id ?? null,
      };
    }
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAgentState() {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Initial load of existing processes
  const { data: processList } = useApi<AgentProcess[]>(AGENT_API_ENDPOINTS.LIST, { pollInterval: 10000 });
  useEffect(() => {
    if (processList) {
      dispatch({ type: 'SET_PROCESSES', processes: processList });
    }
  }, [processList]);

  // WS subscriptions
  const spawned = useWsEvent<AgentProcess>('agent:spawned');
  const entry = useWsEvent<NormalizedEntry>('agent:entry');
  const approval = useWsEvent<ApprovalRequest>('agent:approval');
  const statusChange = useWsEvent<AgentStatusPayload>('agent:status');
  const stopped = useWsEvent<AgentStoppedPayload>('agent:stopped');
  const thought = useWsEvent<AgentThoughtPayload>('agent:thought');
  const streamingEvt = useWsEvent<AgentStreamingPayload>('agent:streaming');

  useEffect(() => { if (spawned) dispatch({ type: 'PROCESS_SPAWNED', process: spawned }); }, [spawned]);
  useEffect(() => { if (entry) dispatch({ type: 'ENTRY_RECEIVED', entry }); }, [entry]);
  useEffect(() => { if (approval) dispatch({ type: 'APPROVAL_RECEIVED', approval }); }, [approval]);
  useEffect(() => { if (statusChange) dispatch({ type: 'STATUS_CHANGED', payload: statusChange }); }, [statusChange]);
  useEffect(() => { if (stopped) dispatch({ type: 'PROCESS_STOPPED', processId: stopped.processId }); }, [stopped]);
  useEffect(() => { if (thought) dispatch({ type: 'THOUGHT_RECEIVED', payload: thought }); }, [thought]);
  useEffect(() => { if (streamingEvt) dispatch({ type: 'STREAMING_CHANGED', payload: streamingEvt }); }, [streamingEvt]);

  const setActive = useCallback((processId: string | null) => {
    dispatch({ type: 'SET_ACTIVE', processId });
  }, []);

  const resolveApproval = useCallback((requestId: string) => {
    dispatch({ type: 'APPROVAL_RESOLVED', requestId });
  }, []);

  return { ...state, setActive, resolveApproval };
}
