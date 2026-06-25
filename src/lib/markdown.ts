import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

/**
 * Render untrusted markdown to HTML that is safe to inject via
 * `dangerouslySetInnerHTML`.
 *
 * The content rendered here (AI summaries, DM TODO lists) is derived from
 * user-uploaded audio transcripts and, in shared campaigns, can originate from
 * another member. `marked` does not sanitize its output (the `sanitize` option
 * was removed in marked v5+), so the result MUST be passed through DOMPurify
 * before it reaches the DOM. Never render `marked()` output directly.
 */
export function renderMarkdownToSafeHtml(markdown: string | null | undefined): string {
  if (!markdown) return '';
  const rawHtml = marked.parse(markdown, { async: false }) as string;
  return DOMPurify.sanitize(rawHtml);
}
