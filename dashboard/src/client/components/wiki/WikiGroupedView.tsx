import { useWikiStore, type WikiEntry, type WikiNodeType } from '@/client/store/wiki-store.js';

const TYPE_LABELS: Record<WikiNodeType, string> = {
  project: 'Project',
  roadmap: 'Roadmap',
  spec: 'Specs',
  phase: 'Phases',
  issue: 'Issues',
  lesson: 'Lessons',
  memory: 'Memory',
  note: 'Notes',
};

const TYPE_ORDER: WikiNodeType[] = [
  'project',
  'roadmap',
  'spec',
  'phase',
  'issue',
  'lesson',
  'memory',
  'note',
];

/**
 * Type-grouped list of wiki entries. Cards show title + summary + tag row.
 * Clicking a card selects it for the reader panel.
 */
export function WikiGroupedView() {
  const groups = useWikiStore((s) => s.entriesByType());
  const selectedId = useWikiStore((s) => s.selectedId);
  const setSelected = useWikiStore((s) => s.setSelected);

  return (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto">
      {TYPE_ORDER.map((type) => {
        const entries = groups[type];
        if (!entries || entries.length === 0) return null;
        return (
          <section key={type}>
            <h3 className="px-2 py-1 text-[length:var(--font-size-xs)] text-text-tertiary uppercase tracking-wider">
              {TYPE_LABELS[type]} ({entries.length})
            </h3>
            <ul className="flex flex-col gap-1">
              {entries.map((entry) => (
                <WikiCard
                  key={entry.id}
                  entry={entry}
                  selected={entry.id === selectedId}
                  onSelect={() => setSelected(entry.id)}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function WikiCard({
  entry,
  selected,
  onSelect,
}: {
  entry: WikiEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`w-full text-left rounded px-2 py-1.5 border text-[length:var(--font-size-sm)] transition-colors ${
          selected
            ? 'bg-bg-secondary border-border-strong'
            : 'bg-bg-primary border-border hover:bg-bg-secondary'
        }`}
      >
        <div className="font-medium text-text-primary truncate">{entry.title}</div>
        {entry.summary && (
          <div className="text-text-tertiary text-[length:var(--font-size-xs)] line-clamp-2">
            {entry.summary}
          </div>
        )}
        {entry.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {entry.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 text-[length:var(--font-size-xs)] rounded bg-bg-tertiary text-text-secondary"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </button>
    </li>
  );
}
