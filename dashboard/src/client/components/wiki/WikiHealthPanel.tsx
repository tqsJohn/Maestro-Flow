import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useWikiStore } from '@/client/store/wiki-store.js';

/**
 * WikiHealthPanel — summary of index health: score, totals, top hubs,
 * orphan list, broken links. Lives in the side column above the grouped list.
 */
export function WikiHealthPanel() {
  const { health, fetchHealth, setSelected, byId } = useWikiStore(
    useShallow((s) => ({
      health: s.health,
      fetchHealth: s.fetchHealth,
      setSelected: s.setSelected,
      byId: s.byId,
    })),
  );

  useEffect(() => {
    void fetchHealth();
  }, [fetchHealth]);

  if (!health) {
    return (
      <div className="p-3 text-[length:var(--font-size-xs)] text-text-tertiary">
        Loading health…
      </div>
    );
  }

  const scoreColor =
    health.score >= 80
      ? 'text-accent-green'
      : health.score >= 50
        ? 'text-accent-yellow'
        : 'text-accent-red';

  return (
    <div className="flex flex-col gap-3 p-3 border-b border-border text-[length:var(--font-size-xs)]">
      <div className="flex items-center justify-between">
        <span className="uppercase tracking-wider text-text-tertiary">Health</span>
        <span className={`text-[length:var(--font-size-lg)] font-semibold ${scoreColor}`}>
          {health.score}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1 text-text-secondary">
        <div>Entries: {health.totals.entries}</div>
        <div>Orphans: {health.totals.orphans}</div>
        <div>Broken: {health.totals.brokenLinks}</div>
        <div>Untitled: {health.totals.missingTitles}</div>
      </div>

      {health.hubs.length > 0 && (
        <div>
          <div className="uppercase tracking-wider text-text-tertiary mb-1">Top hubs</div>
          <ul className="flex flex-col gap-0.5">
            {health.hubs.slice(0, 5).map((h) => (
              <li key={h.id} className="flex justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setSelected(h.id)}
                  className="truncate text-accent-blue hover:underline text-left"
                >
                  {byId[h.id]?.title ?? h.id}
                </button>
                <span className="text-text-tertiary shrink-0">{h.inDegree}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {health.orphans.length > 0 && (
        <div>
          <div className="uppercase tracking-wider text-text-tertiary mb-1">
            Orphans ({health.orphans.length})
          </div>
          <ul className="flex flex-col gap-0.5 max-h-24 overflow-y-auto">
            {health.orphans.slice(0, 10).map((id) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setSelected(id)}
                  className="truncate text-accent-blue hover:underline text-left w-full"
                >
                  {byId[id]?.title ?? id}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {health.brokenLinks.length > 0 && (
        <div>
          <div className="uppercase tracking-wider text-text-tertiary mb-1">
            Broken ({health.brokenLinks.length})
          </div>
          <ul className="flex flex-col gap-0.5 max-h-24 overflow-y-auto text-text-secondary">
            {health.brokenLinks.slice(0, 10).map((bl, i) => (
              <li key={`${bl.sourceId}-${i}`} className="truncate">
                <span className="text-text-tertiary">{bl.sourceId}</span> →{' '}
                <span className="line-through">{bl.target}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
