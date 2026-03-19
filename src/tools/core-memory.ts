/**
 * Core Memory Tool - Simplified JSON-based memory management
 *
 * Operations: list, import, export, search
 * Storage: ~/.maestro/data/core-memory/{project-hash}.json
 *
 * Simplified from CCW's SQLite-based implementation to avoid native module dependencies.
 */

import { z } from 'zod';
import type { ToolSchema, CcwToolResult } from '../types/tool-schema.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { createHash } from 'crypto';
import { homedir } from 'os';
import { getProjectRoot } from '../utils/path-validator.js';

// --- Types ---

interface MemoryEntry {
  id: string;
  content: string;
  tags: string[];
  archived: boolean;
  created_at: string;
  updated_at: string;
}

interface MemoryStore {
  version: number;
  project_path: string;
  memories: MemoryEntry[];
}

// --- Zod Schema ---

const OperationEnum = z.enum(['list', 'import', 'export', 'search']);

const ParamsSchema = z.object({
  operation: OperationEnum,
  path: z.string().optional(),
  text: z.string().optional(),
  id: z.string().optional(),
  query: z.string().optional(),
  limit: z.number().optional().default(100),
  tags: z.array(z.string()).optional(),
});

type Params = z.infer<typeof ParamsSchema>;

// --- Storage ---

function getProjectHash(projectPath: string): string {
  return createHash('md5').update(projectPath.toLowerCase()).digest('hex').substring(0, 12);
}

function getStorePath(projectPath: string): string {
  const hash = getProjectHash(projectPath);
  return join(homedir(), '.maestro', 'data', 'core-memory', `${hash}.json`);
}

function loadStore(projectPath: string): MemoryStore {
  const storePath = getStorePath(projectPath);
  if (!existsSync(storePath)) {
    return {
      version: 1,
      project_path: projectPath,
      memories: [],
    };
  }
  try {
    return JSON.parse(readFileSync(storePath, 'utf-8')) as MemoryStore;
  } catch {
    return {
      version: 1,
      project_path: projectPath,
      memories: [],
    };
  }
}

function saveStore(projectPath: string, store: MemoryStore): void {
  const storePath = getStorePath(projectPath);
  const dir = join(homedir(), '.maestro', 'data', 'core-memory');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf-8');
}

