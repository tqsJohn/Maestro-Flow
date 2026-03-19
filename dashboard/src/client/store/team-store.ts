import { create } from 'zustand';
import { TEAM_API_ENDPOINTS } from '@/shared/constants.js';
import type { TeamSessionSummary, TeamSessionDetail } from '@/shared/team-types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TeamView = 'cards' | 'table';

interface TeamStore {
  // State
  sessions: TeamSessionSummary[];
  activeSession: TeamSessionDetail | null;
  activeSessionId: string | null;
  activeView: TeamView;
  loading: boolean;
  error: string | null;

  // Filters
  statusFilter: string;
  skillFilter: string | null;
  searchQuery: string;

  // Actions
  fetchSessions: () => Promise<void>;
  fetchSessionDetail: (sessionId: string) => Promise<void>;
  clearActiveSession: () => void;
  setActiveView: (view: TeamView) => void;
  setStatusFilter: (status: string) => void;
  setSkillFilter: (skill: string | null) => void;
  setSearchQuery: (query: string) => void;

  // Derived
  filteredSessions: () => TeamSessionSummary[];
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useTeamStore = create<TeamStore>((set, get) => ({
  sessions: [],
  activeSession: null,
  activeSessionId: null,
  activeView: 'cards',
  loading: false,
  error: null,
  statusFilter: 'all',
  skillFilter: null,
  searchQuery: '',

  setActiveView: (view) => set({ activeView: view }),
  setStatusFilter: (status) => set({ statusFilter: status }),
  setSkillFilter: (skill) => set({ skillFilter: skill }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  clearActiveSession: () => set({ activeSession: null, activeSessionId: null }),

  fetchSessions: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(TEAM_API_ENDPOINTS.SESSIONS);
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = (await res.json()) as TeamSessionSummary[];
      set({ sessions: data, loading: false });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  fetchSessionDetail: async (sessionId) => {
    set({ loading: true, error: null, activeSessionId: sessionId });
    try {
      const res = await fetch(TEAM_API_ENDPOINTS.SESSIONS + '/' + sessionId);
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = (await res.json()) as TeamSessionDetail;
      set({ activeSession: data, loading: false });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  filteredSessions: () => {
    const { sessions, statusFilter, skillFilter, searchQuery } = get();
    let result = sessions;
    if (statusFilter !== 'all') result = result.filter((s) => s.status === statusFilter);
    if (skillFilter) result = result.filter((s) => s.skill === skillFilter);
    if (searchQuery) {
      const lc = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.title.toLowerCase().includes(lc) ||
          s.sessionId.toLowerCase().includes(lc) ||
          s.roles.some((r) => r.toLowerCase().includes(lc)),
      );
    }
    return result;
  },
}));
