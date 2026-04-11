import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  appendLine,
  readAll,
  tailLast,
  rotateIfLarge,
  isoWeek,
} from '../jsonl-log.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

function setup(): void {
  tmpDir = mkdtempSync(join(tmpdir(), 'jsonl-log-test-'));
}

function teardown(): void {
  if (tmpDir && existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('jsonl-log', () => {

  describe('appendLine', () => {
    beforeEach(setup);
    afterEach(teardown);

    it('creates parent directories and writes a parseable line', () => {
      const logPath = join(tmpDir, 'nested', 'deep', 'log.jsonl');
      appendLine(logPath, { ts: '2026-04-11T10:00:00Z', user: 'alice' });

      assert.strictEqual(existsSync(logPath), true);
      const content = readFileSync(logPath, 'utf-8');
      assert.strictEqual(content.endsWith('\n'), true);

      const parsed = JSON.parse(content.trim());
      assert.strictEqual(parsed.user, 'alice');
      assert.strictEqual(parsed.ts, '2026-04-11T10:00:00Z');
    });

    it('appends successive entries as separate lines', () => {
      const logPath = join(tmpDir, 'log.jsonl');
      appendLine(logPath, { n: 1 });
      appendLine(logPath, { n: 2 });
      appendLine(logPath, { n: 3 });

      const content = readFileSync(logPath, 'utf-8');
      const lines = content.trim().split('\n');
      assert.strictEqual(lines.length, 3);
      assert.strictEqual(JSON.parse(lines[0]).n, 1);
      assert.strictEqual(JSON.parse(lines[2]).n, 3);
    });

    it('does not throw on unserializable values', () => {
      const logPath = join(tmpDir, 'log.jsonl');
      const circular: Record<string, unknown> = { a: 1 };
      circular.self = circular;
      // Should silently no-op, not throw.
      assert.doesNotThrow(() => appendLine(logPath, circular));
      // BigInt is also unserializable by default.
      assert.doesNotThrow(() => appendLine(logPath, { n: BigInt(1) }));
    });
  });

  describe('readAll', () => {
    beforeEach(setup);
    afterEach(teardown);

    it('returns empty array when file missing', () => {
      const logPath = join(tmpDir, 'missing.jsonl');
      assert.deepStrictEqual(readAll(logPath), []);
    });

    it('skips malformed lines but returns valid ones', () => {
      const logPath = join(tmpDir, 'log.jsonl');
      const content =
        '{"a":1}\n' +
        'not-json\n' +
        '{"b":2}\n' +
        '{broken\n' +
        '{"c":3}\n';
      writeFileSync(logPath, content, 'utf-8');

      const rows = readAll<{ a?: number; b?: number; c?: number }>(logPath);
      assert.strictEqual(rows.length, 3);
      assert.deepStrictEqual(rows[0], { a: 1 });
      assert.deepStrictEqual(rows[1], { b: 2 });
      assert.deepStrictEqual(rows[2], { c: 3 });
    });

    it('ignores blank lines', () => {
      const logPath = join(tmpDir, 'log.jsonl');
      writeFileSync(logPath, '\n{"x":1}\n\n{"y":2}\n\n', 'utf-8');
      const rows = readAll(logPath);
      assert.strictEqual(rows.length, 2);
    });
  });

  describe('tailLast', () => {
    beforeEach(setup);
    afterEach(teardown);

    it('returns last n entries for a small file (under 64KB)', () => {
      const logPath = join(tmpDir, 'log.jsonl');
      for (let i = 1; i <= 10; i++) {
        appendLine(logPath, { i });
      }
      const rows = tailLast<{ i: number }>(logPath, 3);
      assert.strictEqual(rows.length, 3);
      assert.deepStrictEqual(rows.map((r) => r.i), [8, 9, 10]);
    });

    it('returns [] when file missing', () => {
      const logPath = join(tmpDir, 'missing.jsonl');
      assert.deepStrictEqual(tailLast(logPath, 5), []);
    });

    it('returns [] when n <= 0', () => {
      const logPath = join(tmpDir, 'log.jsonl');
      appendLine(logPath, { a: 1 });
      assert.deepStrictEqual(tailLast(logPath, 0), []);
      assert.deepStrictEqual(tailLast(logPath, -1), []);
    });

    it('handles file larger than 64KB and returns correct last n', () => {
      const logPath = join(tmpDir, 'big.jsonl');
      // Pad each record so 1000 records exceed 64KB (~220KB total).
      const pad = 'x'.repeat(200);
      for (let i = 1; i <= 1000; i++) {
        appendLine(logPath, { i, pad });
      }
      const size = statSync(logPath).size;
      assert.ok(size > 64 * 1024, `expected size > 64KB, got ${size}`);

      const rows = tailLast<{ i: number; pad: string }>(logPath, 5);
      assert.strictEqual(rows.length, 5);
      assert.deepStrictEqual(rows.map((r) => r.i), [996, 997, 998, 999, 1000]);
    });

    it('does not emit partial leading record when reading tail window', () => {
      const logPath = join(tmpDir, 'big.jsonl');
      const pad = 'y'.repeat(300);
      for (let i = 1; i <= 500; i++) {
        appendLine(logPath, { i, pad });
      }
      assert.ok(statSync(logPath).size > 64 * 1024);

      // Ask for more records than fit in 64KB — still only complete records.
      const rows = tailLast<{ i: number }>(logPath, 50);
      assert.ok(rows.length > 0);
      // Last record must be i=500.
      assert.strictEqual(rows[rows.length - 1].i, 500);
      // Every record must be well-formed.
      for (const r of rows) {
        assert.strictEqual(typeof r.i, 'number');
      }
      // Contiguous sequence ending at 500.
      for (let k = 1; k < rows.length; k++) {
        assert.strictEqual(rows[k].i, rows[k - 1].i + 1);
      }
    });
  });

  describe('rotateIfLarge', () => {
    beforeEach(setup);
    afterEach(teardown);

    it('returns null for non-existent file', () => {
      const logPath = join(tmpDir, 'missing.jsonl');
      const archive = join(tmpDir, 'archives');
      assert.strictEqual(rotateIfLarge(logPath, 1024, archive), null);
    });

    it('returns null for small files below threshold', () => {
      const logPath = join(tmpDir, 'small.jsonl');
      writeFileSync(logPath, '{"a":1}\n', 'utf-8');
      const archive = join(tmpDir, 'archives');
      assert.strictEqual(rotateIfLarge(logPath, 1024 * 1024, archive), null);
      // Original file must still exist.
      assert.strictEqual(existsSync(logPath), true);
    });

    it('moves large files to archive with ISO week name', () => {
      const logPath = join(tmpDir, 'activity.jsonl');
      // 2KB payload, threshold 1KB.
      writeFileSync(logPath, 'x'.repeat(2048), 'utf-8');
      const archive = join(tmpDir, 'archives');

      const archivePath = rotateIfLarge(logPath, 1024, archive);
      assert.notStrictEqual(archivePath, null);
      assert.strictEqual(existsSync(logPath), false); // original moved
      assert.strictEqual(existsSync(archivePath!), true);
      assert.strictEqual(existsSync(archive), true);

      // Archive name pattern: activity-YYYYWWW.jsonl
      const name = archivePath!.split(/[\\/]/).pop()!;
      assert.match(name, /^activity-\d{4}W\d{2}\.jsonl$/);
    });

    it('creates archive directory recursively when missing', () => {
      const logPath = join(tmpDir, 'activity.jsonl');
      writeFileSync(logPath, 'x'.repeat(2048), 'utf-8');
      const archive = join(tmpDir, 'deep', 'nested', 'archives');

      const archivePath = rotateIfLarge(logPath, 1024, archive);
      assert.notStrictEqual(archivePath, null);
      assert.strictEqual(existsSync(archive), true);
      assert.strictEqual(existsSync(archivePath!), true);
    });
  });

  describe('isoWeek', () => {
    it('computes ISO week for well-known dates', () => {
      // 2026-01-01 is a Thursday, so it belongs to ISO week 1 of 2026.
      assert.deepStrictEqual(
        isoWeek(new Date('2026-01-01T12:00:00Z')),
        { year: 2026, week: 1 },
      );
      // 2025-12-29 (Mon) belongs to ISO week 1 of 2026.
      assert.deepStrictEqual(
        isoWeek(new Date('2025-12-29T12:00:00Z')),
        { year: 2026, week: 1 },
      );
      // 2024-12-30 (Mon) belongs to ISO week 1 of 2025.
      assert.deepStrictEqual(
        isoWeek(new Date('2024-12-30T12:00:00Z')),
        { year: 2025, week: 1 },
      );
      // 2023-01-01 (Sun) belongs to ISO week 52 of 2022.
      assert.deepStrictEqual(
        isoWeek(new Date('2023-01-01T12:00:00Z')),
        { year: 2022, week: 52 },
      );
    });
  });
});
