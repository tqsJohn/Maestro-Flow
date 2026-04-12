import { COLLAB_STATUS_COLORS } from '@/shared/collab-types.js';
import type { CollabMember } from '@/shared/collab-types.js';

// ---------------------------------------------------------------------------
// CollabMemberCard — individual member status card
// ---------------------------------------------------------------------------

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function CollabMemberCard({ member }: { member: CollabMember }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-[var(--radius-md)] border border-border bg-bg-secondary hover:shadow-sm transition-shadow">
      {/* Avatar placeholder */}
      <div
        className="relative flex-shrink-0 rounded-full flex items-center justify-center"
        style={{ width: 40, height: 40, backgroundColor: '#6b7280' }}
      >
        <span className="text-white text-[length:14px] font-semibold select-none">
          {member.name.charAt(0).toUpperCase()}
        </span>
        {/* Status dot */}
        <span
          className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-bg-secondary"
          style={{ backgroundColor: COLLAB_STATUS_COLORS[member.status] }}
        />
      </div>

      {/* Info */}
      <div className="flex flex-col min-w-0 gap-0.5">
        <span className="text-[length:var(--font-size-sm)] font-[var(--font-weight-medium)] text-text-primary truncate">
          {member.name}
        </span>
        {(member.currentPhase || member.currentTask) && (
          <span className="text-[length:var(--font-size-xs)] text-text-tertiary truncate">
            {[member.currentPhase, member.currentTask].filter(Boolean).join(' / ')}
          </span>
        )}
        <span className="text-[length:10px] text-text-tertiary">
          {formatRelativeTime(member.lastSeen)}
        </span>
      </div>
    </div>
  );
}
