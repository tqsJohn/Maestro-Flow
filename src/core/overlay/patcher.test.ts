import { describe, it, expect } from 'vitest';
import { applyOverlay, removeOverlay, hasMarkers } from './patcher.js';
import type { OverlayFile } from './types.js';

function makeOverlay(
  name: string,
  patches: OverlayFile['meta']['patches'],
  priority?: number,
): OverlayFile {
  return {
    meta: {
      name,
      targets: ['test-cmd'],
      priority,
      patches,
    },
    sourcePath: `/fake/${name}.json`,
    raw: JSON.stringify({ name, patches }),
    hash: 'fakehash',
  };
}

const BASE_CMD = [
  '---',
  'name: test-cmd',
  '---',
  '<purpose>',
  'base purpose',
  '</purpose>',
  '',
  '<execution>',
  'base execution step',
  '</execution>',
  '',
].join('\n');

describe('patcher', () => {
  describe('applyOverlay', () => {
    it('appends a patch before the closing tag', () => {
      const overlay = makeOverlay('test', [
        { section: 'execution', mode: 'append', content: 'INJECTED STEP' },
      ]);
      const result = applyOverlay(BASE_CMD, overlay, 'test-cmd', '/fake');
      expect(result.text).toContain('<!-- maestro-overlay:test#0');
      expect(result.text).toContain('INJECTED STEP');
      expect(result.text).toContain('<!-- /maestro-overlay:test#0 -->');
      // Base content is preserved
      expect(result.text).toContain('base execution step');
      // Marker block is before </execution>
      const execClose = result.text.indexOf('</execution>');
      const markerStart = result.text.indexOf('<!-- maestro-overlay:test#0');
      expect(markerStart).toBeLessThan(execClose);
      expect(result.applied.sectionsPatched).toEqual(['execution']);
      expect(result.unchanged).toBe(false);
    });

    it('prepends a patch after the opening tag', () => {
      const overlay = makeOverlay('test', [
        { section: 'execution', mode: 'prepend', content: 'GATE' },
      ]);
      const result = applyOverlay(BASE_CMD, overlay, 'test-cmd', '/fake');
      const execOpen = result.text.indexOf('<execution>');
      const markerStart = result.text.indexOf('<!-- maestro-overlay:test#0');
      expect(markerStart).toBeGreaterThan(execOpen);
      const baseStep = result.text.indexOf('base execution step');
      expect(markerStart).toBeLessThan(baseStep);
    });

    it('round-trip: apply → remove = original', () => {
      const overlay = makeOverlay('test', [
        { section: 'execution', mode: 'append', content: 'INJECTED' },
      ]);
      const applied = applyOverlay(BASE_CMD, overlay, 'test-cmd', '/fake');
      const removed = removeOverlay(applied.text, 'test');
      // Normalize trailing newline for comparison
      const norm = (s: string) => s.replace(/\r?\n+$/, '') + '\n';
      expect(norm(removed.text)).toBe(norm(BASE_CMD));
    });

    it('re-apply with same content is byte-identical', () => {
      const overlay = makeOverlay('test', [
        { section: 'execution', mode: 'append', content: 'INJECTED' },
      ]);
      const first = applyOverlay(BASE_CMD, overlay, 'test-cmd', '/fake');
      const second = applyOverlay(first.text, overlay, 'test-cmd', '/fake');
      expect(second.text).toBe(first.text);
    });

    it('re-apply with different content replaces marker block', () => {
      const v1 = makeOverlay('test', [
        { section: 'execution', mode: 'append', content: 'OLD' },
      ]);
      const v2 = makeOverlay('test', [
        { section: 'execution', mode: 'append', content: 'NEW' },
      ]);
      const first = applyOverlay(BASE_CMD, v1, 'test-cmd', '/fake');
      const second = applyOverlay(first.text, v2, 'test-cmd', '/fake');
      expect(second.text).toContain('NEW');
      expect(second.text).not.toContain('OLD');
      // Only one marker block per (name, idx)
      const count = (second.text.match(/<!-- maestro-overlay:test#0/g) ?? []).length;
      expect(count).toBe(1);
    });

    it('preserves user edits outside markers inside the section', () => {
      const v1 = makeOverlay('test', [
        { section: 'execution', mode: 'append', content: 'INJECTED' },
      ]);
      const applied = applyOverlay(BASE_CMD, v1, 'test-cmd', '/fake');
      // User adds a line outside markers but inside the section
      const userEdit = applied.text.replace(
        'base execution step',
        'base execution step\nUSER ADDED LINE',
      );
      // Re-apply
      const second = applyOverlay(userEdit, v1, 'test-cmd', '/fake');
      expect(second.text).toContain('USER ADDED LINE');
      expect(second.text).toContain('INJECTED');
    });

    it('skips patches targeting a missing section', () => {
      const overlay = makeOverlay('test', [
        { section: 'nonexistent', mode: 'append', content: 'X' },
      ]);
      const result = applyOverlay(BASE_CMD, overlay, 'test-cmd', '/fake');
      expect(result.text).toBe(BASE_CMD.replace(/\r?\n+$/, '') + '\n');
      expect(result.applied.sectionsPatched).toHaveLength(0);
    });

    it('new-section mode adds a brand-new section', () => {
      const overlay = makeOverlay('test', [
        {
          section: 'verification',
          mode: 'new-section',
          content: 'run ccw cli',
          afterSection: 'execution',
        },
      ]);
      const result = applyOverlay(BASE_CMD, overlay, 'test-cmd', '/fake');
      expect(result.text).toContain('<verification>');
      expect(result.text).toContain('</verification>');
      expect(result.text).toContain('run ccw cli');
      // Inserted after </execution>
      const execClose = result.text.indexOf('</execution>');
      const newOpen = result.text.indexOf('<verification>');
      expect(newOpen).toBeGreaterThan(execClose);
    });

    it('multiple patches from one overlay get distinct markers', () => {
      const overlay = makeOverlay('multi', [
        { section: 'execution', mode: 'append', content: 'A' },
        { section: 'purpose', mode: 'append', content: 'B' },
      ]);
      const result = applyOverlay(BASE_CMD, overlay, 'test-cmd', '/fake');
      expect(result.text).toContain('<!-- maestro-overlay:multi#0');
      expect(result.text).toContain('<!-- maestro-overlay:multi#1');
      expect(result.applied.markerIds).toEqual(['multi#0', 'multi#1']);
    });

    it('replace mode overwrites section body', () => {
      const overlay = makeOverlay('test', [
        { section: 'execution', mode: 'replace', content: 'REPLACED' },
      ]);
      const result = applyOverlay(BASE_CMD, overlay, 'test-cmd', '/fake');
      expect(result.text).toContain('REPLACED');
      expect(result.text).not.toContain('base execution step');
    });
  });

  describe('removeOverlay', () => {
    it('strips all markers for named overlay', () => {
      const overlay = makeOverlay('multi', [
        { section: 'execution', mode: 'append', content: 'A' },
        { section: 'purpose', mode: 'append', content: 'B' },
      ]);
      const applied = applyOverlay(BASE_CMD, overlay, 'test-cmd', '/fake');
      expect(hasMarkers(applied.text, 'multi')).toBe(true);
      const { text, removed } = removeOverlay(applied.text, 'multi');
      expect(hasMarkers(text, 'multi')).toBe(false);
      expect(removed.sort()).toEqual([0, 1]);
    });

    it('leaves other overlays untouched', () => {
      const a = makeOverlay('keep', [
        { section: 'execution', mode: 'append', content: 'KEEP' },
      ]);
      const b = makeOverlay('drop', [
        { section: 'purpose', mode: 'append', content: 'DROP' },
      ]);
      let text = applyOverlay(BASE_CMD, a, 'test-cmd', '/fake').text;
      text = applyOverlay(text, b, 'test-cmd', '/fake').text;
      const { text: cleaned } = removeOverlay(text, 'drop');
      expect(hasMarkers(cleaned, 'keep')).toBe(true);
      expect(hasMarkers(cleaned, 'drop')).toBe(false);
      expect(cleaned).toContain('KEEP');
      expect(cleaned).not.toContain('DROP');
    });

    it('is a no-op when the overlay is not present', () => {
      const { text, removed } = removeOverlay(BASE_CMD, 'missing');
      expect(text).toBe(BASE_CMD);
      expect(removed).toHaveLength(0);
    });
  });

  describe('CRLF handling', () => {
    it('preserves CRLF line endings on apply', () => {
      const crlf = BASE_CMD.replace(/\n/g, '\r\n');
      const overlay = makeOverlay('test', [
        { section: 'execution', mode: 'append', content: 'INJECTED' },
      ]);
      const result = applyOverlay(crlf, overlay, 'test-cmd', '/fake');
      expect(result.text).toContain('\r\n');
      expect(result.text).not.toMatch(/[^\r]\n/);
    });
  });
});
