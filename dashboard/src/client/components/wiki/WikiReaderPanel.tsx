import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

import { useWikiStore } from '@/client/store/wiki-store.js';
import { WikiLink, preprocessWikilinks } from './WikiLink.js';

/**
 * Progressive disclosure: title + frontmatter summary → markdown body →
 * raw JSONL (virtual entries) → metadata → backlinks.
 *
 * Body is rendered with react-markdown + remark-gfm. `[[wikilinks]]` are
 * preprocessed into `wiki:`-scheme links and intercepted by a custom `a`
 * component that renders `<WikiLink/>` instead.
 */
export function WikiReaderPanel() {
  const selectedId = useWikiStore((s) => s.selectedId);
  const byId = useWikiStore((s) => s.byId);
  const backlinksCache = useWikiStore((s) => s.backlinksCache);
  const setSelected = useWikiStore((s) => s.setSelected);

  if (!selectedId) {
    return (
      <div className="flex items-center justify-center h-full text-text-tertiary text-[length:var(--font-size-sm)]">
        Select an entry
      </div>
    );
  }

  const entry = byId[selectedId];
  if (!entry) {
    return (
      <div className="p-4 text-text-tertiary text-[length:var(--font-size-sm)]">
        Entry not found.
      </div>
    );
  }

  const backlinks = backlinksCache[selectedId] ?? [];
  const processedBody = entry.body ? preprocessWikilinks(entry.body) : '';

  const markdownComponents: Components = {
    a: ({ href, children, ...rest }) => {
      if (href?.startsWith('wiki:')) {
        return <WikiLink target={href.slice(5)}>{children}</WikiLink>;
      }
      return (
        <a href={href} target="_blank" rel="noreferrer noopener" {...rest}>
          {children}
        </a>
      );
    },
    code: ({ className, children }) => {
      const isBlock = Boolean(className);
      if (!isBlock) {
        return (
          <code className="px-1 py-0.5 rounded bg-bg-tertiary text-text-primary font-mono text-[length:var(--font-size-xs)]">
            {children}
          </code>
        );
      }
      return (
        <pre className="bg-bg-secondary border border-border rounded p-3 overflow-x-auto my-2">
          <code className={`block font-mono text-[length:var(--font-size-sm)] ${className ?? ''}`}>
            {children}
          </code>
        </pre>
      );
    },
  };

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto h-full">
      {/* Header */}
      <header className="flex flex-col gap-1">
        <div className="text-[length:var(--font-size-xs)] uppercase tracking-wider text-text-tertiary">
          {entry.type} · {entry.status}
        </div>
        <h2 className="text-[length:var(--font-size-xl)] font-semibold text-text-primary">
          {entry.title}
        </h2>
        {entry.summary && (
          <p className="text-text-secondary text-[length:var(--font-size-sm)]">
            {entry.summary}
          </p>
        )}
        <div className="text-[length:var(--font-size-xs)] text-text-tertiary">
          {entry.source.path}
          {entry.source.line !== undefined && `:${entry.source.line}`}
          {entry.phaseRef !== null && ` · phase ${entry.phaseRef}`}
        </div>
        {entry.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {entry.tags.map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 text-[length:var(--font-size-xs)] rounded bg-bg-tertiary text-text-secondary"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </header>

      {/* Body (markdown, for file entries) */}
      {entry.body && entry.source.kind === 'file' && (
        <section className="prose prose-sm max-w-none text-text-primary">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {processedBody}
          </ReactMarkdown>
        </section>
      )}

      {/* Raw JSONL (for virtual entries) */}
      {entry.source.kind === 'virtual' && entry.raw !== undefined && (
        <section>
          <h3 className="text-[length:var(--font-size-xs)] uppercase tracking-wider text-text-tertiary mb-1">
            Raw
          </h3>
          <pre className="whitespace-pre-wrap text-[length:var(--font-size-xs)] text-text-secondary font-mono bg-bg-secondary border border-border rounded p-3">
            {JSON.stringify(entry.raw, null, 2)}
          </pre>
        </section>
      )}

      {/* Extra frontmatter fields */}
      {Object.keys(entry.ext).length > 0 && (
        <section>
          <h3 className="text-[length:var(--font-size-xs)] uppercase tracking-wider text-text-tertiary mb-1">
            Metadata
          </h3>
          <pre className="whitespace-pre-wrap text-[length:var(--font-size-xs)] text-text-secondary font-mono bg-bg-secondary border border-border rounded p-3">
            {JSON.stringify(entry.ext, null, 2)}
          </pre>
        </section>
      )}

      {/* Backlinks */}
      {backlinks.length > 0 && (
        <section>
          <h3 className="text-[length:var(--font-size-xs)] uppercase tracking-wider text-text-tertiary mb-1">
            Backlinks ({backlinks.length})
          </h3>
          <ul className="flex flex-col gap-1">
            {backlinks.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => setSelected(b.id)}
                  className="text-accent-blue hover:underline text-[length:var(--font-size-sm)]"
                >
                  {b.title}
                </button>
                <span className="text-text-tertiary text-[length:var(--font-size-xs)] ml-2">
                  ({b.type})
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
