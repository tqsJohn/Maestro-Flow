/**
 * Wiki Command — CLI wrapper for the dashboard `/api/wiki` endpoint.
 *
 * Subcommands: list, get, search, health, graph, orphans, hubs,
 * backlinks, forward, create, update, delete
 *
 * Requires the dashboard server to be running (`maestro view` will start it).
 * Base URL defaults to http://127.0.0.1:3001 and can be overridden with
 * `--base <url>` or `MAESTRO_DASHBOARD_URL`.
 */

import type { Command } from 'commander';
import { readFileSync } from 'node:fs';

const DEFAULT_BASE = process.env.MAESTRO_DASHBOARD_URL ?? 'http://127.0.0.1:3001';

export function registerWikiCommand(program: Command): void {
  const wiki = program
    .command('wiki')
    .description('Query and mutate the dashboard wiki endpoint (/api/wiki)')
    .option('--base <url>', 'Dashboard base URL', DEFAULT_BASE);

  // ── list ──────────────────────────────────────────────────────────────
  wiki
    .command('list')
    .alias('ls')
    .description('List wiki entries with optional filters')
    .option('--type <type>', 'Filter by type: project|roadmap|spec|phase|issue|lesson|memory|note')
    .option('--tag <tag>', 'Filter by tag')
    .option('--phase <n>', 'Filter by phase ref')
    .option('--status <status>', 'Filter by status')
    .option('-q, --query <q>', 'BM25 full-text query')
    .option('--group', 'Return results grouped by type')
    .option('--json', 'Output as JSON')
    .action(async (opts, cmd) => {
      const base = cmd.parent!.opts().base as string;
      const qs = new URLSearchParams();
      if (opts.type) qs.set('type', opts.type);
      if (opts.tag) qs.set('tag', opts.tag);
      if (opts.phase) qs.set('phase', opts.phase);
      if (opts.status) qs.set('status', opts.status);
      if (opts.query) qs.set('q', opts.query);
      if (opts.group) qs.set('group', 'true');
      const data = await apiGet(base, `/api/wiki?${qs.toString()}`);
      if (opts.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }
      if (opts.group) {
        const groups = (data.groups ?? {}) as Record<string, Array<{ id: string; title: string }>>;
        for (const [type, items] of Object.entries(groups)) {
          if (items.length === 0) continue;
          console.log(`\n[${type}] (${items.length})`);
          for (const e of items) console.log(`  ${e.id}  ${e.title}`);
        }
      } else {
        const entries = (data.entries ?? []) as Array<{ id: string; type: string; title: string }>;
        console.log(`Found ${entries.length} entries`);
        for (const e of entries) console.log(`  [${e.type}] ${e.id}  ${e.title}`);
      }
    });

  // ── get ───────────────────────────────────────────────────────────────
  wiki
    .command('get <id>')
    .description('Fetch a single wiki entry by id')
    .option('--json', 'Output as JSON')
    .action(async (id, opts, cmd) => {
      const base = cmd.parent!.opts().base as string;
      const data = await apiGet(base, `/api/wiki/${encodeURIComponent(id)}`);
      if (opts.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }
      const entry = data.entry;
      if (!entry) {
        console.error('Entry not found');
        process.exit(1);
      }
      console.log(`${entry.id}  [${entry.type}]`);
      console.log(`Title: ${entry.title}`);
      if (entry.summary) console.log(`Summary: ${entry.summary}`);
      if (entry.tags?.length) console.log(`Tags: ${entry.tags.join(', ')}`);
      if (entry.source?.path) console.log(`Path: ${entry.source.path}`);
      if (entry.body) {
        console.log('\n---');
        console.log(entry.body);
      }
    });

  // ── search ────────────────────────────────────────────────────────────
  wiki
    .command('search <query...>')
    .description('BM25 search (alias for `list -q`)')
    .option('--json', 'Output as JSON')
    .action(async (queryParts, opts, cmd) => {
      const base = cmd.parent!.opts().base as string;
      const q = queryParts.join(' ');
      const data = await apiGet(base, `/api/wiki?q=${encodeURIComponent(q)}`);
      if (opts.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }
      const entries = (data.entries ?? []) as Array<{ id: string; type: string; title: string }>;
      console.log(`Query: "${q}"  (${entries.length} results)`);
      for (const e of entries) console.log(`  [${e.type}] ${e.id}  ${e.title}`);
    });

  // ── health ────────────────────────────────────────────────────────────
  wiki
    .command('health')
    .description('Show wiki graph health score')
    .option('--json', 'Output as JSON')
    .action(async (opts, cmd) => {
      const base = cmd.parent!.opts().base as string;
      const data = await apiGet(base, '/api/wiki/health');
      if (opts.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }
      console.log(`Health Score: ${data.score}/100`);
      if (data.totals) {
        console.log(`  Entries:       ${data.totals.entries ?? 0}`);
        console.log(`  Broken links:  ${data.totals.brokenLinks ?? 0}`);
        console.log(`  Orphans:       ${data.totals.orphans ?? 0}`);
        console.log(`  Missing titles: ${data.totals.missingTitles ?? 0}`);
      }
      if (data.hubs?.length) {
        console.log('\nTop hubs:');
        for (const h of data.hubs.slice(0, 5)) {
          console.log(`  ${h.id}  (in-degree: ${h.inDegree})`);
        }
      }
    });

  // ── graph ─────────────────────────────────────────────────────────────
  wiki
    .command('graph')
    .description('Dump full graph (forwardLinks, backlinks, brokenLinks)')
    .action(async (_opts, cmd) => {
      const base = cmd.parent!.opts().base as string;
      const data = await apiGet(base, '/api/wiki/graph');
      console.log(JSON.stringify(data, null, 2));
    });

  // ── orphans ───────────────────────────────────────────────────────────
  wiki
    .command('orphans')
    .description('List orphan entries (no in or out links)')
    .option('--json', 'Output as JSON')
    .action(async (opts, cmd) => {
      const base = cmd.parent!.opts().base as string;
      const data = await apiGet(base, '/api/wiki/orphans');
      if (opts.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }
      const orphans = (data.orphans ?? []) as Array<{ id: string; type: string; title: string }>;
      console.log(`Orphans: ${orphans.length}`);
      for (const e of orphans) console.log(`  [${e.type}] ${e.id}  ${e.title}`);
    });

  // ── hubs ──────────────────────────────────────────────────────────────
  wiki
    .command('hubs')
    .description('Top-N hubs ranked by in-degree')
    .option('--limit <n>', 'Max entries', '10')
    .option('--json', 'Output as JSON')
    .action(async (opts, cmd) => {
      const base = cmd.parent!.opts().base as string;
      const data = await apiGet(base, `/api/wiki/hubs?limit=${encodeURIComponent(opts.limit)}`);
      if (opts.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }
      const hubs = (data.hubs ?? []) as Array<{ id: string; inDegree: number }>;
      console.log(`Top ${hubs.length} hubs`);
      for (const h of hubs) console.log(`  ${h.id}  (in: ${h.inDegree})`);
    });

  // ── backlinks ─────────────────────────────────────────────────────────
  wiki
    .command('backlinks <id>')
    .description('Show entries linking TO this id')
    .action(async (id, _opts, cmd) => {
      const base = cmd.parent!.opts().base as string;
      const data = await apiGet(base, `/api/wiki/${encodeURIComponent(id)}/backlinks`);
      const backlinks = (data.backlinks ?? []) as Array<{ id: string; title: string }>;
      console.log(`Backlinks for ${id}: ${backlinks.length}`);
      for (const e of backlinks) console.log(`  ${e.id}  ${e.title}`);
    });

  // ── forward ───────────────────────────────────────────────────────────
  wiki
    .command('forward <id>')
    .description('Show entries this id links TO')
    .action(async (id, _opts, cmd) => {
      const base = cmd.parent!.opts().base as string;
      const data = await apiGet(base, `/api/wiki/${encodeURIComponent(id)}/forward`);
      const forward = (data.forward ?? []) as Array<{ id: string; title: string }>;
      console.log(`Forward links from ${id}: ${forward.length}`);
      for (const e of forward) console.log(`  ${e.id}  ${e.title}`);
    });

  // ── create ────────────────────────────────────────────────────────────
  wiki
    .command('create')
    .description('Create a new markdown wiki entry')
    .requiredOption('--type <type>', 'spec|phase|memory|note')
    .requiredOption('--slug <slug>', 'kebab-case slug')
    .requiredOption('--title <title>', 'Entry title')
    .option('--body <text>', 'Inline body text')
    .option('--body-file <path>', 'Read body from file')
    .option('--phase-ref <n>', 'Required when type=phase')
    .option('--frontmatter <json>', 'Extra frontmatter as JSON object')
    .action(async (opts, cmd) => {
      const base = cmd.parent!.opts().base as string;
      const body = opts.bodyFile
        ? readFileSync(opts.bodyFile, 'utf-8')
        : (opts.body ?? '');
      const payload: Record<string, unknown> = {
        type: opts.type,
        slug: opts.slug,
        title: opts.title,
        body,
      };
      if (opts.phaseRef !== undefined) payload.phaseRef = Number(opts.phaseRef);
      if (opts.frontmatter) {
        try {
          payload.frontmatter = JSON.parse(opts.frontmatter);
        } catch {
          console.error('--frontmatter must be valid JSON');
          process.exit(1);
        }
      }
      const data = await apiJson(base, 'POST', '/api/wiki', payload);
      console.log(`Created: ${data.entry?.id ?? '(unknown)'}`);
      if (data.entry?.source?.path) console.log(`  Path: ${data.entry.source.path}`);
    });

  // ── update ────────────────────────────────────────────────────────────
  wiki
    .command('update <id>')
    .description('Update an existing markdown wiki entry')
    .option('--title <title>', 'New title')
    .option('--body <text>', 'New body text')
    .option('--body-file <path>', 'Read new body from file')
    .option('--frontmatter <json>', 'Frontmatter overrides as JSON object')
    .option('--expected-hash <hash>', 'sha256 for optimistic concurrency')
    .action(async (id, opts, cmd) => {
      const base = cmd.parent!.opts().base as string;
      const payload: Record<string, unknown> = {};
      if (opts.title !== undefined) payload.title = opts.title;
      if (opts.bodyFile) payload.body = readFileSync(opts.bodyFile, 'utf-8');
      else if (opts.body !== undefined) payload.body = opts.body;
      if (opts.expectedHash) payload.expectedHash = opts.expectedHash;
      if (opts.frontmatter) {
        try {
          payload.frontmatter = JSON.parse(opts.frontmatter);
        } catch {
          console.error('--frontmatter must be valid JSON');
          process.exit(1);
        }
      }
      const data = await apiJson(base, 'PUT', `/api/wiki/${encodeURIComponent(id)}`, payload);
      console.log(`Updated: ${data.entry?.id ?? id}`);
    });

  // ── delete ────────────────────────────────────────────────────────────
  wiki
    .command('delete <id>')
    .alias('rm')
    .description('Delete a markdown wiki entry')
    .action(async (id, _opts, cmd) => {
      const base = cmd.parent!.opts().base as string;
      await apiJson(base, 'DELETE', `/api/wiki/${encodeURIComponent(id)}`, null);
      console.log(`Deleted: ${id}`);
    });
}

// ── HTTP helpers ────────────────────────────────────────────────────────

async function apiGet(base: string, path: string): Promise<any> {
  const res = await fetchOrExit(`${base}${path}`);
  return parseOrExit(res);
}

async function apiJson(
  base: string,
  method: 'POST' | 'PUT' | 'DELETE',
  path: string,
  body: unknown,
): Promise<any> {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== null) init.body = JSON.stringify(body);
  const res = await fetchOrExit(`${base}${path}`, init);
  return parseOrExit(res);
}

async function fetchOrExit(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    console.error(`Failed to reach dashboard at ${url}`);
    console.error(`  ${(err as Error).message}`);
    console.error('  Hint: start the dashboard with "maestro view"');
    process.exit(1);
  }
}

async function parseOrExit(res: Response): Promise<any> {
  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    console.error(`Non-JSON response (${res.status}): ${text.slice(0, 200)}`);
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${data.error ?? text}`);
    if (data.details) console.error(`  details: ${JSON.stringify(data.details).slice(0, 300)}`);
    process.exit(1);
  }
  return data;
}
