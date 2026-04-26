import { parseBlocks } from './block-parser';
import type { PlacementOption } from './smart-apply';

/**
 * KEEP recommendations carry a location hint in their `reason` field, like
 * "Intro paragraph - Already linked - keeping as it is the cluster pillar"
 * or "Look 1 - The Piste Skier - Already linked - keeping as ...".
 *
 * This function pulls out the leading phrase (everything before the first
 * "Already linked" or "already linked"), which names the section where
 * the link ideally belongs. Returns null when no hint is present.
 */
export function parseLocationHint(reason: string): string | null {
  if (!reason) return null;
  const m = reason.match(/^([\s\S]+?)\s*[-\u2013\u2014]\s*already linked\b/i);
  if (!m) return null;
  let hint = m[1]!.trim();
  // Strip trailing "/ already linked" fragments some reports use.
  hint = hint.replace(/\s*\/\s*already linked\s*$/i, '').trim();
  // Strip trailing punctuation that looks decorative.
  hint = hint.replace(/[:\-\u2013\u2014]+$/, '').trim();
  return hint.length === 0 ? null : hint;
}

export interface SectionRange {
  /** Byte offset of the matched heading block's opening `<!-- wp:` comment. */
  startIndex: number;
  /** Byte offset just past the section (next same-or-higher heading, or end). */
  endIndex: number;
  /** Byte offset just past the heading block itself (body starts here). */
  bodyStartIndex: number;
  /** Plain-text title of the matched heading, for UI labelling. */
  headingTitle: string;
  /** Heading level (1-6). */
  level: number;
}

/**
 * Find the section in `content` whose heading best matches the given hint.
 *
 * Matches real `<!-- wp:heading -->` blocks first. Falls back to bold-only
 * label paragraphs (`<strong>Related Reading:</strong>`) because some
 * articles use them as structural headings.
 *
 * "Matching" = case-insensitive substring overlap, with the hint compared
 * against the heading's plain text. Returns the highest-scoring section,
 * or null when nothing plausible is found.
 */
export function findSectionByHint(
  content: string,
  hint: string,
): SectionRange | null {
  if (!hint) return null;
  const blocks = parseBlocks(content);
  const normalisedHint = normaliseForMatch(hint);
  if (normalisedHint.length === 0) return null;

  // Special case: "Intro", "Introduction", "Opening", "Top" — these don't
  // name an actual heading in most articles. They refer to the unheaded
  // content at the top, before the first <h2>. Return a synthetic section
  // covering from byte 0 to the first real heading.
  if (isIntroHint(normalisedHint)) {
    const firstHeadingIdx = blocks.findIndex(
      (b) => b.type === 'heading' || b.type === 'core/heading',
    );
    const endIndex = firstHeadingIdx >= 0 ? blocks[firstHeadingIdx]!.startIndex : content.length;
    return {
      startIndex: 0,
      endIndex,
      bodyStartIndex: 0,
      headingTitle: 'Intro',
      level: 1,
    };
  }

  let bestIdx = -1;
  let bestScore = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    const title = sectionTitleFor(block);
    if (!title) continue;
    const score = similarityScore(normaliseForMatch(title), normalisedHint);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  if (bestIdx < 0 || bestScore < 0.4) return null;

  const headingBlock = blocks[bestIdx]!;
  const level = headingLevelFor(headingBlock) ?? 2;

  // Find the end of the section: the next heading at same or higher level
  // (numerically same-or-lower). Bold-label paragraphs count as level 3.
  let endIndex = content.length;
  for (let j = bestIdx + 1; j < blocks.length; j++) {
    const next = blocks[j]!;
    const nextLevel = headingLevelFor(next);
    if (nextLevel !== null && nextLevel <= level) {
      endIndex = next.startIndex;
      break;
    }
  }

  return {
    startIndex: headingBlock.startIndex,
    endIndex,
    bodyStartIndex: headingBlock.endIndex,
    headingTitle: sectionTitleFor(headingBlock) ?? '',
    level,
  };
}

/**
 * True when the given link (anchor text AND href) already appears inside
 * the byte range [startIndex, endIndex). Both must be present, not just
 * the anchor text on its own.
 */
