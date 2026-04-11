import { describe, it, expect } from 'vitest';
import { parseSections, findSection, splitLines, detectEol } from './section-parser.js';

describe('section-parser', () => {
  describe('detectEol', () => {
    it('detects LF', () => {
      expect(detectEol('a\nb\nc')).toBe('\n');
    });
    it('detects CRLF', () => {
      expect(detectEol('a\r\nb\r\nc')).toBe('\r\n');
    });
    it('defaults to LF on single-line input', () => {
      expect(detectEol('no newline here')).toBe('\n');
    });
  });

  describe('splitLines', () => {
    it('normalizes CRLF to LF before split', () => {
      expect(splitLines('a\r\nb\r\nc')).toEqual(['a', 'b', 'c']);
    });
  });

  describe('parseSections', () => {
    it('parses a minimal frontmatter + single section', () => {
      const text = [
        '---',
        'name: test',
        '---',
        '<execution>',
        'do something',
        '</execution>',
      ].join('\n');
      const parsed = parseSections(text);
      expect(parsed.frontmatterStart).toBe(0);
      expect(parsed.frontmatterEnd).toBe(2);
      expect(parsed.sections).toHaveLength(1);
      expect(parsed.sections[0]).toMatchObject({
        name: 'execution',
        openLine: 3,
        closeLine: 5,
      });
    });

    it('parses multiple sections in order', () => {
      const text = [
        '---',
        '---',
        '<purpose>',
        'why',
        '</purpose>',
        '',
        '<execution>',
        'how',
        '</execution>',
      ].join('\n');
      const parsed = parseSections(text);
      expect(parsed.sections.map((s) => s.name)).toEqual(['purpose', 'execution']);
    });

    it('ignores tag-like lines inside fenced code blocks', () => {
      const text = [
        '<execution>',
        '```',
        '<fakeSection>',
        '</fakeSection>',
        '```',
        'real body',
        '</execution>',
      ].join('\n');
      const parsed = parseSections(text);
      expect(parsed.sections.map((s) => s.name)).toEqual(['execution']);
      expect(findSection(parsed, 'fakeSection')).toBeUndefined();
    });

    it('handles tilde fences', () => {
      const text = [
        '<execution>',
        '~~~',
        '<fakeSection>',
        '~~~',
        '</execution>',
      ].join('\n');
      const parsed = parseSections(text);
      expect(parsed.sections.map((s) => s.name)).toEqual(['execution']);
    });

    it('does not treat < in prose as a tag', () => {
      const text = [
        '<context>',
        'a < b and some other text',
        '</context>',
      ].join('\n');
      const parsed = parseSections(text);
      expect(parsed.sections).toHaveLength(1);
      expect(parsed.sections[0].name).toBe('context');
    });

    it('findSection returns undefined for missing section', () => {
      const parsed = parseSections('<a>\n</a>');
      expect(findSection(parsed, 'b')).toBeUndefined();
      expect(findSection(parsed, 'a')?.name).toBe('a');
    });
  });
});
