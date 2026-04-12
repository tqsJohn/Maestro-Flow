import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { NOTIFY_PREFIX } from './constants.js';

// We need to mock tmpdir for the module under test, so we'll test by writing
// files to the actual tmpdir location the module uses.

describe('delegate-monitor', () => {
  let sessionId: string;
  let notifyPath: string;

  beforeEach(() => {
    sessionId = `test-monitor-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    notifyPath = join(tmpdir(), `${NOTIFY_PREFIX}${sessionId}.jsonl`);
  });

  afterEach(() => {
    try { rmSync(notifyPath, { force: true }); } catch { /* ignore */ }
  });

  it('evaluateDelegateNotifications returns null when no session_id', async () => {
    const { evaluateDelegateNotifications } = await import('./delegate-monitor.js');
    const result = evaluateDelegateNotifications({});
    assert.equal(result, null);
  });

  it('evaluateDelegateNotifications returns null when notifications file does not exist', async () => {
    const { evaluateDelegateNotifications } = await import('./delegate-monitor.js');
    const result = evaluateDelegateNotifications({ session_id: sessionId });
    assert.equal(result, null);
  });

  it('evaluateDelegateNotifications returns null when all entries are read', async () => {
    const { evaluateDelegateNotifications } = await import('./delegate-monitor.js');
    const entry = {
      execId: 'exec-1',
      tool: 'gemini',
      mode: 'analysis',
      prompt: 'test prompt',
      exitCode: 0,
      completedAt: '2026-04-12T00:00:00.000Z',
      read: true,
    };
    writeFileSync(notifyPath, JSON.stringify(entry) + '\n', 'utf-8');

    const result = evaluateDelegateNotifications({ session_id: sessionId });
    assert.equal(result, null);
  });

  it('evaluateDelegateNotifications returns context for unread entries', async () => {
    const { evaluateDelegateNotifications } = await import('./delegate-monitor.js');
    const entry = {
      execId: 'exec-2',
      tool: 'codex',
      mode: 'write',
      prompt: 'implement feature X',
      exitCode: 0,
      completedAt: '2026-04-12T01:00:00.000Z',
    };
    writeFileSync(notifyPath, JSON.stringify(entry) + '\n', 'utf-8');

    const result = evaluateDelegateNotifications({ session_id: sessionId });
    assert.ok(result);
    assert.equal(result.hookSpecificOutput.hookEventName, 'PostToolUse');
    assert.ok(result.hookSpecificOutput.additionalContext.includes('exec-2'));
    assert.ok(result.hookSpecificOutput.additionalContext.includes('codex/write'));
    assert.ok(result.hookSpecificOutput.additionalContext.includes('done'));
  });

  it('markRead writes entries with read=true', async () => {
    const { evaluateDelegateNotifications } = await import('./delegate-monitor.js');
    const entry = {
      execId: 'exec-3',
      tool: 'qwen',
      mode: 'analysis',
      prompt: 'analyze patterns',
      exitCode: 1,
      completedAt: '2026-04-12T02:00:00.000Z',
    };
    writeFileSync(notifyPath, JSON.stringify(entry) + '\n', 'utf-8');

    // evaluateDelegateNotifications calls markRead internally
    evaluateDelegateNotifications({ session_id: sessionId });

    // Read file and verify all entries have read=true
    const content = readFileSync(notifyPath, 'utf-8').trim();
    const lines = content.split('\n').map(line => JSON.parse(line));
    assert.equal(lines.length, 1);
    assert.equal(lines[0].read, true);
    assert.equal(lines[0].execId, 'exec-3');
  });
});