export function isLinkInSection(
  content: string,
  anchor: string,
  href: string,
  startIndex: number,
  endIndex: number,
): boolean {
  if (!anchor || !href) return false;
  const slice = content.substring(startIndex, endIndex);
  // href match is exact (URLs don't typically vary in case). Anchor match
  // is fuzzy: the rec's anchor is often a lower-case, stripped version of
  // what actually appears in the article (e.g. rec says "best ski resorts
  // in Europe", article has "100 Best Ski Resorts In Europe"). Treat the
  // link as present when the normalised anchor is a substring of the
  // normalised slice AND the href appears verbatim.
  if (!slice.includes(href)) return false;
  const normAnchor = normaliseForMatch(anchor);
  const normSlice = normaliseForMatch(slice);
  return normAnchor.length > 0 && normSlice.includes(normAnchor);
}

/**
 * Find placement options (insertion points) within a section's byte range.
 * Each option sits immediately after a paragraph or heading block inside
 * the section, so the user can pick where their relocated link will land.
 * Mr Opus can reword surrounding prose afterwards, so we don't need to
 * score these by relevance.
 */
export function findPlacementOptionsInSection(
  content: string,
  section: SectionRange,
): PlacementOption[] {
  const options: PlacementOption[] = [];
  const blockRegex = /<!-- wp:(paragraph|heading)(?:\s[^>]*)?-->\s*<(p|h[1-6])[^>]*>([\s\S]*?)<\/\2>\s*<!-- \/wp:\1 -->/gi;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(content)) !== null) {
    const blockStart = match.index;
    const blockEnd = match.index + match[0].length;
    // Only include blocks whose range sits within the section.
    if (blockStart < section.startIndex) continue;
    if (blockEnd > section.endIndex) break;

    const blockType = match[1]!.toLowerCase();
    const innerHtml = match[3]!;
    const plainText = innerHtml.replace(/<[^>]+>/g, '').trim();
    if (plainText.length < 5) continue;

    const snippetText = plainText.length > 120
      ? plainText.substring(0, 117) + '...'
      : plainText;
    const label = blockType === 'heading'
      ? `Below heading: "${snippetText}"`
      : `After: "${snippetText}"`;

    options.push({
      snippet: snippetText,
      position: 'after',
      label,
      score: 1,
      insertAt: blockEnd,
    });
  }

  return options;
}

export interface RelocateResult {
  success: boolean;
  modifiedContent: string;
  explanation: string;
}

/**
 * Remove the anchor + href from wherever it currently lives in `content`,
 * then insert a bare `<a href="…">anchor</a>` paragraph block at the
 * chosen insertion point. Mr Opus Review does the editorial polish
 * afterwards.
 *
 * The bare-anchor approach is intentional: we want to give Mr Opus the
 * least constrained input so he can rewrite the sentence naturally.
 */
export function applyLinkRelocation(
  content: string,
  anchor: string,
  href: string,
  insertAt: number,
): RelocateResult {
  if (!href) {
    return {
      success: false,
      modifiedContent: content,
      explanation: 'Missing href for relocation',
    };
  }

  const escapedHref = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match the anchor tag by href only. The rec's anchor text is often a
  // stripped or lower-case version of what's actually in the article
  // (rec says "best ski resorts in Europe", article has "100 Best Ski
  // Resorts In Europe"), so matching on anchor text is brittle. Match on
  // href and reuse whatever text is inside the tag. Tempered greedy token
  // on the body prevents crossing </a> boundaries.
  const anchorTagRe = new RegExp(
    `<a\\s[^>]*href="${escapedHref}"[^>]*>((?:(?!</a>)[\\s\\S])*?)</a>`,
    'i',
  );
  const anchorMatch = content.match(anchorTagRe);
  if (!anchorMatch || anchorMatch.index === undefined) {
    return {
      success: false,
      modifiedContent: content,
      explanation: `Could not locate current instance of ${href}`,
    };
  }

  const matchStart = anchorMatch.index;
  const matchEnd = matchStart + anchorMatch[0].length;
  // Prefer the rec's anchor text at the new location because it's typically
  // already in prose / sentence case (e.g. "best ski resorts in Europe").
  // The article's anchor text is usually Title Case because it came from a
  // Related Reading list ("100 Best Ski Resorts In Europe"), which reads
  // wrong when woven into a sentence. Fall back to the article's text only
  // when the rec didn't carry an anchor.
  const newAnchorText = anchor.trim() || anchorMatch[1]!.trim();

  // Strip the anchor tag from source. Leave a single space so adjacent
  // words don't collide; Mr Opus will tidy the whitespace.
  const contentWithoutLink =
    content.substring(0, matchStart) + ' ' + content.substring(matchEnd);

  // Adjust insertAt if it sat after the anchor's original position.
  const removedLen = matchEnd - matchStart - 1; // we left a single space
  const adjustedInsertAt = insertAt > matchEnd
    ? insertAt - removedLen
    : insertAt > matchStart
      ? matchStart + 1
      : insertAt;

  const newBlock = `\n\n<!-- wp:paragraph -->\n<p><a href="${href}">${newAnchorText}</a></p>\n<!-- /wp:paragraph -->`;
  const modifiedContent =
    contentWithoutLink.substring(0, adjustedInsertAt) +
    newBlock +
    contentWithoutLink.substring(adjustedInsertAt);

  return {
    success: true,
    modifiedContent,
    explanation: `Moved "${anchor}" link to chosen placement`,
  };
}

