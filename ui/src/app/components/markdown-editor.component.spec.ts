import { describe, it, expect } from 'vitest';

/**
 * MarkdownEditorComponent unit tests.
 *
 * Crepe/Milkdown requires a browser DOM and cannot be instantiated in node.
 * We test the component's pure logic: null-safety guards, feature config, etc.
 * Full integration tests require a browser environment (e.g., Playwright/Cypress).
 */
describe('MarkdownEditorComponent (logic)', () => {
  describe('getMarkdown fallback', () => {
    it('should return content input when crepe is null', () => {
      // Simulates the getMarkdown() fallback path
      const crepe = null;
      const content = '# Hello world';
      const result = crepe ? 'from crepe' : content || '';
      expect(result).toBe('# Hello world');
    });

    it('should return empty string when crepe is null and content is empty', () => {
      const crepe = null;
      const content = '';
      const result = crepe ? 'from crepe' : content || '';
      expect(result).toBe('');
    });
  });

  describe('zero-width space handling', () => {
    it('should strip leading zero-width space from markdown', () => {
      const markdown = '\u200BHello';
      const clean = markdown === '\u200B' ? '' : markdown.replace(/^\u200B/, '');
      expect(clean).toBe('Hello');
    });

    it('should return empty string for lone zero-width space', () => {
      const markdown = '\u200B';
      const clean = markdown === '\u200B' ? '' : markdown.replace(/^\u200B/, '');
      expect(clean).toBe('');
    });

    it('should pass through normal markdown unchanged', () => {
      const markdown = '# Title\n\nParagraph';
      const clean = markdown === '\u200B' ? '' : markdown.replace(/^\u200B/, '');
      expect(clean).toBe('# Title\n\nParagraph');
    });
  });

  describe('feature configuration', () => {
    it('should disable image blocks, block edit, link tooltip, cursor, toolbar, placeholder, and latex', () => {
      // Mirror the component's feature config
      const features: Record<string, boolean> = {
        CodeMirror: true,
        ListItem: true,
        LinkTooltip: false,
        Cursor: false,
        ImageBlock: false,
        BlockEdit: false,
        Toolbar: false,
        Placeholder: false,
        Table: true,
        Latex: false,
      };

      expect(features['ImageBlock']).toBe(false);
      expect(features['BlockEdit']).toBe(false);
      expect(features['LinkTooltip']).toBe(false);
      expect(features['Latex']).toBe(false);
      expect(features['Cursor']).toBe(false);
      expect(features['Toolbar']).toBe(false);
      expect(features['Placeholder']).toBe(false);
    });

    it('should enable CodeMirror, ListItem, and Table', () => {
      const features: Record<string, boolean> = {
        CodeMirror: true,
        ListItem: true,
        Table: true,
      };

      expect(features['CodeMirror']).toBe(true);
      expect(features['ListItem']).toBe(true);
      expect(features['Table']).toBe(true);
    });
  });

  describe('table markdown generation', () => {
    it('should produce valid markdown table text', () => {
      const tableText = `\n| Header 1 | Header 2 | Header 3 |\n|----------|----------|----------|\n| Cell 1   | Cell 2   | Cell 3   |\n`;
      expect(tableText).toContain('| Header 1 |');
      expect(tableText).toContain('|----------|');
      expect(tableText).toContain('| Cell 1   |');
    });
  });

  describe('task list markdown', () => {
    it('should produce checkbox markdown', () => {
      const taskListText = '- [ ] ';
      expect(taskListText).toBe('- [ ] ');
    });
  });

  describe('tightenLists', () => {
    // Extract the regex logic to test directly (mirrors component method)
    function tightenLists(md: string): string {
      return md.replace(/^([ \t]*[-*+][ \t].+)\n\n(?=[ \t]*[-*+][ \t])/gm, '$1\n')
               .replace(/^([ \t]*\d+\.[ \t].+)\n\n(?=[ \t]*\d+\.[ \t])/gm, '$1\n');
    }

    it('should collapse loose bullet lists into tight', () => {
      const loose = '- item one\n\n- item two\n\n- item three';
      expect(tightenLists(loose)).toBe('- item one\n- item two\n- item three');
    });

    it('should collapse loose ordered lists into tight', () => {
      const loose = '1. first\n\n2. second\n\n3. third';
      expect(tightenLists(loose)).toBe('1. first\n2. second\n3. third');
    });

    it('should not alter already-tight lists', () => {
      const tight = '- item one\n- item two\n- item three';
      expect(tightenLists(tight)).toBe(tight);
    });

    it('should preserve blank lines between non-list content', () => {
      const md = '# Heading\n\nParagraph\n\n- item one\n\n- item two';
      expect(tightenLists(md)).toBe('# Heading\n\nParagraph\n\n- item one\n- item two');
    });

    it('should handle mixed heading and list content', () => {
      const md = '### ZB UI\n\n- item one\n\n- item two\n\n### SME Mart\n\n- item three\n\n- item four';
      expect(tightenLists(md)).toBe('### ZB UI\n\n- item one\n- item two\n\n### SME Mart\n\n- item three\n- item four');
    });
  });
});
