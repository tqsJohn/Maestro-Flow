/**
 * Session Context Hook — Notification (SessionStart)
 *
 * Injects lightweight workflow state + available specs overview
 * at session initialization. Does NOT inject full spec content —
 * that's handled per-agent by spec-injector.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionContextInput {
  cwd?: string;
  session_id?: string;
}

interface HookOutput {
  hookSpecificOutput: {
    hookEventName: string;
    additionalContext: string;
  };
}

interface WorkflowState {
  phase?: number;
  step?: number;
  task?: string;
  status?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate session context and return an overview for the agent.
 * Returns null if there's nothing useful to inject.
 */
export function evaluateSessionContext(data: SessionContextInput): HookOutput | null {
  const cwd = data.cwd || process.cwd();
  const sections: string[] = [];

  // 1. Workflow state
  const workflowSection = buildWorkflowSection(cwd);
  if (workflowSection) sections.push(workflowSection);

  // 2. Available specs
  const specsSection = buildSpecsSection(cwd);
  if (specsSection) sections.push(specsSection);

  // 3. Git context (lightweight)
  const gitSection = buildGitSection(cwd);
  if (gitSection) sections.push(gitSection);

  if (sections.length === 0) return null;

  return {
    hookSpecificOutput: {
      hookEventName: 'Notification',
      additionalContext: sections.join('\n\n'),
    },
  };
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function buildWorkflowSection(cwd: string): string | null {
  const statePath = join(cwd, '.workflow', 'state.json');
  if (!existsSync(statePath)) return null;

  try {
    const state: WorkflowState = JSON.parse(readFileSync(statePath, 'utf8'));
    const parts: string[] = ['## Maestro Workflow State'];

    if (state.phase !== undefined) {
      const step = state.step !== undefined ? `.${state.step}` : '';
      parts.push(`Phase: ${state.phase}${step}`);
    }
    if (state.task) parts.push(`Task: ${state.task}`);
    if (state.status) parts.push(`Status: ${state.status}`);

    return parts.length > 1 ? parts.join(' | ') : null;
  } catch {
    return null;
  }
}

function buildSpecsSection(cwd: string): string | null {
  const specsDir = join(cwd, '.workflow', 'specs');
  if (!existsSync(specsDir)) return null;

  try {
    const files = readdirSync(specsDir).filter(f => f.endsWith('.md'));
    if (files.length === 0) return null;

    const items = files.map(f => `- ${f.replace('.md', '')}`);
    return `## Available Specs\n${items.join('\n')}\n(Auto-injected per agent type via spec-injector hook)`;
  } catch {
    return null;
  }
}

function buildGitSection(cwd: string): string | null {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    let lastCommit = '';
    try {
      lastCommit = execSync('git log -1 --oneline', {
        cwd,
        encoding: 'utf8',
        timeout: 3000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch {
      // No commits yet
    }

    const parts = [`## Git`, `Branch: ${branch}`];
    if (lastCommit) parts.push(`Last: ${lastCommit}`);
    return parts.join(' | ');
  } catch {
    return null;
  }
}
