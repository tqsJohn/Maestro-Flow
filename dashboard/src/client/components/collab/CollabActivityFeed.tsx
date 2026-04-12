import { useEffect, useRef } from 'react';
import { useCollabStore } from '@/client/store/collab-store.js';
import { CollabActivityItem } from './CollabActivityItem.js';

// ---------------------------------------------------------------------------
// CollabActivityFeed — scrollable real-time activity stream
// ---------------------------------------------------------------------------

const MAX_RENDERED = 100;

export function CollabActivityFeed() {
  const activity = useCollabStore((s) => s.activity);
  const containerRef = useRef<HTMLDivElement>(null);

  const items = activity.slice(-MAX_RENDERED);

  // Auto-scroll to bottom when new activity arrives
  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length]);

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-text-tertiary text-[length:var(--font-size-sm)]">
          No activity yet
        </span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-1 overflow-y-auto h-full pr-1"
    >
      {items.map((entry) => (
        <CollabActivityItem key={`${entry.ts}-${entry.user}-${entry.action}`} entry={entry} />
      ))}
    </div>
  );
}
