import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';

import { Hono } from 'hono';
import { toForwardSlash } from '../../shared/utils.js';

/**
 * Workspace routes.
 *
 * GET /api/workspace?tree=true      - full project directory tree
 * GET /api/workspace/file?path=xxx  - serve a single file (text content)
 */

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', '.next', '.nuxt', '.output',
  '.turbo', '.cache', '.parcel-cache', '__pycache__', '.venv',
  'coverage', '.nyc_output',
]);

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}

export function createWorkspaceRoutes(workflowRoot: string | (() => string)): Hono {
  const app = new Hono();
  const getProjectRoot = () => {
    const root = typeof workflowRoot === 'function' ? workflowRoot() : workflowRoot;
    return resolve(root, '..');
  };

  // Directory tree
  app.get('/api/workspace', async (c) => {
    const tree = c.req.query('tree');
    if (tree === 'true') {
      const projectRoot = getProjectRoot();
      const treeData = await buildTree(projectRoot, projectRoot, 0);
      return c.json(treeData);
    }
    return c.json({ error: 'Use ?tree=true' }, 400);
  });

  // File content
  app.get('/api/workspace/file', async (c) => {
    const filePath = c.req.query('path');
    if (!filePath) return c.json({ error: 'Missing path query' }, 400);

    const projectRoot = getProjectRoot();
    const requested = resolve(projectRoot, filePath);

    // Path traversal prevention
    if (!requested.startsWith(projectRoot + sep) && requested !== projectRoot) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    try {
      const content = await readFile(requested, 'utf-8');
      return c.text(content, 200, { 'Content-Type': 'text/plain; charset=utf-8' });
    } catch {
      return c.json({ error: 'File not found' }, 404);
    }
  });

  return app;
}

// ---------------------------------------------------------------------------
// Tree builder — max depth 6 to avoid excessive recursion
// ---------------------------------------------------------------------------

const MAX_DEPTH = 6;

async function buildTree(dir: string, root: string, depth: number): Promise<TreeNode[]> {
  if (depth > MAX_DEPTH) return [];
  const nodes: TreeNode[] = [];

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return nodes;
  }

  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = resolve(dir, entry.name);
    const relPath = toForwardSlash(relative(root, fullPath));

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const children = await buildTree(fullPath, root, depth + 1);
      nodes.push({ name: entry.name, path: relPath, type: 'directory', children });
    } else {
      nodes.push({ name: entry.name, path: relPath, type: 'file' });
    }
  }

  return nodes;
}
