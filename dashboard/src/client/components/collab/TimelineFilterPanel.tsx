import { useCollabStore } from '@/client/store/collab-store.js';

// ---------------------------------------------------------------------------
// TimelineFilterPanel — filter controls for the timeline
// ---------------------------------------------------------------------------

const TYPE_OPTIONS = [
  { value: 'all', label: 'All types' },
  { value: 'phase_change', label: 'Phase changes' },
  { value: 'task_update', label: 'Task updates' },
  { value: 'message', label: 'Messages' },
];

export function TimelineFilterPanel() {
  const members = useCollabStore((s) => s.members);
  const memberFilter = useCollabStore((s) => s.memberFilter);
  const typeFilter = useCollabStore((s) => s.typeFilter);
  const setMemberFilter = useCollabStore((s) => s.setMemberFilter);
  const setTypeFilter = useCollabStore((s) => s.setTypeFilter);

  return (
    <div className="flex items-center gap-3 flex-shrink-0 mb-3">
      {/* Member filter */}
      <select
        value={memberFilter}
        onChange={(e) => setMemberFilter(e.target.value)}
        className="text-[length:var(--font-size-xs)] px-2 py-1 rounded-[var(--radius-md)] border border-border bg-bg-secondary text-text-primary"
      >
        <option value="all">All members</option>
        {members.map((m) => (
          <option key={m.uid} value={m.uid}>
            {m.name}
          </option>
        ))}
      </select>

      {/* Type filter */}
      <select
        value={typeFilter}
        onChange={(e) => setTypeFilter(e.target.value)}
        className="text-[length:var(--font-size-xs)] px-2 py-1 rounded-[var(--radius-md)] border border-border bg-bg-secondary text-text-primary"
      >
        {TYPE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