function generateId(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return `CMEM-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function getProjectPath(explicitPath?: string): string {
  return explicitPath || getProjectRoot();
}

// --- Operations ---

const PREVIEW_MAX_LENGTH = 100;

interface CompactMemory {
  id: string;
  preview: string;
  archived: boolean;
  updated_at: string;
  tags: string[];
}

function executeList(params: Params): CcwToolResult {
  const { limit, path, tags } = params;
  const projectPath = getProjectPath(path);
  const store = loadStore(projectPath);

  let memories = store.memories;

  // Filter by tags if provided
  if (tags && tags.length > 0) {
    memories = memories.filter(m =>
      tags.every(t => m.tags.includes(t))
    );
  }

  // Apply limit
  memories = memories.slice(0, limit);

  const compact: CompactMemory[] = memories.map(m => {
    const preview = m.content.length > PREVIEW_MAX_LENGTH
      ? m.content.substring(0, PREVIEW_MAX_LENGTH) + '...'
      : m.content;
    return {
      id: m.id,
      preview,
      archived: m.archived,
      updated_at: m.updated_at,
      tags: m.tags,
    };
  });

  return {
    success: true,
    result: {
      operation: 'list',
      memories: compact,
      total: compact.length,
    },
  };
}

function executeImport(params: Params): CcwToolResult {
  const { text, path, tags } = params;

  if (!text || text.trim() === '') {
    return { success: false, error: 'Parameter "text" is required for import operation' };
  }

  const projectPath = getProjectPath(path);
  const store = loadStore(projectPath);
  const now = new Date().toISOString();
  const id = generateId();

  const entry: MemoryEntry = {
    id,
    content: text.trim(),
    tags: tags || [],
    archived: false,
    created_at: now,
    updated_at: now,
  };

  store.memories.push(entry);
  saveStore(projectPath, store);

  return {
    success: true,
    result: {
      operation: 'import',
      id,
      message: `Created memory: ${id}`,
    },
  };
}

function executeExport(params: Params): CcwToolResult {
  const { id, path } = params;

  if (!id) {
    return { success: false, error: 'Parameter "id" is required for export operation' };
  }

  const projectPath = getProjectPath(path);
  const store = loadStore(projectPath);
  const memory = store.memories.find(m => m.id === id);

  if (!memory) {
    return { success: false, error: `Memory "${id}" not found` };
  }

  return {
    success: true,
    result: {
      operation: 'export',
      id,
      content: memory.content,
    },
  };
}

function executeSearch(params: Params): CcwToolResult {
  const { query, limit, path, tags } = params;

  if (!query) {
    return { success: false, error: 'Parameter "query" is required for search operation' };
  }

  const projectPath = getProjectPath(path);
  const store = loadStore(projectPath);

  // Simple keyword-based search (no embeddings)
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter(Boolean);

  let results = store.memories
    .map(m => {
      const contentLower = m.content.toLowerCase();
      // Score: count how many query terms appear in the content
      const matchCount = queryTerms.filter(term => contentLower.includes(term)).length;
      return { memory: m, score: matchCount / queryTerms.length };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);

  // Filter by tags if provided
  if (tags && tags.length > 0) {
    results = results.filter(r =>
      tags.every(t => r.memory.tags.includes(t))
    );
  }

  results = results.slice(0, limit);

  return {
    success: true,
    result: {
      operation: 'search',
      query,
      matches: results.map(r => ({
        id: r.memory.id,
        score: Math.round(r.score * 100) / 100,
        excerpt: r.memory.content.substring(0, 200) + (r.memory.content.length > 200 ? '...' : ''),
        tags: r.memory.tags,
      })),
      total_matches: results.length,
    },
  };
}

// --- Tool Schema ---

export const schema: ToolSchema = {
  name: 'core_memory',
  description: `Core memory management for strategic context. JSON-based storage at ~/.maestro/data/core-memory/.

**Operations & Required Parameters:**

*   **list**: List all memories.
    *   *limit* (number): Max results (default: 100).
    *   *tags* (array): Filter by tags (AND logic).
    *   *path* (string): Project path override.

*   **import**: Import text as new memory.
    *   **text** (string, **REQUIRED**): Content to import.
    *   *tags* (array): Tags for the memory.
    *   *path* (string): Project path override.

*   **export**: Export memory as plain text.
    *   **id** (string, **REQUIRED**): Memory ID (e.g., CMEM-20260305-120000).
    *   *path* (string): Project path override.

*   **search**: Search memories by keyword matching.
    *   **query** (string, **REQUIRED**): Search query.
    *   *limit* (number): Max results (default: 100).
    *   *tags* (array): Filter by tags.
    *   *path* (string): Project path override.

**Memory ID Format:** CMEM-YYYYMMDD-HHMMSS`,
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['list', 'import', 'export', 'search'],
        description: 'Operation to perform',
      },
      path: {
        type: 'string',
        description: 'Project path (overrides auto-detected project root)',
      },
      text: {
        type: 'string',
        description: 'Text content to import (required for import)',
      },
      id: {
        type: 'string',
        description: 'Memory ID (required for export)',
      },
      query: {
        type: 'string',
        description: 'Search query (required for search)',
      },
      limit: {
        type: 'number',
        description: 'Max results (default: 100)',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by tags (AND logic)',
      },
    },
    required: ['operation'],
  },
};

// --- Handler ---

export async function handler(params: Record<string, unknown>): Promise<CcwToolResult> {
  const parsed = ParamsSchema.safeParse(params);
  if (!parsed.success) {
    return { success: false, error: `Invalid params: ${parsed.error.message}` };
  }

  try {
    switch (parsed.data.operation) {
      case 'list': return executeList(parsed.data);
      case 'import': return executeImport(parsed.data);
      case 'export': return executeExport(parsed.data);
      case 'search': return executeSearch(parsed.data);
      default:
        return { success: false, error: `Unknown operation: ${parsed.data.operation}` };
    }
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}
