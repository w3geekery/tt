// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

/**
 * MarkdownViewComponent unit tests.
 *
 * The component is a thin wrapper around `marked.parse()` + DOMPurify + DomSanitizer.
 * Since we're in a node environment without Angular TestBed, we test
 * the core markdown→HTML rendering + sanitization logic directly.
 */
describe('MarkdownViewComponent (rendering logic)', () => {
  /** Mirrors the component's render pipeline: marked → DOMPurify */
  function render(md: string): string {
    const html = marked.parse(md, { async: false }) as string;
    return DOMPurify.sanitize(html, {
      ADD_TAGS: ['input'],
      ADD_ATTR: ['type', 'checked', 'disabled'],
    });
  }

  it('should render bold text', () => {
    expect(render('**bold**')).toContain('<strong>bold</strong>');
  });

  it('should render italic text', () => {
    expect(render('*italic*')).toContain('<em>italic</em>');
  });

  it('should render strikethrough', () => {
    expect(render('~~deleted~~')).toContain('<del>deleted</del>');
  });

  it('should render headings', () => {
    expect(render('# Heading 1')).toContain('<h1>Heading 1</h1>');
    expect(render('## Heading 2')).toContain('<h2>Heading 2</h2>');
    expect(render('### Heading 3')).toContain('<h3>Heading 3</h3>');
  });

  it('should render unordered lists', () => {
    const html = render('- item 1\n- item 2');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>item 1</li>');
    expect(html).toContain('<li>item 2</li>');
  });

  it('should render ordered lists', () => {
    const html = render('1. first\n2. second');
    expect(html).toContain('<ol>');
    expect(html).toContain('<li>first</li>');
  });

  it('should render inline code', () => {
    expect(render('use `const`')).toContain('<code>const</code>');
  });

  it('should render code blocks', () => {
    const html = render('```js\nconst x = 1;\n```');
    expect(html).toContain('<pre>');
    expect(html).toContain('<code');
    expect(html).toContain('const x = 1;');
  });

  it('should render blockquotes', () => {
    const html = render('> quoted text');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('quoted text');
  });

  it('should render links', () => {
    const html = render('[click me](https://example.com)');
    expect(html).toContain('<a href="https://example.com"');
    expect(html).toContain('click me');
  });

  it('should render horizontal rules', () => {
    expect(render('---')).toContain('<hr');
  });

  it('should render tables', () => {
    const md = '| A | B |\n|---|---|\n| 1 | 2 |';
    const html = render(md);
    expect(html).toContain('<table>');
    expect(html).toContain('<th>A</th>');
    expect(html).toContain('<td>1</td>');
  });

  it('should return empty paragraph for empty input', () => {
    const html = render('');
    expect(html).toBe('');
  });

  it('should handle mixed markdown content', () => {
    const md = '# Title\n\nSome **bold** and *italic* text.\n\n- list item';
    const html = render(md);
    expect(html).toContain('<h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<li>list item</li>');
  });

  it('should sanitize HTML entities in code', () => {
    const html = render('`<script>alert("xss")</script>`');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  // --- DOMPurify XSS prevention ---

  it('should strip raw <script> tags from markdown', () => {
    const html = render('<script>alert("xss")</script>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('alert');
  });

  it('should strip event handlers from HTML in markdown', () => {
    const html = render('<img src="x" onerror="alert(1)">');
    expect(html).not.toContain('onerror');
  });

  it('should strip iframes', () => {
    const html = render('<iframe src="https://evil.com"></iframe>');
    expect(html).not.toContain('<iframe');
  });

  it('should strip javascript: hrefs', () => {
    const html = render('<a href="javascript:alert(1)">click</a>');
    expect(html).not.toContain('javascript:');
  });

  // --- GFM task list checkboxes ---

  it('should render task list checkboxes', () => {
    const html = render('- [ ] unchecked\n- [x] checked');
    expect(html).toContain('<input');
    expect(html).toContain('type="checkbox"');
  });

  it('should preserve checked attribute on task items', () => {
    const html = render('- [x] done');
    expect(html).toContain('checked');
  });

  it('should preserve disabled attribute on task checkboxes', () => {
    const html = render('- [ ] todo');
    expect(html).toContain('disabled');
  });
});
