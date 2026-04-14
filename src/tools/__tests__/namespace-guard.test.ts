import { describe, it } from 'node:test';
import assert from 'node:assert';
import { join } from 'node:path';
import {
  evaluateNamespaceGuard,
  getNamespaceBoundaries,
} from '../namespace-guard.js';

const ROOT = '/projects/my-repo';

// ---------------------------------------------------------------------------
// evaluateNamespaceGuard — pure function tests
// ---------------------------------------------------------------------------

describe('evaluateNamespaceGuard', () => {
  // -- Own namespace (allowed) --

  it('allows write to own member file', () => {
    const result = evaluateNamespaceGuard(
      join(ROOT, '.workflow/collab/members/alice.json'),
      'alice',
      ROOT,
    );
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.reason, undefined);
  });

  it('allows write to own spec directory', () => {
    const result = evaluateNamespaceGuard(
      join(ROOT, '.workflow/collab/specs/alice/api-design.md'),
      'alice',
      ROOT,
    );
    assert.strictEqual(result.allowed, true);
  });

  it('allows write to own overlay bundle', () => {
    const result = evaluateNamespaceGuard(
      join(ROOT, '.workflow/collab/overlays/alice-bundle.json'),
      'alice',
      ROOT,
    );
    assert.strictEqual(result.allowed, true);
  });

  // -- Shared paths (allowed) --

  it('allows write to shared activity.jsonl', () => {
    const result = evaluateNamespaceGuard(
      join(ROOT, '.workflow/collab/activity.jsonl'),
      'alice',
      ROOT,
    );
    assert.strictEqual(result.allowed, true);
  });

  it('allows write to shared overlays/manifest.json', () => {
    const result = evaluateNamespaceGuard(
      join(ROOT, '.workflow/collab/overlays/manifest.json'),
      'alice',
      ROOT,
    );
    assert.strictEqual(result.allowed, true);
  });

  // -- Other members (blocked) --

  it('blocks write to another member file', () => {
    const result = evaluateNamespaceGuard(
      join(ROOT, '.workflow/collab/members/bob.json'),
      'alice',
      ROOT,
    );
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reason?.includes('[NamespaceGuard] Blocked'));
    assert.ok(result.reason?.includes('bob.json'));
    assert.ok(result.reason?.includes('alice'));
  });

  it('blocks write to another member spec directory', () => {
    const result = evaluateNamespaceGuard(
      join(ROOT, '.workflow/collab/specs/bob/design.md'),
      'alice',
      ROOT,
    );
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reason?.includes('[NamespaceGuard] Blocked'));
    assert.ok(result.reason?.includes('bob'));
  });

  it('blocks write to another member overlay bundle', () => {
    const result = evaluateNamespaceGuard(
      join(ROOT, '.workflow/collab/overlays/bob-bundle.json'),
      'alice',
      ROOT,
    );
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reason?.includes('[NamespaceGuard] Blocked'));
    assert.ok(result.reason?.includes('bob-bundle.json'));
  });

  // -- Outside collab (allowed — not our concern) --

  it('allows paths outside .workflow/collab/', () => {
    const result = evaluateNamespaceGuard(
      join(ROOT, 'src/index.ts'),
      'alice',
      ROOT,
    );
    assert.strictEqual(result.allowed, true);
  });

  it('allows paths under .workflow/ but not collab/', () => {
    const result = evaluateNamespaceGuard(
      join(ROOT, '.workflow/state.json'),
      'alice',
      ROOT,
    );
    assert.strictEqual(result.allowed, true);
  });

  it('allows paths outside project root', () => {
    const result = evaluateNamespaceGuard(
      '/tmp/some-file.txt',
      'alice',
      ROOT,
    );
    assert.strictEqual(result.allowed, true);
  });

  // -- Edge cases --

  it('allows non-bundle files under overlays/', () => {
    const result = evaluateNamespaceGuard(
      join(ROOT, '.workflow/collab/overlays/some-other-file.json'),
      'alice',
      ROOT,
    );
    assert.strictEqual(result.allowed, true);
  });

  it('handles relative paths', () => {
    // Test with a relative path from project root
    const result = evaluateNamespaceGuard(
      '.workflow/collab/members/bob.json',
      'alice',
      ROOT,
    );
    assert.strictEqual(result.allowed, false);
  });

  it('blocks spec dir even for nested files', () => {
    const result = evaluateNamespaceGuard(
      join(ROOT, '.workflow/collab/specs/bob/sub/deep/file.md'),
      'alice',
      ROOT,
    );
    assert.strictEqual(result.allowed, false);
  });

  it('allows own spec dir for nested files', () => {
    const result = evaluateNamespaceGuard(
      join(ROOT, '.workflow/collab/specs/alice/sub/deep/file.md'),
      'alice',
      ROOT,
    );
    assert.strictEqual(result.allowed, true);
  });

  it('returns descriptive reason on blocked member file', () => {
    const result = evaluateNamespaceGuard(
      join(ROOT, '.workflow/collab/members/charlie.json'),
      'alice',
      ROOT,
    );
    assert.strictEqual(result.allowed, false);
    assert.ok(typeof result.reason === 'string');
    assert.ok(result.reason.length > 0);
    assert.ok(result.reason.includes('charlie.json'));
    assert.ok(result.reason.includes('alice'));
  });
});

// ---------------------------------------------------------------------------
// getNamespaceBoundaries
// ---------------------------------------------------------------------------

describe('getNamespaceBoundaries', () => {
  it('returns expected boundaries for a user', () => {
    const boundaries = getNamespaceBoundaries('alice', ROOT);

    assert.ok(boundaries.length >= 5);
    assert.ok(boundaries.some((b) => b.includes('members/alice.json')));
    assert.ok(boundaries.some((b) => b.includes('specs/alice/')));
    assert.ok(boundaries.some((b) => b.includes('overlays/alice-bundle.json')));
    assert.ok(boundaries.some((b) => b.includes('activity.jsonl')));
    assert.ok(boundaries.some((b) => b.includes('overlays/manifest.json')));
  });

  it('does not include other users paths', () => {
    const boundaries = getNamespaceBoundaries('alice', ROOT);
    for (const b of boundaries) {
      assert.ok(!b.includes('bob'));
    }
  });
});
