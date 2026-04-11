export type WikiNodeType =
  | 'project'
  | 'roadmap'
  | 'spec'
  | 'phase'
  | 'issue'
  | 'lesson'
  | 'memory'
  | 'note';

export type WikiStatus =
  | 'draft'
  | 'active'
  | 'completed'
  | 'blocked'
  | 'archived';

export interface WikiSource {
  kind: 'file' | 'virtual';
  /** Forward-slash relative path from .workflow/ root. */
  path: string;
  /** 1-based line number for virtual JSONL rows. */
  line?: number;
}

export interface WikiEntry {
  /** Inferred: `<type>-<slug>`. Stable across rebuilds. */
  id: string;
  type: WikiNodeType;
  title: string;
  summary: string;
  tags: string[];
  status: WikiStatus;
  /** ISO string from fs.stat.birthtimeMs (or JSONL created_at). */
  created: string;
  /** ISO string from fs.stat.mtimeMs (or JSONL updated_at). */
  updated: string;
  /** Parsed from `phases/(\d+)-` directory pattern. */
  phaseRef: number | null;
  /** Normalized wikilink ids declared via frontmatter `related`. */
  related: string[];
  source: WikiSource;
  /** Markdown body (empty string for virtual entries). */
  body: string;
  /** Original JSONL row preserved for virtual entries. */
  raw?: unknown;
  /**
   * Preserves non-standard frontmatter fields so existing specs keep their
   * `category`, `readMode`, `priority`, `keywords` etc. intact.
   */
  ext: Record<string, unknown>;
}

export interface WikiIndex {
  entries: WikiEntry[];
  byId: Record<string, WikiEntry>;
  byType: Record<WikiNodeType, WikiEntry[]>;
  /** Map of target entry id -> source entry ids that link to it. */
  backlinks: Record<string, string[]>;
  generatedAt: number;
}

export interface WikiFilters {
  type?: WikiNodeType;
  tag?: string;
  phase?: number;
  status?: WikiStatus;
  /** BM25 query string — tokenized against title + summary + tags + body. */
  q?: string;
}
