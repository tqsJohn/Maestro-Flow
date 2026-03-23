import { useMemo } from 'react';
import Search from 'lucide-react/dist/esm/icons/search.js';
import { useTeamStore } from '@/client/store/team-store.js';
import { SessionCard } from './SessionCard.js';
import type { TeamSessionSummary } from '@/shared/team-types.js';
import { TEAM_STATUS_COLORS } from '@/shared/team-types.js';

// ---------------------------------------------------------------------------
// TeamSessionsList — combined list view (card grid + table + filters + stats)
// ---------------------------------------------------------------------------

const STATUS_FILTERS = ['all', 'active', 'completed', 'failed', 'archived'] as const;

export function TeamSessionsList({ viewMode }: { viewMode: 'cards' | 'table' }) {
  const sessions = useTeamStore((s) => s.sessions);
  const filteredSessions = useTeamStore((s) => s.filteredSessions);
  const statusFilter = useTeamStore((s) => s.statusFilter);
  const skillFilter = useTeamStore((s) => s.skillFilter);
  const searchQuery = useTeamStore((s) => s.searchQuery);
  const setStatusFilter = useTeamStore((s) => s.setStatusFilter);
  const setSkillFilter = useTeamStore((s) => s.setSkillFilter);
  const setSearchQuery = useTeamStore((s) => s.setSearchQuery);
  const fetchSessionDetail = useTeamStore((s) => s.fetchSessionDetail);
  const deleteSession = useTeamStore((s) => s.deleteSession);

  const filtered = filteredSessions();

  // Compute stats
  const stats = useMemo(() => {
    const active = sessions.filter((s) => s.status === 'active').length;
    const completed = sessions.filter((s) => s.status === 'completed').length;
    const totalRoles = sessions.reduce((sum, s) => sum + s.roles.length, 0);
    return { total: sessions.length, active, completed, totalRoles };
  }, [sessions]);

  // Extract unique skill types for filter chips
  const skills = useMemo(() => {
    const set = new Set(sessions.map((s) => s.skill));
    return Array.from(set).sort();
  }, [sessions]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border shrink-0">
        <span className="text-[14px] font-semibold text-text-primary">Sessions</span>
        <span className="text-[11px] font-medium text-text-tertiary bg-bg-hover px-1.5 py-0.5 rounded-full">
          {filtered.length}
        </span>

        {/* Search */}
        <div className="relative ml-2">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-placeholder" />
          <input
            type="text"
            placeholder="Search sessions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-7 pr-2.5 py-1 rounded-lg border border-border bg-bg-secondary text-[12px] text-text-primary placeholder:text-text-placeholder w-48 focus:outline-none focus:border-accent-blue transition-colors"
          />
        </div>

        <div className="flex-1" />

        {/* Status filters */}
        <div className="flex gap-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={[
                'px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all',
                statusFilter === s
                  ? 'bg-text-primary text-white'
                  : 'text-text-tertiary hover:text-text-primary hover:bg-bg-hover',
              ].join(' ')}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* Skill filters */}
        {skills.length > 1 && (
          <>
            <div className="w-px h-4 bg-border-divider" />
            <div className="flex gap-1">
              {skills.map((sk) => (
                <button
                  key={sk}
                  type="button"
                  onClick={() => setSkillFilter(skillFilter === sk ? null : sk)}
                  className={[
                    'px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all',
                    skillFilter === sk
                      ? 'bg-accent-blue text-white'
                      : 'text-text-tertiary hover:text-text-primary hover:bg-bg-hover',
                  ].join(' ')}
                >
                  {sk}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-5">
        {/* Stats bar */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <StatCard label="Total Sessions" value={stats.total} sub={`across ${skills.length} skill types`} />
          <StatCard label="Active" value={stats.active} color={TEAM_STATUS_COLORS.active} sub="running now" />
          <StatCard label="Completed" value={stats.completed} color={TEAM_STATUS_COLORS.completed} sub="finished" />
          <StatCard label="Total Roles" value={stats.totalRoles} sub={`avg ${stats.total ? (stats.totalRoles / stats.total).toFixed(1) : 0} per session`} />
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-text-tertiary">
            <span className="text-[14px] font-medium mb-1">No sessions found</span>
            <span className="text-[12px]">
              {sessions.length === 0
                ? 'Run a team skill to see sessions here'
                : 'Try adjusting your filters'}
            </span>
          </div>
        )}

        {/* Card view */}
        {viewMode === 'cards' && filtered.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
            {filtered.map((s) => (
              <SessionCard
                key={s.sessionId}
                session={s}
                onClick={() => void fetchSessionDetail(s.sessionId)}
                onDelete={(id) => void deleteSession(id)}
              />
            ))}
          </div>
        )}

        {/* Table view */}
        {viewMode === 'table' && filtered.length > 0 && (
          <SessionTable sessions={filtered} onSelect={(id) => void fetchSessionDetail(id)} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: number;
  color?: string;
  sub: string;
}) {
  return (
    <div className="bg-bg-card rounded-xl border border-border px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary mb-0.5">
        {label}
      </div>
      <div className="text-[22px] font-bold" style={{ color: color ?? 'var(--color-text-primary)' }}>
        {value}
      </div>
      <div className="text-[11px] text-text-tertiary mt-0.5">{sub}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SessionTable
// ---------------------------------------------------------------------------

const ROLE_COLORS = ['#4A90D9', '#8B6BBF', '#C99B2D', '#D05454', '#3D9B6F', '#D4832E', '#3BA0B5'];

function SessionTable({
  sessions,
  onSelect,
}: {
  sessions: TeamSessionSummary[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="bg-bg-card rounded-xl border border-border overflow-hidden">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="text-left px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary bg-bg-secondary border-b border-border sticky top-0 z-[5]">
              Session
            </th>
            <th className="text-left px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary bg-bg-secondary border-b border-border sticky top-0 z-[5]">
              Status
            </th>
            <th className="text-left px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary bg-bg-secondary border-b border-border sticky top-0 z-[5]">
              Progress
            </th>
            <th className="text-left px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary bg-bg-secondary border-b border-border sticky top-0 z-[5]">
              Roles
            </th>
            <th className="text-left px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary bg-bg-secondary border-b border-border sticky top-0 z-[5]">
              Duration
            </th>
            <th className="w-8 bg-bg-secondary border-b border-border sticky top-0 z-[5]" />
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => {
            const pct = s.taskProgress.total ? Math.round((s.taskProgress.completed / s.taskProgress.total) * 100) : 0;
            const statusColor = TEAM_STATUS_COLORS[s.status];
            return (
              <tr
                key={s.sessionId}
                onClick={() => onSelect(s.sessionId)}
                className="cursor-pointer hover:bg-bg-hover transition-colors group"
              >
                <td className="px-3.5 py-2.5 border-b border-border-divider">
                  <div className="flex items-center gap-2.5 min-w-[240px]">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-text-primary truncate">{s.title}</div>
                      <div className="text-[10px] font-mono text-text-placeholder">{s.sessionId}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3.5 py-2.5 border-b border-border-divider">
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                    style={{ background: `${statusColor}18`, color: statusColor }}
                  >
                    {s.status}
                  </span>
                </td>
                <td className="px-3.5 py-2.5 border-b border-border-divider">
                  <div className="flex items-center gap-2 min-w-[120px]">
                    <div className="flex-1 h-[5px] bg-bg-hover rounded-full overflow-hidden min-w-[60px]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: statusColor,
                        }}
                      />
                    </div>
                    <span className="text-[11px] font-semibold text-text-tertiary whitespace-nowrap min-w-[36px]">
                      {s.taskProgress.completed}/{s.taskProgress.total}
                    </span>
                  </div>
                </td>
                <td className="px-3.5 py-2.5 border-b border-border-divider">
                  <div className="flex gap-0.5">
                    {s.roles.slice(0, 5).map((r, i) => (
                      <div
                        key={r}
                        className="w-[18px] h-[18px] rounded-[5px] flex items-center justify-center text-[8px] font-bold text-white"
                        title={r}
                        style={{ backgroundColor: ROLE_COLORS[i % ROLE_COLORS.length] }}
                      >
                        {r.charAt(0).toUpperCase()}
                      </div>
                    ))}
                  </div>
                </td>
                <td className="px-3.5 py-2.5 border-b border-border-divider">
                  <span className="font-mono text-[11px] text-text-tertiary whitespace-nowrap">
                    {s.duration || '--'}
                  </span>
                </td>
                <td className="px-3.5 py-2.5 border-b border-border-divider text-center">
                  <span className="text-[14px] text-text-placeholder group-hover:text-accent-blue transition-colors">
                    &#8594;
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
