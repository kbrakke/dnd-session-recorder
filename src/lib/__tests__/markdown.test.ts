import { describe, it, expect } from 'vitest';
import { renderMarkdownToSafeHtml } from '../markdown';

describe('renderMarkdownToSafeHtml', () => {
  it('renders normal markdown to HTML', () => {
    const html = renderMarkdownToSafeHtml('# Title\n\n- one\n- two');
    expect(html).toContain('<h1');
    expect(html).toContain('Title');
    expect(html).toContain('<li>one</li>');
  });

  it('strips <script> tags', () => {
    const html = renderMarkdownToSafeHtml('hello <script>alert(1)</script> world');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
  });

  it('strips event-handler attributes', () => {
    const html = renderMarkdownToSafeHtml('<img src="x" onerror="alert(1)">');
    expect(html).not.toContain('onerror');
  });

  it('strips javascript: URLs', () => {
    const html = renderMarkdownToSafeHtml('[click](javascript:alert(1))');
    expect(html.toLowerCase()).not.toContain('javascript:');
  });

  it('returns an empty string for empty/nullish input', () => {
    expect(renderMarkdownToSafeHtml('')).toBe('');
    expect(renderMarkdownToSafeHtml(null)).toBe('');
    expect(renderMarkdownToSafeHtml(undefined)).toBe('');
  });
});
