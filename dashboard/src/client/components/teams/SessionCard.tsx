import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right.js';
import Clock from 'lucide-react/dist/esm/icons/clock.js';
import MessageSquare from 'lucide-react/dist/esm/icons/message-square.js';
import Activity from 'lucide-react/dist/esm/icons/activity.js';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2.js';
import type { TeamSessionSummary } from '@/shared/team-types.js';
import { TEAM_STATUS_COLORS, PIPELINE_STATUS_COLORS } from '@/shared/team-types.js';

// ---------------------------------------------------------------------------
// Skill → color + abbreviation mapping
// ---------------------------------------------------------------------------

const SKILL_COLORS: Record<string, string> = {
  Coordinate: '#4A90D9',
  Lifecycle: '#8B6BBF',
  QA: '#3D9B6F',
  Review: '#D4832E',
  Testing: '#3BA0B5',
  'Frontend Debug': '#D05454',
  'Perf Opt': '#C99B2D',
  'Tech Debt': '#A09D97',
  'Plan & Execute': '#4A90D9',
  Brainstorm: '#8B6BBF',
  'Roadmap Dev': '#3D9B6F',
  Issue: '#D05454',
  'Iter Dev': '#D4832E',
  'Ultra Analyze': '#C99B2D',
  'UX Improve': '#3BA0B5',
  'UI Design': '#8B6BBF',
  'Arch Opt': '#4A90D9',
  Team: '#A09D97',
};

const SKILL_ABBREV: Record<string, string> = {
  Coordinate: 'TC',
  Lifecycle: 'LV',
  QA: 'QA',
  Review: 'RV',
  Testing: 'TST',
  'Frontend Debug': 'FD',
  'Perf Opt': 'PO',
  'Tech Debt': 'TD',
  'Plan & Execute': 'PX',
  Brainstorm: 'BS',
  'Roadmap Dev': 'RD',
  Issue: 'IS',
  'Iter Dev': 'ID',
  'Ultra Analyze': 'UA',
  'UX Improve': 'UX',
  'UI Design': 'UI',
  'Arch Opt': 'AO',
  Team: 'TM',
};

const ROLE_COLORS = ['#4A90D9', '#8B6BBF', '#C99B2D', '#D05454', '#3D9B6F', '#D4832E', '#3BA0B5'];

// ---------------------------------------------------------------------------
// StatusPill
// ---------------------------------------------------------------------------

function StatusPill({ status }: { status: TeamSessionSummary['status'] }) {
  const color = TEAM_STATUS_COLORS[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: `${color}18`, color }}
    >
      {status === 'active' && (
        <span className="relative flex w-1.5 h-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: color }} />
          <span className="relative inline-flex rounded-full w-1.5 h-1.5" style={{ backgroundColor: color }} />
        </span>
      )}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// SessionCard
// ---------------------------------------------------------------------------

export function SessionCard({
  session,
  onClick,
  onDelete,
}: {
  session: TeamSessionSummary;
  onClick: () => void;
  onDelete?: (sessionId: string) => void;
}) {
  const skillColor = SKILL_COLORS[session.skill] ?? '#A09D97';
  const skillAbbrev = SKILL_ABBREV[session.skill] ?? 'TM';

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-left bg-bg-card border border-border rounded-xl p-3.5 hover:border-accent-blue hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-all duration-150 cursor-pointer"
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-2">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold text-white shrink-0"
          style={{ backgroundColor: skillColor }}
        >
          {skillAbbrev}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-text-primary truncate">
            {session.title}
          </div>
          <div className="text-[10px] font-mono text-text-placeholder truncate">
            {session.sessionId}
          </div>
        </div>
        <StatusPill status={session.status} />
        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(session.sessionId);
            }}
            className="w-6 h-6 rounded-md flex items-center justify-center text-text-placeholder opacity-0 group-hover:opacity-100 hover:!text-status-failed hover:bg-[rgba(196,101,85,0.1)] transition-all shrink-0"
            title="Delete session"
          >
            <Trash2 size={13} strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Description */}
      {session.description && (
        <p className="text-[11px] text-text-secondary leading-relaxed mb-2.5 line-clamp-2">
          {session.description}
        </p>
      )}

      {/* Pipeline dots */}
      {session.pipelineStages.length > 0 && (
        <div className="flex gap-1 mb-2.5">
          {session.pipelineStages.map((stage) => (
            <div
              key={stage.id}
              className="w-2 h-2 rounded-full"
              title={`${stage.name}: ${stage.status}`}
              style={{ backgroundColor: PIPELINE_STATUS_COLORS[stage.status] }}
            />
          ))}
        </div>
      )}

      {/* Meta row */}
      <div className="flex items-center gap-3 text-[10px] text-text-tertiary mb-2.5">
        <span className="inline-flex items-center gap-1">
          <Activity size={11} strokeWidth={2} />
          {session.taskProgress.completed}/{session.taskProgress.total} tasks
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock size={11} strokeWidth={2} />
          {session.duration || '--'}
        </span>
        <span className="inline-flex items-center gap-1">
          <MessageSquare size={11} strokeWidth={2} />
          {session.messageCount} msgs
        </span>
      </div>

      {/* Footer: role avatars + arrow */}
      <div className="flex items-center gap-1.5 pt-2 border-t border-border-divider">
        <div className="flex gap-0.5">
          {session.roles.slice(0, 4).map((role, i) => (
            <div
              key={role}
              className="w-[18px] h-[18px] rounded-[5px] flex items-center justify-center text-[8px] font-bold text-white"
              title={role}
              style={{ backgroundColor: ROLE_COLORS[i % ROLE_COLORS.length] }}
            >
              {role.charAt(0).toUpperCase()}
            </div>
          ))}
          {session.roles.length > 4 && (
            <div className="w-[18px] h-[18px] rounded-[5px] flex items-center justify-center text-[8px] font-semibold text-text-tertiary bg-bg-hover">
              +{session.roles.length - 4}
            </div>
          )}
        </div>
        <div className="flex-1" />
        <ChevronRight
          size={14}
          className="text-text-placeholder group-hover:text-accent-blue transition-colors"
        />
      </div>
    </button>
  );
}
