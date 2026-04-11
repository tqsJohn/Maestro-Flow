import { useWikiStore } from '@/client/store/wiki-store.js';

/**
 * Resolves `[[id-or-title]]` references to a clickable chip. Unresolved links
 * render as disabled text so authors can see broken references.
 */
export function WikiLink({
  target,
  children,
}: {
  target: string;
  children?: React.ReactNode;
}) {
  const byId = useWikiStore((s) => s.byId);
  const setSelected = useWikiStore((s) => s.setSelected);

  const exact = byId[target];
  const ciMatch = !exact
    ? Object.values(byId).find(
        (d) => d.title.toLowerCase() === target.toLowerCase(),
      )
    : undefined;
  const resolved = exact ?? ciMatch;

  if (!resolved) {
    return (
      <span
        className="text-text-tertiary line-through"
        title={`Unresolved link: ${target}`}
      >
        {children ?? `[[${target}]]`}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setSelected(resolved.id)}
      className="text-accent-blue hover:underline"
      title={resolved.title}
    >
      {children ?? `[[${resolved.title}]]`}
    </button>
  );
}

/** Split body text on `[[id]]` tokens, rendering WikiLink for each hit. */
export function renderWithWikilinks(body: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(body)) !== null) {
    if (m.index > lastIdx) parts.push(body.slice(lastIdx, m.index));
    parts.push(<WikiLink key={`wl-${key++}`} target={m[1]} />);
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < body.length) parts.push(body.slice(lastIdx));
  return parts;
}

/**
 * Preprocess markdown body — replace `[[target]]` with `[target](wiki:target)`
 * so react-markdown treats wikilinks as links. Respects fenced code blocks
 * (lines between triple backticks are left untouched).
 */
export function preprocessWikilinks(body: string): string {
  const lines = body.split('\n');
  let inFence = false;
  const out: string[] = [];
  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    out.push(line.replace(/\[\[([^\]]+)\]\]/g, (_, target) => `[${target}](wiki:${target})`));
  }
  return out.join('\n');
}
