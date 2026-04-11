// ---------------------------------------------------------------------------
// `maestro team` — human-team collaboration CLI (team-lite, Waves 2 + 3A)
//
// Subcommands:
//   maestro team join      [--role admin|member]
//   maestro team whoami
//   maestro team report    --action <name> [--phase <n>] [--task-id <id>] [--target <s>]
//   maestro team status    [--window <minutes>]
//   maestro team sync      [--dry-run]
//   maestro team preflight --phase <n> [--force] [--json]
//
// Namespace: writes only to `.workflow/collab/**`. Never touches
// `.workflow/.team/` (that belongs to the agent pipeline, see team-msg.ts).
// ---------------------------------------------------------------------------

import type { Command } from 'commander';
import { execSync } from 'node:child_process';

import {
  joinTeam,
  resolveSelf,
  type MemberRecord,
} from '../tools/team-members.js';
import {
  reportActivity,
  readRecentActivity,
  rotateIfNeeded,
  type ActivityEvent,
} from '../tools/team-activity.js';

// ---------------------------------------------------------------------------
// join
// ---------------------------------------------------------------------------

function runJoin(opts: { role?: string }): void {
  const existing = resolveSelf();

  let role: 'admin' | 'member' | undefined;
  if (opts.role === 'admin' || opts.role === 'member') {
    role = opts.role;
  } else if (opts.role !== undefined) {
    console.error(`Error: --role must be "admin" or "member" (got "${opts.role}")`);
    process.exit(1);
  }

  let record: MemberRecord;
  try {
    record = joinTeam(role ? { role } : undefined);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${msg}`);
    process.exit(1);
    return;
  }

  const verb = existing ? 'Already joined' : 'Joined';
  console.log(
    `${verb} as ${record.uid} <${record.email}> on ${record.host} (${record.role})`,
  );
}

// ---------------------------------------------------------------------------
// whoami
// ---------------------------------------------------------------------------

function runWhoami(): void {
  const self = resolveSelf();
  if (!self) {
    console.error("Team mode not enabled. Run 'maestro team join' first.");
    process.exit(1);
    return;
  }
  console.log(`uid:    ${self.uid}`);
  console.log(`name:   ${self.name}`);
  console.log(`email:  ${self.email}`);
  console.log(`host:   ${self.host}`);
  console.log(`role:   ${self.role}`);
  console.log(`joined: ${self.joinedAt}`);
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

function runReport(opts: {
  action: string;
  phase?: string;
  taskId?: string;
  target?: string;
}): void {
  // Hooks call this; missing team is not an error — exit 0 silently.
  const self = resolveSelf();
  if (!self) return;

  let phase_id: number | undefined;
  if (opts.phase !== undefined) {
    const n = Number.parseInt(opts.phase, 10);
    if (!Number.isNaN(n)) phase_id = n;
  }

  reportActivity({
    user: self.uid,
    host: self.host,
    action: opts.action,
    phase_id,
    task_id: opts.taskId,
    target: opts.target,
  });
}

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

function runStatus(opts: { window?: string }): void {
  const self = resolveSelf();
  if (!self) {
    console.error('Team mode not enabled.');
    process.exit(1);
    return;
  }

  let window = 30;
  if (opts.window !== undefined) {
    const n = Number.parseInt(opts.window, 10);
    if (Number.isFinite(n) && n > 0) window = n;
  }

  const events = readRecentActivity(window);
  if (events.length === 0) {
    console.log(`No team activity in last ${window} min.`);
    return;
  }

  // Group by user@host, pick latest event per group.
  const latest = new Map<string, ActivityEvent>();
  for (const e of events) {
    const key = `${e.user}@${e.host}`;
    const prev = latest.get(key);
    if (!prev || Date.parse(e.ts) > Date.parse(prev.ts)) {
      latest.set(key, e);
    }
  }

  // Sort by ts descending — most recent first.
  const rows = Array.from(latest.entries()).sort(
    (a, b) => Date.parse(b[1].ts) - Date.parse(a[1].ts),
  );

  console.log(`Active in last ${window} min:`);
  const now = Date.now();
  for (const [key, evt] of rows) {
    const user = pad(key, 20);
    const action = pad(evt.action, 18);
    const loc = pad(formatLocation(evt), 18);
    const rel = formatRelative(now - Date.parse(evt.ts));
    console.log(`  ${user}  ${action}  ${loc}  ${rel}`);
  }
}

function formatLocation(e: ActivityEvent): string {
  if (e.phase_id !== undefined && e.task_id) return `P${e.phase_id}/${e.task_id}`;
  if (e.phase_id !== undefined) return `P${e.phase_id}`;
  if (e.task_id) return e.task_id;
  if (e.target) return e.target;
  return '-';
}

function formatRelative(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hour ago';
  return `${hours} hours ago`;
}

function pad(s: string, width: number): string {
  if (s.length >= width) return s.slice(0, width);
  return s + ' '.repeat(width - s.length);
}

// ---------------------------------------------------------------------------
// sync
// ---------------------------------------------------------------------------

/**
 * `maestro team sync` — wrap git stash/pull --rebase/pop/push and trigger
 * activity.jsonl rotation. Uses `stdio: 'inherit'` so users see git output.
 *
 * Exit codes:
 *   0 — success
 *   1 — team mode not enabled
 *   2 — rebase failed (aborted + stash restored)
 *   3 — push rejected twice in a row
 *   4 — stash pop conflict (left in conflict state for user to resolve)
 *   5 — detached HEAD
 */
function runSync(opts: { dryRun?: boolean }): void {
  const self = resolveSelf();
  if (!self) {
    console.error("Team mode not enabled. Run 'maestro team join' first.");
    process.exit(1);
    return;
  }

  // Detached HEAD check.
  try {
    execSync('git symbolic-ref --quiet HEAD', { stdio: ['ignore', 'ignore', 'ignore'] });
  } catch {
    console.error(
      'Error: detached HEAD. Checkout a branch before running `maestro team sync`.',
    );
    process.exit(5);
    return;
  }

  const dry = opts.dryRun === true;

  const say = (s: string): void => {
    console.log(dry ? `[dry-run] ${s}` : s);
  };

  // Dirty check: capture porcelain output (NOT inherited, we need the string).
  let dirty = false;
  try {
    const porcelain = execSync('git status --porcelain', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    dirty = porcelain.trim().length > 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: failed to read git status: ${msg}`);
    process.exit(2);
    return;
  }

  let stashed = false;

  // Step 1: stash if dirty.
  if (dirty) {
    say('Stashing local changes (maestro-team-sync-auto)...');
    if (!dry) {
      try {
        execSync('git stash push -m "maestro-team-sync-auto"', { stdio: 'inherit' });
        stashed = true;
      } catch {
        console.error('Error: git stash failed.');
        process.exit(2);
        return;
      }
    }
  }

  // Step 2: pull --rebase.
  say('Pulling from origin/HEAD (rebase)...');
  if (!dry) {
    try {
      execSync('git pull --rebase origin HEAD', { stdio: 'inherit' });
    } catch {
      console.error('Error: rebase failed. Aborting rebase and restoring stash.');
      try {
        execSync('git rebase --abort', { stdio: 'inherit' });
      } catch {
        // Best-effort; rebase --abort may fail if no rebase in progress.
      }
      if (stashed) {
        try {
          execSync('git stash pop', { stdio: 'inherit' });
        } catch {
          console.error('Warning: failed to restore stash. Run `git stash pop` manually.');
        }
      }
      process.exit(2);
      return;
    }
  }

  // Step 3: push (with one retry on non-fast-forward).
  say('Pushing...');
  if (!dry) {
    const tryPush = (): boolean => {
      try {
        execSync('git push', { stdio: 'inherit' });
        return true;
      } catch {
        return false;
      }
    };

    if (!tryPush()) {
      console.error('Push rejected. Retrying pull --rebase + push once...');
      try {
        execSync('git pull --rebase origin HEAD', { stdio: 'inherit' });
      } catch {
        console.error('Error: retry rebase failed.');
        if (stashed) {
          try {
            execSync('git stash pop', { stdio: 'inherit' });
          } catch {
            // Best-effort.
          }
        }
        process.exit(3);
        return;
      }
      if (!tryPush()) {
        console.error('Error: push still rejected after retry.');
        if (stashed) {
          try {
            execSync('git stash pop', { stdio: 'inherit' });
          } catch {
            // Best-effort.
          }
        }
        process.exit(3);
        return;
      }
    }
  }

  // Step 4: stash pop.
  // TODO: wire commit tag if sync ever authors its own commit
  //       (design doc 耦合 4 — downscoped: sync produces no user commits).
  if (stashed) {
    say('Restoring stashed changes...');
    if (!dry) {
      try {
        execSync('git stash pop', { stdio: 'inherit' });
      } catch {
        console.error(
          'Error: stash pop produced conflicts. Resolve them manually ' +
            '(see `git status`), then commit. Your changes are in the stash.',
        );
        process.exit(4);
        return;
      }
    }
  }

  // Step 5: rotation check.
  if (!dry) {
    const archivePath = rotateIfNeeded(10 * 1024 * 1024);
    if (archivePath) {
      console.log(`Rotated activity.jsonl → ${archivePath}`);
    }
  } else {
    say('Would check activity.jsonl rotation (10 MB threshold).');
  }

  console.log(dry ? '[dry-run] Sync plan complete.' : 'Sync complete.');
}

