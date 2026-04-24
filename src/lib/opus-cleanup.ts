import { parseBlocks } from './block-parser';

/**
 * Detect blocks that Mr Opus should look at even if they don't contain a
 * locked link. Two signals for now:
 *
 *   - "truncated": paragraph plain-text ends in a weak word (e.g. "find a",
 *     "including the") — usually the tail of a removed link's sentence.
 *   - "orphan-link": paragraph's content is essentially a single <a> tag with
 *     almost no surrounding prose — a link that was parked standalone when
 *     it would have read better as a sentence inside a section.
 *
 * List items inside <!-- wp:list --> blocks are skipped; link-only list items
 * are a legitimate pattern (e.g. Related Reading).
 *
 * Returns a sorted, deduplicated array of block indices into the parsed block
 * list, ready to feed to `extractReviewSegments` as `additionalTargets`.
 */
export function findCleanupTargets(content: string): number[] {
  const blocks = parseBlocks(content);
  const indices = new Set<number>();

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    if (block.isAcf) continue;
    if (block.type !== 'paragraph') continue;

    const plainText = stripHtmlAndEntities(block.innerContent);
    if (plainText.length === 0) continue;

    if (isTruncated(plainText)) {
      indices.add(i);
      continue;
    }

    if (isOrphanLinkBlock(block.innerContent, plainText)) {
      indices.add(i);
    }
  }

  return [...indices].sort((a, b) => a - b);
}

function stripHtmlAndEntities(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A paragraph whose plain text ends with a determiner, preposition, or
 * conjunction is almost certainly a truncated sentence. Common after a
 * REMOVE recommendation strips the trailing link + anchor text.
 */
export function isTruncated(plainText: string): boolean {
  const trimmed = plainText.trim();
  if (trimmed.length === 0) return false;

  // Explicit weak-ending words. Matches whole-word at the end.
  const weakEnding =
    /\b(a|an|the|our|my|your|their|its|his|her|in|on|of|to|for|with|and|or|but|like|as|such|include|includes|including|feature|features|featuring|offer|offers|offering|from|at|by|via|into|onto|through|about)\s*$/i;
  if (weakEnding.test(trimmed)) return true;

  // Ends without any closing punctuation at all (and has non-trivial length).
  // Restrict to substantive paragraphs so we don't trip on tiny captions.
  const lastChar = trimmed.slice(-1);
  if (!'.!?:;)"\u2019\u201d'.includes(lastChar) && trimmed.length > 30) return true;

  return false;
}

/**
 * A paragraph whose rendered content is essentially just one link — the block
 * contains exactly one <a> tag and the text outside the anchor is shorter
 * than ~15 chars. These read badly as standalone prose.
 */
export function isOrphanLinkBlock(innerHtml: string, plainText: string): boolean {
  const anchors = innerHtml.match(/<a\b[^>]*>/gi) ?? [];
  if (anchors.length !== 1) return false;

  const anchorTextMatch = innerHtml.match(/<a\b[^>]*>([\s\S]*?)<\/a>/i);
  if (!anchorTextMatch) return false;

  const anchorPlain = stripHtmlAndEntities(anchorTextMatch[1] ?? '');
  const proseOutsideAnchor = plainText.replace(anchorPlain, '').trim();

  return proseOutsideAnchor.length < 15;
}
