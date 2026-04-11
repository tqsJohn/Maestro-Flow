import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import Search from 'lucide-react/dist/esm/icons/search.js';

import { useWikiStore, type WikiNodeType } from '@/client/store/wiki-store.js';
import { WikiGroupedView } from '@/client/components/wiki/WikiGroupedView.js';
import { WikiReaderPanel } from '@/client/components/wiki/WikiReaderPanel.js';
import { WikiHealthPanel } from '@/client/components/wiki/WikiHealthPanel.js';

const TYPE_FILTERS: Array<{ value: WikiNodeType | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'project', label: 'Project' },
  { value: 'roadmap', label: 'Roadmap' },
  { value: 'spec', label: 'Specs' },
  { value: 'phase', label: 'Phases' },
  { value: 'issue', label: 'Issues' },
  { value: 'lesson', label: 'Lessons' },
  { value: 'memory', label: 'Memory' },
  { value: 'note', label: 'Notes' },
];

/**
 * WikiPage — unified wiki index backed by /api/wiki.
 * Left: health panel + filters + grouped list.
 * Right: reader panel with markdown rendering and wikilink interception.
 */
export function WikiPage() {
  const {
    fetchEntries,
    loading,
    error,
    entries,
    search,
    setSearch,
    typeFilter,
    setTypeFilter,
  } = useWikiStore(
    useShallow((s) => ({
      fetchEntries: s.fetchEntries,
      loading: s.loading,
      error: s.error,
      entries: s.entries,
      search: s.search,
      setSearch: s.setSearch,
      typeFilter: s.typeFilter,
      setTypeFilter: s.setTypeFilter,
    })),
  );

  useEffect(() => {
    void fetchEntries();
  }, [fetchEntries]);

  // Re-fetch when search changes (BM25 runs server-side).
  useEffect(() => {
    const t = setTimeout(() => {
      void fetchEntries();
    }, 200);
    return () => clearTimeout(t);
  }, [search, fetchEntries]);

  return (
    <div className="flex h-full">
      {/* Left column — health + filters + list */}
      <aside className="flex flex-col w-96 border-r border-border">
        <WikiHealthPanel />
        <div className="flex flex-col gap-2 p-3 border-b border-border">
          <div className="relative">
            <Search
              size={14}
              strokeWidth={1.8}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <input
              type="text"
              value={search}
              placeholder="Search (BM25 full-text)"
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-7 pr-2 py-1.5 bg-bg-secondary border border-border rounded text-[length:var(--font-size-sm)] text-text-primary"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setTypeFilter(f.value)}
                className={`px-2 py-0.5 rounded text-[length:var(--font-size-xs)] border ${
                  typeFilter === f.value
                    ? 'bg-bg-secondary border-border-strong text-text-primary'
                    : 'bg-bg-primary border-border text-text-tertiary hover:bg-bg-secondary'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="text-[length:var(--font-size-xs)] text-text-tertiary">
            {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}
            {loading && ' · loading…'}
          </div>
          {error && (
            <div className="text-[length:var(--font-size-xs)] text-accent-red">
              {error}
            </div>
          )}
        </div>
        <div className="flex-1 min-h-0">
          <WikiGroupedView />
        </div>
      </aside>

      {/* Right column — reader */}
      <main className="flex-1 min-w-0">
        <WikiReaderPanel />
      </main>
    </div>
  );
}
