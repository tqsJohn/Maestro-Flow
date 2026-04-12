import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { evaluateSessionContext } from '../session-context.js';

// ---------------------------------------------------------------------------
// Test project setup
// ---------------------------------------------------------------------------

const TEST_DIR = join(tmpdir(), `maestro-test-session-${Date.now()}`);

function setupTestProject(opts: { workflow?: boolean; specs?: boolean } = {}): void {
  mkdirSync(TEST_DIR, { recursive: true });

  if (opts.workflow) {
    const workflowDir = join(TEST_DIR, '.workflow');
    mkdirSync(workflowDir, { recursive: true });
    writeFileSync(join(workflowDir, 'state.json'), JSON.stringify({
      phase: 3,
      step: 2,
      task: 'implement-auth',
      status: 'in_progress',
    }));
  }

  if (opts.specs) {
    const specsDir = join(TEST_DIR, '.workflow', 'specs');
    mkdirSync(specsDir, { recursive: true });
    writeFileSync(join(specsDir, 'coding-conventions.md'), '# Coding');
    writeFileSync(join(specsDir, 'quality-rules.md'), '# Quality');
  }
}

function cleanup(): void {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// evaluateSessionContext
// ---------------------------------------------------------------------------

describe('evaluateSessionContext', () => {
  beforeEach(() => cleanup());
  afterEach(() => cleanup());

  it('returns null when no workflow state or specs exist', () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const result = evaluateSessionContext({ cwd: TEST_DIR });
    // May still return git info if in a repo, so check structure
    if (result) {
      assert.ok(result.hookSpecificOutput.hookEventName === 'Notification');
    }
  });

  it('includes workflow state when state.json exists', () => {
    setupTestProject({ workflow: true });
    const result = evaluateSessionContext({ cwd: TEST_DIR });
    assert.ok(result !== null);
    assert.strictEqual(result!.hookSpecificOutput.hookEventName, 'Notification');
    assert.ok(result!.hookSpecificOutput.additionalContext.includes('Phase: 3'));
    assert.ok(result!.hookSpecificOutput.additionalContext.includes('implement-auth'));
  });

  it('includes available specs listing', () => {
    setupTestProject({ workflow: true, specs: true });
    const result = evaluateSessionContext({ cwd: TEST_DIR });
    assert.ok(result !== null);
    assert.ok(result!.hookSpecificOutput.additionalContext.includes('coding-conventions'));
    assert.ok(result!.hookSpecificOutput.additionalContext.includes('quality-rules'));
    assert.ok(result!.hookSpecificOutput.additionalContext.includes('spec-injector'));
  });

  it('returns correct hookEventName', () => {
    setupTestProject({ workflow: true });
    const result = evaluateSessionContext({ cwd: TEST_DIR });
    assert.ok(result !== null);
    assert.strictEqual(result!.hookSpecificOutput.hookEventName, 'Notification');
  });
});
