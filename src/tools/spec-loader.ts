/**
 * Spec Loader (simplified)
 *
 * Filename-based category routing. No frontmatter dependency.
 * Reads .workflow/specs/*.md, filters by category via static mapping,
 * returns concatenated content.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================================
// Types
// ============================================================================

export type SpecCategory = 'general' | 'exploration' | 'planning' | 'execution' | 'debug' | 'test' | 'review' | 'validation';

export interface SpecLoadResult {
  content: string;
  matchedSpecs: string[];
  totalLoaded: number;
}

// ============================================================================
// Filename → Category mapping (single source of truth)
// ============================================================================

const CATEGORY_MAP: Record<string, SpecCategory[]> = {
  'coding-conventions.md':      ['execution'],
  'architecture-constraints.md': ['execution', 'planning'],
  'quality-rules.md':           ['execution'],
  'debug-notes.md':             ['debug'],
  'test-conventions.md':        ['test'],
  'review-standards.md':        ['review'],
  'validation-rules.md':        ['validation'],
  'learnings.md':               ['general'],
};

// learnings.md is always included regardless of category filter
const ALWAYS_INCLUDE = 'learnings.md';

const SPECS_DIR = '.workflow/specs';

// ============================================================================
// Public API
// ============================================================================

export function loadSpecs(projectPath: string, category?: SpecCategory): SpecLoadResult {
  const specsDir = join(projectPath, SPECS_DIR);

  if (!existsSync(specsDir)) {
    return { content: '', matchedSpecs: [], totalLoaded: 0 };
  }

  let files: string[];
  try {
    files = readdirSync(specsDir).filter(f => f.endsWith('.md'));
  } catch {
    return { content: '', matchedSpecs: [], totalLoaded: 0 };
  }

  const sections: string[] = [];
  const matched: string[] = [];

  for (const file of files) {
    if (!shouldInclude(file, category)) continue;

    const filePath = join(specsDir, file);
    let raw: string;
    try {
      raw = readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    const body = stripFrontmatter(raw).trim();
    if (!body) continue;

    sections.push(body);
    matched.push(file);
  }

  return {
    content: sections.length > 0
      ? `# Project Specs (${matched.length} loaded)\n\n${sections.join('\n\n---\n\n')}`
      : '',
    matchedSpecs: matched,
    totalLoaded: matched.length,
  };
}

// ============================================================================
// Internal
// ============================================================================

function shouldInclude(filename: string, category?: SpecCategory): boolean {
  // No category filter → load all
  if (!category) return true;

  // Always include learnings
  if (filename === ALWAYS_INCLUDE) return true;

  const cats = CATEGORY_MAP[filename];
  if (cats) return cats.includes(category);

  // Unknown files: include only when no category filter or category is 'general'
  return category === 'general';
}

function stripFrontmatter(raw: string): string {
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith('---')) return raw;
  const endIdx = trimmed.indexOf('\n---', 3);
  if (endIdx === -1) return raw;
  return trimmed.substring(endIdx + 4).trim();
}
