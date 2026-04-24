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
    // Include paragraph, heading, list-item, and quote as editable block types.
    // Headings rarely truncate but occasionally an orphan-link paragraph is
    // really a list item that was injected mid-article.
    if (!['paragraph', 'list-item', 'quote'].includes(block.type)) continue;

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

  // Dangling "Related Reading"-style sections: heading (or bold-label paragraph)
  // followed by an empty or one-item list after REMOVE operations stripped
  // most of the links out. Mr Opus may delete the whole heading+list pair.
  for (const [headingIdx, listIdx] of findDanglingRelatedReadingPairs(blocks)) {
    indices.add(headingIdx);
    if (listIdx !== null) indices.add(listIdx);
  }

  // Dangling shop-callout sections: a heading whose only follower is a single
  // paragraph that was pushing product links, now damaged or emptied by REMOVE.
  // Same deal as Related Reading — Mr Opus may delete the whole pair together.
  for (const [headingIdx, paragraphIdx] of findDanglingShopCalloutPairs(blocks)) {
    indices.add(headingIdx);
    indices.add(paragraphIdx);
  }

  // Paragraphs with malformed markup (multiple <p> tags in one block, stray
  // </li> tags, unbalanced <p>/</p>) — usually smart-apply damage that Mr
  // Opus must clean up or the article ships with broken HTML.
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    if (block.type !== 'paragraph' && block.type !== 'core/paragraph') continue;
    if (hasMalformedParagraphMarkup(block.fullMarkup)) indices.add(i);
  }

  return [...indices].sort((a, b) => a - b);
}

const RELATED_READING_PATTERNS: RegExp[] = [
  /^related\s+reading\b/i,
  /^related\s+articles?\b/i,
  /^more\s+from\s+us\b/i,
  /^see\s+also\b/i,
  /^further\s+reading\b/i,
  /^you\s+might\s+also\s+like\b/i,
  /^other\s+articles?\b/i,
];

/**
 * True when a plain-text label reads like a "Related Reading" section marker.
 * Used both for real <h*> headings and for bold-only paragraph labels that
 * older articles use as structural dividers.
 */
export function isRelatedReadingLabelText(text: string): boolean {
  const normalised = text.replace(/[:\-\u2013\u2014]+$/, '').trim();
  return RELATED_READING_PATTERNS.some((re) => re.test(normalised));
}

/**
 * Count list-items in a <!-- wp:list --> block whose innerContent contains
 * at least one <a> tag. Empty items and plain-text items don't count — the
 * whole point of Related Reading lists is the links.
 */
export function countLinkListItems(listInnerHtml: string): number {
  const items = listInnerHtml.match(
    /<!--\s*wp:list-item\s*-->[\s\S]*?<!--\s*\/wp:list-item\s*-->/gi,
  ) ?? [];
  let count = 0;
  for (const item of items) {
    if (/<a\b[^>]*>/i.test(item)) count += 1;
  }
  return count;
}

/**
 * Find Related-Reading heading/label blocks whose adjacent list block has
 * 0 or 1 link items (or no list at all). Returns [headingIdx, listIdx|null]
 * pairs so the caller can flag both for review.
 *
 * Handles two label styles:
 *   - Real <!-- wp:heading --> blocks.
 *   - Bold-only paragraph blocks (e.g. `<strong>Related Reading:</strong>`).
 */
function findDanglingRelatedReadingPairs(
  blocks: ReturnType<typeof parseBlocks>,
): Array<[number, number | null]> {
  const pairs: Array<[number, number | null]> = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    const labelText = labelTextFor(block);
    if (labelText === null) continue;
    if (!isRelatedReadingLabelText(labelText)) continue;

    // Find the next non-empty block. If it's a list, inspect item count.
    // If it's not a list (meaning the list was stripped, or there never was
    // one), still flag the heading as a dangling section candidate.
    let listIdx: number | null = null;
    let linkCount = 0;
    for (let j = i + 1; j < blocks.length; j++) {
      const next = blocks[j]!;
      if (next.isAcf) continue;
      if (next.type === 'list') {
        listIdx = j;
        linkCount = countLinkListItems(next.innerContent);
      }
      break;
    }

    if (listIdx === null || linkCount <= 1) {
      pairs.push([i, listIdx]);
    }
  }
  return pairs;
}

/**
 * Heuristic patterns matching the title of a shop / product-promotion
 * callout heading. These sections exist purely to push product category
 * links; once those links are removed they're dead weight and should be
 * collapsible as a unit (heading + single paragraph).
 */
const SHOP_CALLOUT_HEADING_PATTERNS: RegExp[] = [
  /\bget\s+inspiration\b/i,
  /\bshop\s+(our|the|this)/i,
  /\b(our|the|latest|new)\s+collection\b/i,
  /\bbrowse\s+(our|the)/i,
  /\b(shop|see|check\s+out|discover)\s+.+(gear|kit|jackets?|pants?|outfits?|looks?|clothing|accessories)/i,
  /\bbuy\s+(the|our)/i,
];

