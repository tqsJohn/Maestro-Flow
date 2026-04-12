import { useCollabStore } from '@/client/store/collab-store.js';
import { CollabMemberCard } from './CollabMemberCard.js';

// ---------------------------------------------------------------------------
// CollabMembersList — responsive grid of member cards
// ---------------------------------------------------------------------------

export function CollabMembersList() {
  const members = useCollabStore((s) => s.filteredMembers());

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2">
        <span className="text-text-secondary text-[length:var(--font-size-sm)]">
          No team members found
        </span>
        <span className="text-text-tertiary text-[length:var(--font-size-xs)]">
          Run <code className="px-1 py-0.5 bg-bg-hover rounded text-[10px]">maestro team join</code> to join the team
        </span>
      </div>
    );
  }

  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}
    >
      {members.map((member) => (
        <CollabMemberCard key={member.uid} member={member} />
      ))}
    </div>
  );
}