// ── helpers ────────────────────────────────────────────────────────────

function sectionTitleFor(block: ReturnType<typeof parseBlocks>[number]): string | null {
  if (block.type === 'heading' || block.type === 'core/heading') {
    const m = block.innerContent.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
    if (m) return stripTags(m[1]!);
    return stripTags(block.innerContent);
  }
  // Bold-only paragraph label (e.g. <strong>Related Reading:</strong>).
  if (block.type === 'paragraph' || block.type === 'core/paragraph') {
    const pInner = block.innerContent.match(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/i);
    if (!pInner) return null;
    const innerHtml = pInner[1]!;
    const plain = stripTags(innerHtml);
    if (plain.length === 0 || plain.length > 80) return null;
    const clean = innerHtml.replace(/&nbsp;/g, ' ').trim();
    if (!/^<(strong|b|em)>[\s\S]+<\/\1>[\s:.,]*$/i.test(clean)) return null;
    const mTag = clean.match(/<(strong|b|em)>([\s\S]*?)<\/\1>/i);
    return mTag ? stripTags(mTag[2]!) : null;
  }
  return null;
}

function headingLevelFor(block: ReturnType<typeof parseBlocks>[number]): number | null {
  if (block.type === 'heading' || block.type === 'core/heading') {
    const m = block.innerContent.match(/<h([1-6])[^>]*>/i);
    if (m) return parseInt(m[1]!, 10);
    return 2; // default heading level
  }
  // Bold-only label paragraphs act like h3: lower-priority section markers
  // that shouldn't stop a higher h2 section from extending through them.
  if (sectionTitleFor(block) !== null) return 3;
  return null;
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

const INTRO_HINT_PATTERNS: RegExp[] = [
  /^intro(duction)?(\s+paragraph|\s+section)?$/,
  /^opening(\s+paragraph|\s+section)?$/,
  /^top(\s+of\s+(article|page))?$/,
  /^lead(\s+paragraph|\s+in)?$/,
  /^first\s+paragraph$/,
];

function isIntroHint(normalisedHint: string): boolean {
  return INTRO_HINT_PATTERNS.some((re) => re.test(normalisedHint));
}

function normaliseForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Token-overlap score between two already-normalised strings. Returns a
 * value in [0, 1]. We require meaningful overlap; a hint like "Intro
 * paragraph" should match a heading whose text starts with "Introduction"
 * or similar, not every heading on the page.
 */
function similarityScore(a: string, b: string): number {
  const aTokens = new Set(a.split(' ').filter((t) => t.length >= 3));
  const bTokens = new Set(b.split(' ').filter((t) => t.length >= 3));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let shared = 0;
  for (const t of aTokens) if (bTokens.has(t)) shared += 1;
  // Substring bonus — when the hint is the literal prefix of the heading
  // (e.g. "Look 1" in "Look 1 - The Piste Skier"), treat it as a strong
  // match regardless of token overlap.
  const substringBonus = a.includes(b) || b.includes(a) ? 0.3 : 0;
  const overlapRatio = shared / Math.min(aTokens.size, bTokens.size);
  return Math.min(overlapRatio + substringBonus, 1);
}