export function isShopCalloutHeadingText(text: string): boolean {
  const normalised = text.replace(/[:\-\u2013\u2014]+$/, '').trim();
  return SHOP_CALLOUT_HEADING_PATTERNS.some((re) => re.test(normalised));
}

/**
 * Count outbound links in a paragraph block's innerContent whose href looks
 * like a product or category URL (country prefix like /uk/, /us/, /de/, etc.
 * followed by a slug). Used to confirm a "shop callout" pattern — not for
 * strict validation, just to avoid flagging every heading+paragraph pair.
 */
function countShopLinks(paragraphInner: string): number {
  const anchors = paragraphInner.match(/<a\b[^>]*href="[^"]+"/gi) ?? [];
  let count = 0;
  for (const anchor of anchors) {
    const href = anchor.match(/href="([^"]+)"/i)?.[1] ?? '';
    if (/ridestore\.com\/(?:[a-z]{2}|intl)\/[a-z0-9-]+/i.test(href)) count += 1;
  }
  return count;
}

/**
 * Detect paragraph blocks produced with damage — usually by smart-apply edge
 * cases when a sentence-level replace went wrong. Signals include multiple
 * <p> openings inside one block, stray closing tags for other elements, or
 * unbalanced <p>/</p> counts.
 */
export function hasMalformedParagraphMarkup(blockMarkup: string): boolean {
  // Pull out everything between the wp:paragraph delimiters.
  const m = blockMarkup.match(/<!--\s*wp:(?:core\/)?paragraph[^>]*-->([\s\S]*?)<!--\s*\/wp:(?:core\/)?paragraph\s*-->/);
  if (!m) return false;
  const inner = m[1]!;

  const openCount = (inner.match(/<p\b/gi) ?? []).length;
  const closeCount = (inner.match(/<\/p>/gi) ?? []).length;
  if (openCount !== closeCount) return true;
  if (openCount > 1) return true; // 2+ <p>...</p> inside one paragraph block
  // Stray closing tags that shouldn't be inside a paragraph block at all.
  if (/<\/li>|<\/ul>|<\/ol>|<\/h[1-6]>/i.test(inner)) return true;
  return false;
}

/**
 * Find shop-callout heading + single paragraph pairs whose paragraph has
 * been stripped of its product links (or mangled) such that the whole
 * section is now dead weight. Yields [headingIdx, paragraphIdx] so the
 * caller can flag both for review.
 */
function findDanglingShopCalloutPairs(
  blocks: ReturnType<typeof parseBlocks>,
): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    if (block.type !== 'heading' && block.type !== 'core/heading') continue;
    const title = labelTextFor(block);
    if (!title || !isShopCalloutHeadingText(title)) continue;

    // Find the next non-ACF block. We only flag if it's a paragraph —
    // if the next block is a list or something else, this isn't the
    // heading+paragraph shop-callout pattern.
    let next: (typeof blocks)[number] | null = null;
    let nextIdx = -1;
    for (let j = i + 1; j < blocks.length; j++) {
      const candidate = blocks[j]!;
      if (candidate.isAcf) continue;
      next = candidate;
      nextIdx = j;
      break;
    }
    if (!next || (next.type !== 'paragraph' && next.type !== 'core/paragraph')) continue;

    // Decide whether this is damaged/collapsible. Two signals:
    //  - malformed paragraph markup (smart-apply damage)
    //  - truncation artefacts in the paragraph's plain text
    //  - fewer than 2 shop links remaining (the callout has lost its purpose)
    const innerPlain = stripHtmlAndEntities(next.innerContent);
    const malformed = hasMalformedParagraphMarkup(next.fullMarkup);
    const truncated = isTruncated(innerPlain);
    const shopLinks = countShopLinks(next.innerContent);

    if (malformed || truncated || shopLinks < 2) {
      pairs.push([i, nextIdx]);
    }
  }
  return pairs;
}

/**
 * Return the plain-text label for a block that could act as a Related Reading
 * section marker: either a real heading, or a bold-only paragraph used as a
 * structural label. Returns null for anything else.
 */
function labelTextFor(block: ReturnType<typeof parseBlocks>[number]): string | null {
  if (block.type === 'heading') {
    const m = block.innerContent.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
    return m ? stripHtmlAndEntities(m[1]!) : stripHtmlAndEntities(block.innerContent);
  }
  if (block.type === 'paragraph') {
    // Mirror isBoldLabelParagraph in opus-review.ts: essentially just a
    // <strong>/<b>/<em> tag with short text.
    const pInner = block.innerContent.match(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/i);
    if (!pInner) return null;
    const innerHtml = pInner[1]!;
    const plain = stripHtmlAndEntities(innerHtml);
    if (plain.length === 0 || plain.length > 80) return null;
    const clean = innerHtml.replace(/&nbsp;/g, ' ').trim();
    if (!/^<(strong|b|em)>[\s\S]+<\/\1>[\s:.,]*$/i.test(clean)) return null;
    const mTag = clean.match(/<(strong|b|em)>([\s\S]*?)<\/\1>/i);
    return mTag ? stripHtmlAndEntities(mTag[2]!) : null;
  }
  return null;
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
