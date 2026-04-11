import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadOverlay,
  loadAllOverlays,
  validateOverlayMeta,
  OverlayLoadError,
} from './loader.js';

const MIN_VALID = {
  name: 'test-overlay',
  targets: ['some-cmd'],
  patches: [{ section: 'execution', mode: 'append', content: 'HELLO' }],
};

describe('loader', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'overlay-loader-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe('validateOverlayMeta', () => {
    it('accepts a minimal valid overlay', () => {
      expect(validateOverlayMeta(MIN_VALID)).toEqual([]);
    });

    it('rejects missing name', () => {
      const errs = validateOverlayMeta({ ...MIN_VALID, name: undefined });
      expect(errs.join(' ')).toContain('`name`');
    });

    it('rejects name with invalid chars', () => {
      const errs = validateOverlayMeta({ ...MIN_VALID, name: 'Has Space' });
      expect(errs.join(' ')).toContain('`name`');
    });

    it('rejects empty targets', () => {
      const errs = validateOverlayMeta({ ...MIN_VALID, targets: [] });
      expect(errs.join(' ')).toContain('`targets`');
    });

    it('rejects unknown section', () => {
      const errs = validateOverlayMeta({
        ...MIN_VALID,
        patches: [{ section: 'bogus', mode: 'append', content: 'x' }],
      });
      expect(errs.join(' ')).toContain('bogus');
    });

    it('rejects unknown mode', () => {
      const errs = validateOverlayMeta({
        ...MIN_VALID,
        patches: [{ section: 'execution', mode: 'splurge', content: 'x' }],
      });
      expect(errs.join(' ')).toContain('mode');
    });

    it('accepts new-section mode with non-standard section name', () => {
      const errs = validateOverlayMeta({
        ...MIN_VALID,
        patches: [
          {
            section: 'custom',
            mode: 'new-section',
            content: 'x',
            afterSection: 'execution',
          },
        ],
      });
      expect(errs).toEqual([]);
    });
  });

  describe('loadOverlay', () => {
    it('loads a valid file and computes a hash', () => {
      const fp = join(dir, 'test-overlay.json');
      writeFileSync(fp, JSON.stringify(MIN_VALID), 'utf-8');
      const ov = loadOverlay(fp);
      expect(ov.meta.name).toBe('test-overlay');
      expect(ov.sourcePath).toBe(fp);
      expect(ov.hash).toMatch(/^[a-f0-9]{8}$/);
    });

    it('hash is stable for identical content', () => {
      const a = join(dir, 'a.json');
      const b = join(dir, 'b.json');
      writeFileSync(a, JSON.stringify(MIN_VALID), 'utf-8');
      writeFileSync(b, JSON.stringify(MIN_VALID), 'utf-8');
      expect(loadOverlay(a).hash).toBe(loadOverlay(b).hash);
    });

    it('throws OverlayLoadError on invalid JSON', () => {
      const fp = join(dir, 'bad.json');
      writeFileSync(fp, '{not json', 'utf-8');
      expect(() => loadOverlay(fp)).toThrow(OverlayLoadError);
    });

    it('throws OverlayLoadError on schema violation', () => {
      const fp = join(dir, 'bad.json');
      writeFileSync(fp, JSON.stringify({ name: 'x' }), 'utf-8');
      expect(() => loadOverlay(fp)).toThrow(OverlayLoadError);
    });
  });

  describe('loadAllOverlays', () => {
    it('loads multiple files sorted by priority then name', () => {
      writeFileSync(
        join(dir, 'z.json'),
        JSON.stringify({ ...MIN_VALID, name: 'z-first', priority: 10 }),
      );
      writeFileSync(
        join(dir, 'a.json'),
        JSON.stringify({ ...MIN_VALID, name: 'a-mid', priority: 50 }),
      );
      writeFileSync(
        join(dir, 'b.json'),
        JSON.stringify({ ...MIN_VALID, name: 'b-mid', priority: 50 }),
      );
      const { overlays, errors } = loadAllOverlays(dir);
      expect(errors).toEqual([]);
      expect(overlays.map((o) => o.meta.name)).toEqual(['z-first', 'a-mid', 'b-mid']);
    });

    it('skips files starting with underscore', () => {
      writeFileSync(join(dir, '_shipped.json'), JSON.stringify(MIN_VALID));
      const { overlays } = loadAllOverlays(dir);
      expect(overlays).toHaveLength(0);
    });

    it('reports broken files as errors without throwing', () => {
      writeFileSync(join(dir, 'good.json'), JSON.stringify(MIN_VALID));
      writeFileSync(
        join(dir, 'bad.json'),
        JSON.stringify({ name: 'bad' }), // missing targets + patches
      );
      const { overlays, errors } = loadAllOverlays(dir);
      expect(overlays.map((o) => o.meta.name)).toEqual(['test-overlay']);
      expect(errors).toHaveLength(1);
      expect(errors[0].path).toContain('bad.json');
    });

    it('detects duplicate overlay names', () => {
      writeFileSync(join(dir, 'a.json'), JSON.stringify(MIN_VALID));
      writeFileSync(join(dir, 'b.json'), JSON.stringify(MIN_VALID));
      const { overlays, errors } = loadAllOverlays(dir);
      expect(overlays).toHaveLength(1);
      expect(errors).toHaveLength(1);
      expect(errors[0].errors.join(' ')).toContain('duplicate');
    });

    it('returns empty result for missing directory', () => {
      const missing = join(dir, 'does-not-exist');
      const { overlays, errors } = loadAllOverlays(missing);
      expect(overlays).toEqual([]);
      expect(errors).toEqual([]);
    });
  });
});
