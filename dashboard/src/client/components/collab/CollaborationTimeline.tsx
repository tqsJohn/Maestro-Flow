import { useEffect, useRef, useState, useMemo } from 'react';
import { useCollabStore } from '@/client/store/collab-store.js';
import type { CollabActivityEntry } from '@/shared/collab-types.js';
import { TimelineEventNode } from './TimelineEventNode.js';
import { TimelineFilterPanel } from './TimelineFilterPanel.js';

// ---------------------------------------------------------------------------
// CollaborationTimeline — horizontal scrollable timeline with filters
// ---------------------------------------------------------------------------

function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getDateKey(iso: string): string {
  return new Date(iso).toDateString();
}

export function CollaborationTimeline() {
  const activity = useCollabStore((s) => s.filteredActivity());
  const fetchActivity = useCollabStore((s) => s.fetchActivity);
  const loading = useCollabStore((s) => s.loading);
  const [limit, setLimit] = useState(200);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetchActivity(limit);
  }, [fetchActivity, limit]);

  // Auto-scroll to end on initial load
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [activity.length]);

  // Group by day
  const grouped = useMemo(() => {
    const groups: { day: string; entries: CollabActivityEntry[] }[] = [];
    let currentDay = '';
    for (const entry of activity) {
      const dayKey = getDateKey(entry.ts);
      if (dayKey !== currentDay) {
        currentDay = dayKey;
        groups.push({ day: dayKey, entries: [] });
      }
      groups[groups.length - 1].entries.push(entry);
    }
    return groups;
  }, [activity]);

  if (loading && activity.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-text-secondary text-[length:var(--font-size-sm)]">
        Loading history...
      </div>
    );
  }

  if (activity.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <TimelineFilterPanel />
        <div className="flex items-center justify-center flex-1 text-text-tertiary text-[length:var(--font-size-sm)]">
          No collaboration history yet
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TimelineFilterPanel />

      <div
        ref={scrollRef}
        className="flex-1 overflow-x-auto overflow-y-hidden pb-4"
      >
        <div className="flex flex-col gap-4 min-w-max px-2">
          {grouped.map((group) => (
            <div key={group.day}>
              {/* Day separator */}
              <div className="text-[length:var(--font-size-xs)] font-[var(--font-weight-medium)] text-text-tertiary mb-2 pb-1 border-b border-border">
                {formatDayLabel(group.day)}
              </div>
              {/* Events row */}
              <div className="flex items-start gap-2">
                {group.entries.map((entry) => (
                  <TimelineEventNode
                    key={`${entry.ts}-${entry.user}-${entry.action}`}
                    event={entry}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Load more */}
      {activity.length >= limit && (
        <div className="flex justify-center pt-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setLimit((prev) => prev + 200)}
            className="px-3 py-1 rounded-[var(--radius-md)] text-[11px] font-semibold text-text-secondary hover:text-text-primary transition-all border border-border"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
