import { useCollabStore } from '@/client/store/collab-store.js';
import { COLLAB_STATUS_COLORS } from '@/shared/collab-types.js';
import type { CollabPresence } from '@/shared/collab-types.js';

// ---------------------------------------------------------------------------
// OnlineAvatarGroup — compact avatar cluster for the TopBar
// ---------------------------------------------------------------------------

const MAX_VISIBLE = 4;
const AVATAR_SIZE = 36;
const OVERLAP_MARGIN = -8;

const STATUS_DOT_COLORS: Record<CollabPresence['status'], string> = COLLAB_STATUS_COLORS;

export function OnlineAvatarGroup() {
  const presence = useCollabStore((s) => s.presence);

  if (presence.length === 0) return null;

  const visible = presence.slice(0, MAX_VISIBLE);
  const remaining = presence.length - MAX_VISIBLE;

  return (
    <div className="flex items-center flex-shrink-0" role="group" aria-label="Online members">
      {visible.map((member, i) => (
        <div
          key={member.uid}
          title={`${member.name} — ${member.status}`}
          className="relative rounded-full border-2 border-bg-secondary"
          style={{
            width: AVATAR_SIZE,
            height: AVATAR_SIZE,
            marginLeft: i === 0 ? 0 : OVERLAP_MARGIN,
            backgroundColor: '#6b7280',
            zIndex: visible.length - i,
          }}
        >
          {/* Initial letter */}
          <span className="absolute inset-0 flex items-center justify-center text-white text-[length:11px] font-semibold select-none">
            {member.name.charAt(0).toUpperCase()}
          </span>
          {/* Status dot */}
          <span
            className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-bg-secondary"
            style={{ backgroundColor: STATUS_DOT_COLORS[member.status] }}
          />
        </div>
      ))}
      {remaining > 0 && (
        <div
          className="relative flex items-center justify-center rounded-full border-2 border-bg-secondary bg-bg-hover"
          style={{
            width: AVATAR_SIZE,
            height: AVATAR_SIZE,
            marginLeft: OVERLAP_MARGIN,
            zIndex: 0,
          }}
        >
          <span className="text-text-secondary text-[length:10px] font-semibold">
            +{remaining}
          </span>
        </div>
      )}
    </div>
  );
}