// ---------------------------------------------------------------------------
// preflight
// ---------------------------------------------------------------------------

/**
 * Format a short relative time: "just now" / "N min" / "Nh Mm".
 * Inline to avoid adding a dependency.
 */
function relTime(ts: string, now: number): string {
  const ms = now - new Date(ts).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

export interface PreflightResult {
  exitCode: 0 | 1 | 2;
  warnings: string[]; // one line per unique (user@host) conflict
  conflicts: Array<{
    user: string;
    host: string;
    action: string;
    ts: string;
    relative: string;
  }>;
}

/**
 * Pure preflight logic, exported for tests.
 *
 * Algorithm:
 *   1. If no self → exit 0 (team mode off is a safe no-op).
 *   2. Fetch recent activity (30 min window, clock tolerance handled by the
 *      team-activity module).
 *   3. Filter: same phase, different user.
 *   4. Deduplicate by `user@host` keeping the most recent event.
 *   5. Emit one warning line per unique teammate.
 *
 * `force` affects ONLY the exit code — warnings are still returned verbatim
 * so callers can print them to stderr before continuing.
 */
export function runPreflight(
  phase: number,
  opts: { force?: boolean },
  deps?: {
    getSelf?: () => MemberRecord | null;
    getActivity?: (mins: number) => ActivityEvent[];
    now?: () => number;
  },
): PreflightResult {
  const getSelf = deps?.getSelf ?? resolveSelf;
  const getActivity = deps?.getActivity ?? readRecentActivity;
  const now = deps?.now ?? Date.now;

  const self = getSelf();
  if (!self) {
    return { exitCode: 0, warnings: [], conflicts: [] };
  }

  const events = getActivity(30);
  const filtered = events.filter(
    (e) => e.phase_id === phase && e.user !== self.uid,
  );

  // Dedupe by user@host, keep the most recent.
  const latest = new Map<string, ActivityEvent>();
  for (const e of filtered) {
    const key = `${e.user}@${e.host}`;
    const prev = latest.get(key);
    if (!prev || Date.parse(e.ts) > Date.parse(prev.ts)) {
      latest.set(key, e);
    }
  }

  if (latest.size === 0) {
    return { exitCode: 0, warnings: [], conflicts: [] };
  }

  const nowMs = now();
  const warnings: string[] = [];
  const conflicts: PreflightResult['conflicts'] = [];
  // Stable order: most recent first.
  const rows = Array.from(latest.values()).sort(
    (a, b) => Date.parse(b.ts) - Date.parse(a.ts),
  );
  for (const e of rows) {
    const rel = relTime(e.ts, nowMs);
    warnings.push(
      `\u26a0 ${e.user}@${e.host} is active on phase ${phase} ` +
        `(last: ${e.action}, ${rel} ago)`,
    );
    conflicts.push({
      user: e.user,
      host: e.host,
      action: e.action,
      ts: e.ts,
      relative: rel,
    });
  }

  return {
    exitCode: opts.force ? 0 : 1,
    warnings,
    conflicts,
  };
}

function runPreflightCli(opts: {
  phase?: string;
  force?: boolean;
  json?: boolean;
}): void {
  // Team mode off is a silent no-op. Resolve self BEFORE checking phase arg
  // so that CI/hooks invoking preflight on machines without team config
  // never fail on missing flags.
  if (!resolveSelf()) {
    process.exit(0);
    return;
  }

  if (opts.phase === undefined) {
    console.error('Error: --phase <n> is required.');
    process.exit(2);
    return;
  }
  const phase = Number.parseInt(opts.phase, 10);
  if (!Number.isFinite(phase) || Number.isNaN(phase)) {
    console.error(`Error: --phase must be an integer (got "${opts.phase}").`);
    process.exit(2);
    return;
  }

  const result = runPreflight(phase, { force: opts.force });

  if (opts.json) {
    process.stdout.write(JSON.stringify(result.conflicts) + '\n');
  } else {
    for (const line of result.warnings) {
      console.error(line);
    }
    if (result.warnings.length > 0 && !opts.force) {
      console.error('Proceed anyway? Use --force or confirm with user.');
    }
  }

  process.exit(result.exitCode);
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export function registerTeamCommand(program: Command): void {
  const team = program
    .command('team')
    .description('Human-team collaboration — join, report, and view activity');

  team
    .command('join')
    .description('Register the current git identity as a team member (idempotent)')
    .option('--role <role>', 'Force role: admin or member')
    .action((opts: { role?: string }) => runJoin(opts));

  team
    .command('whoami')
    .description('Show the current team member record')
    .action(() => runWhoami());

  team
    .command('report')
    .description('Append an activity event (usually called from hooks)')
    .requiredOption('--action <name>', 'Command or tool name')
    .option('--phase <n>', 'Associated phase id')
    .option('--task-id <id>', 'Associated task id')
    .option('--target <s>', 'Operation target (file, spec, issue id)')
    .action((opts: { action: string; phase?: string; taskId?: string; target?: string }) =>
      runReport(opts),
    );

  team
    .command('status')
    .description('Show recent team activity')
    .option('--window <minutes>', 'Look-back window in minutes', '30')
    .action((opts: { window?: string }) => runStatus(opts));

  team
    .command('sync')
    .description('Sync with remote: git stash/pull --rebase/pop/push + log rotation')
    .option('--dry-run', 'Print the plan without executing any git command')
    .action((opts: { dryRun?: boolean }) => runSync(opts));

  team
    .command('preflight')
    .description('Warn if teammates are active on the same phase')
    .option('--phase <n>', 'Phase id to check')
    .option('--force', 'Print warnings but exit 0')
    .option('--json', 'Output conflicts as JSON')
    .action((opts: { phase?: string; force?: boolean; json?: boolean }) =>
      runPreflightCli(opts),
    );
}
