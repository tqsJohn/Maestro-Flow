#!/usr/bin/env node
/**
 * Team Lite end-to-end smoke test (Wave 4 Deliverable 2).
 *
 * Spins up a throwaway git repo in a temp directory, drives the entire
 * `maestro team` CLI surface through a scripted sequence, asserts on exit
 * codes and stdout/stderr patterns, then cleans up.
 *
 * Runs without npm/test dependencies: only node + git are required, both
 * of which maestro already requires.
 *
 * Usage:
 *   node scripts/team-lite-smoke.mjs
 *
 * Exit codes:
 *   0  — all assertions passed
 *   1  — a step failed (details printed to stderr)
 *   2  — prerequisite missing (git / build failure)
 */

import { spawnSync, execSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const MAESTRO_BIN = join(REPO_ROOT, 'bin', 'maestro.js');

const NODE = process.execPath;

let tempDir = '';
let stepIndex = 0;

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function log(msg) {
  process.stdout.write(`[smoke] ${msg}\n`);
}

function fail(msg, extras) {
  process.stderr.write(`\n[smoke] FAIL: ${msg}\n`);
  if (extras) {
    for (const [k, v] of Object.entries(extras)) {
      process.stderr.write(`  ${k}: ${JSON.stringify(v)}\n`);
    }
  }
  cleanup();
  process.exit(1);
}

function cleanup() {
  if (tempDir && existsSync(tempDir)) {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch (err) {
      process.stderr.write(`[smoke] cleanup warning: ${err.message}\n`);
    }
  }
}

/**
 * Run `maestro team <args>` in the scratch directory. Returns
 * { status, stdout, stderr }.
 */
function runMaestro(args, opts = {}) {
  const env = {
    ...process.env,
    MAESTRO_PROJECT_ROOT: tempDir,
    // Silence optional color/output noise.
    NO_COLOR: '1',
  };
  const result = spawnSync(NODE, [MAESTRO_BIN, ...args], {
    cwd: tempDir,
    env,
    encoding: 'utf-8',
    input: opts.input,
    // Commander calls process.exit which surfaces as status code on
    // spawnSync; no special handling required.
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function expectStep(label, spec, actual) {
  stepIndex += 1;
  const prefix = `#${stepIndex} ${label}`;
  if (spec.status !== undefined && actual.status !== spec.status) {
    fail(`${prefix}: expected exit ${spec.status}, got ${actual.status}`, {
      stdout: actual.stdout,
      stderr: actual.stderr,
    });
  }
  if (spec.stdoutContains) {
    for (const pat of spec.stdoutContains) {
      if (!actual.stdout.includes(pat)) {
        fail(`${prefix}: stdout missing pattern "${pat}"`, {
          stdout: actual.stdout,
          stderr: actual.stderr,
        });
      }
    }
  }
  if (spec.stderrContains) {
    for (const pat of spec.stderrContains) {
      if (!actual.stderr.includes(pat)) {
        fail(`${prefix}: stderr missing pattern "${pat}"`, {
          stdout: actual.stdout,
          stderr: actual.stderr,
        });
      }
    }
  }
  if (spec.stdoutEmpty && actual.stdout.trim().length > 0) {
    fail(`${prefix}: expected empty stdout`, { stdout: actual.stdout });
  }
  log(`ok ${prefix}`);
}

// ---------------------------------------------------------------------------
// Main sequence
// ---------------------------------------------------------------------------

function main() {
  // --- Prerequisites ---
  if (!existsSync(MAESTRO_BIN)) {
    process.stderr.write(`[smoke] maestro bin not found at ${MAESTRO_BIN}\n`);
    process.exit(2);
  }

  log('building project (npm run build)...');
  try {
    execSync('npm run build', { cwd: REPO_ROOT, stdio: 'inherit' });
  } catch (err) {
    process.stderr.write(`[smoke] build failed: ${err.message}\n`);
    process.exit(2);
  }

  // --- Temp workspace ---
  tempDir = mkdtempSync(join(tmpdir(), 'team-lite-smoke-'));
  log(`temp workspace: ${tempDir}`);

  try {
    execSync('git init -q', { cwd: tempDir });
    execSync('git config user.name "Smoke Tester"', { cwd: tempDir });
    execSync('git config user.email "smoke@example.com"', { cwd: tempDir });
  } catch (err) {
    fail(`git init failed: ${err.message}`);
  }

  // --- Step 1: whoami before join → exit 1 + "Team mode not enabled" ---
  expectStep(
    'team whoami (before join)',
    {
      status: 1,
      stderrContains: ['Team mode not enabled'],
    },
    runMaestro(['team', 'whoami']),
  );

  // --- Step 2: team join → exit 0 + "Joined as" ---
  expectStep(
    'team join',
    {
      status: 0,
      stdoutContains: ['Joined as', 'smoke'],
    },
    runMaestro(['team', 'join']),
  );

  // --- Step 3: team whoami → exit 0 + uid "smoke" ---
  expectStep(
    'team whoami (after join)',
    {
      status: 0,
      stdoutContains: ['uid:', 'smoke'],
    },
    runMaestro(['team', 'whoami']),
  );

  // --- Step 4: team report (smoke-action) → exit 0, silent ---
  expectStep(
    'team report --action smoke-action',
    {
      status: 0,
      stdoutEmpty: true,
    },
    runMaestro(['team', 'report', '--action', 'smoke-action']),
  );

  // --- Step 5: team status → exit 0, contains "smoke-action" ---
  // Self is the only known member so status should report our own report
  // line with "smoke-action" in the action column.
  expectStep(
    'team status shows smoke-action',
    {
      status: 0,
      stdoutContains: ['smoke-action'],
    },
    runMaestro(['team', 'status']),
  );

  // --- Step 6: team preflight --phase 1 → exit 0 (only self active) ---
  expectStep(
    'team preflight --phase 1 (no conflicts)',
    {
      status: 0,
    },
    runMaestro(['team', 'preflight', '--phase', '1']),
  );

  // --- Step 7: team sync --dry-run → exit 0 ---
  // Sync with no remote is OK in dry-run mode: it prints the plan but does
  // not touch git. The implementation uses `[dry-run]` prefixes on each line.
  expectStep(
    'team sync --dry-run',
    {
      status: 0,
      stdoutContains: ['[dry-run]'],
    },
    runMaestro(['team', 'sync', '--dry-run']),
  );

  // --- Step 8: PostToolUse hook JSON → activity.jsonl has 2 entries ---
  // Pipe a hook payload into maestro-team-monitor.js and confirm the log
  // gains a row. After the report in step 4, this becomes the second row.
  const hookPayload = JSON.stringify({
    session_id: 'smoke-session',
    cwd: tempDir,
    tool_name: 'SmokeHookTool',
    tool_input: {},
  });

  const monitorBin = join(REPO_ROOT, 'bin', 'maestro-team-monitor.js');
  if (!existsSync(monitorBin)) {
    fail(`monitor bin not found at ${monitorBin}`);
  }
  const monitorResult = spawnSync(NODE, [monitorBin], {
    cwd: tempDir,
    env: { ...process.env, MAESTRO_PROJECT_ROOT: tempDir, NO_COLOR: '1' },
    encoding: 'utf-8',
    input: hookPayload,
  });
  expectStep(
    'PostToolUse hook writes heartbeat',
    { status: 0 },
    {
      status: monitorResult.status,
      stdout: monitorResult.stdout ?? '',
      stderr: monitorResult.stderr ?? '',
    },
  );

  // Verify the activity log has 2 entries (smoke-action + SmokeHookTool).
  const activityPath = join(tempDir, '.workflow', 'collab', 'activity.jsonl');
  if (!existsSync(activityPath)) {
    fail('activity.jsonl missing after hook dispatch');
  }
  const lines = readFileSync(activityPath, 'utf-8')
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  stepIndex += 1;
  if (lines.length !== 2) {
    fail(`#${stepIndex} activity.jsonl row count`, {
      expected: 2,
      got: lines.length,
      content: lines,
    });
  }
  // Sanity parse each entry + check actions in order.
  let parsed;
  try {
    parsed = lines.map((l) => JSON.parse(l));
  } catch (err) {
    fail(`#${stepIndex} activity.jsonl parse: ${err.message}`, { lines });
  }
  const actions = parsed.map((p) => p.action);
  if (!actions.includes('smoke-action') || !actions.includes('SmokeHookTool')) {
    fail(`#${stepIndex} activity.jsonl actions`, {
      expected: ['smoke-action', 'SmokeHookTool'],
      got: actions,
    });
  }
  log(`ok #${stepIndex} activity.jsonl has 2 entries: ${actions.join(', ')}`);

  // --- Done ---
  cleanup();
  log(`PASS — ${stepIndex} steps ok`);
  process.exit(0);
}

// Safety net: always clean up on fatal error.
try {
  main();
} catch (err) {
  fail(`uncaught error: ${err && err.stack ? err.stack : err}`);
}
