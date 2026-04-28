import { parseBlocks } from './block-parser';

/**
 * Prepare article content for any rich preview surface (Review modal, Article
 * preview modal, etc). Strips wp:* block comments so the editor markup
 * doesn't leak through, and converts ACF custom blocks (which are
 * self-closing comments with no inner HTML) into visible placeholder cards.
 *
 * Without those placeholders the user can't tell whether content sits above
 * or below an ACF FAQ / callout / related-products block, because the
 * comment-stripping pass leaves nothing visible in their place.
 *
 * Safe to call on either raw Gutenberg block markup or the rendered HTML
 * WordPress returns from `content.rendered`: in either case any wp comments
 * are interpreted, ACF blocks are surfaced as placeholders, and everything
 * else is passed through.
 */
export function renderPreviewHtml(content: string): string {
  if (!content) return '';

  const blocks = parseBlocks(content);
  if (blocks.length === 0) {
    // No wp:* block comments found — content is already plain HTML.
    return content.trim();
  }

  const out: string[] = [];
  let cursor = 0;

  for (const block of blocks) {
    // Skip nested blocks (e.g. wp:list-item inside wp:list). The parent
    // block's stripped markup already contains them, so re-emitting would
    // duplicate the content AND leave stray closing tags from the parent
    // that were never re-emitted as a gap.
    if (block.startIndex < cursor) continue;

    if (block.startIndex > cursor) {
      out.push(content.slice(cursor, block.startIndex));
    }

    if (block.isAcf) {
      out.push(renderAcfPlaceholder(block.type, block.label));
    } else {
      out.push(stripBlockCommentsFromMarkup(block.fullMarkup));
    }
    cursor = block.endIndex;
  }
  if (cursor < content.length) {
    out.push(content.slice(cursor));
  }

  return out.join('').trim();
}

function renderAcfPlaceholder(rawType: string, label: string): string {
  const typeLabel = escapeHtml(rawType.replace(/^acf\//, ''));
  const summary = escapeHtml(label || typeLabel);
  return (
    `<aside class="acf-placeholder" data-acf-type="${typeLabel}">` +
    `<span class="acf-placeholder__tag">ACF block</span>` +
    `<span class="acf-placeholder__type">${typeLabel}</span>` +
    (summary && summary !== typeLabel
      ? `<span class="acf-placeholder__summary">${summary}</span>`
      : '') +
    `</aside>`
  );
}

function stripBlockCommentsFromMarkup(markup: string): string {
  return markup
    .replace(/<!--\s*wp:\S+[\s\S]*?-->/g, '')
    .replace(/<!--\s*\/wp:\S+\s*-->/g, '')
    .trim();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
