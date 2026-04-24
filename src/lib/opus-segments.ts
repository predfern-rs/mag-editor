import { parseBlocks } from './block-parser';

export interface ReviewSegment {
  /** Stable id like "s1", "s2" — used in the prompt + response envelope. */
  id: string;
  /** Byte range in the original content that this segment will replace. */
  startIndex: number;
  endIndex: number;
  /** Raw Gutenberg block markup for this segment (what Mr Opus sees). */
  markup: string;
  /** Locked links that fall inside this segment. */
  locks: Array<{ anchor: string; href: string }>;
}

/**
 * Build the minimal set of review segments to send to Mr Opus.
 *
 * A "target" block is one containing a locked anchor or href.  Each target is
 * expanded by `contextRadius` blocks on either side so the model can polish
 * transitions, but context expansion stops at ACF blocks (we don't want ACF
 * markup in the prompt — it's too easy to mangle).
 *
 * Overlapping/adjacent ranges are merged into a single segment so the model
 * can merge across blocks when that reads better.
 */
export function extractReviewSegments(
  content: string,
  lockedLinks: Array<{ anchor: string; href: string }>,
  contextRadius = 1,
): ReviewSegment[] {
  if (lockedLinks.length === 0) return [];

  const blocks = parseBlocks(content);
  if (blocks.length === 0) return [];

  // Target blocks: contain a locked anchor or href, and aren't ACF.
  const targets: number[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    if (block.isAcf) continue;
    for (const lock of lockedLinks) {
      if (
        (lock.anchor && block.fullMarkup.includes(lock.anchor)) ||
        (lock.href && block.fullMarkup.includes(lock.href))
      ) {
        targets.push(i);
        break;
      }
    }
  }

  if (targets.length === 0) return [];

  // Expand each target by contextRadius, stopping expansion at ACF blocks
  // (so ACF markup is never in the prompt — can't be mangled if not sent).
  const ranges: Array<[number, number]> = [];
  for (const t of targets) {
    let start = t;
    for (let r = 1; r <= contextRadius; r++) {
      const i = t - r;
      if (i < 0 || blocks[i]!.isAcf) break;
      start = i;
    }
    let end = t;
    for (let r = 1; r <= contextRadius; r++) {
      const i = t + r;
      if (i >= blocks.length || blocks[i]!.isAcf) break;
      end = i;
    }
    ranges.push([start, end]);
  }

  // Merge adjacent / overlapping ranges.
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [s, e] of ranges) {
    const last = merged[merged.length - 1];
    if (last && last[1] >= s - 1) {
      last[1] = Math.max(last[1], e);
    } else {
      merged.push([s, e]);
    }
  }

  return merged.map(([s, e], i) => {
    const startIndex = blocks[s]!.startIndex;
    const endIndex = blocks[e]!.endIndex;
    const markup = content.substring(startIndex, endIndex);
    const segmentLocks = lockedLinks.filter(
      (lock) =>
        (lock.anchor ? markup.includes(lock.anchor) : true) &&
        (lock.href ? markup.includes(lock.href) : true),
    );
    return {
      id: `s${i + 1}`,
      startIndex,
      endIndex,
      markup,
      locks: segmentLocks,
    };
  });
}

/**
 * Stitch reviewed segments back into the original content.
 *
 * `reviewedById` is a map from segment id → new markup returned by Mr Opus.
 * Segments not present in the map are left unchanged.  Replacements happen
 * right-to-left so earlier byte offsets stay valid.
 */
export function stitchReviewedSegments(
  originalContent: string,
  segments: ReviewSegment[],
  reviewedById: Record<string, string>,
): string {
  let result = originalContent;
  const sorted = [...segments].sort((a, b) => b.startIndex - a.startIndex);
  for (const seg of sorted) {
    const newMarkup = reviewedById[seg.id];
    if (typeof newMarkup !== 'string') continue;
    result = result.substring(0, seg.startIndex) + newMarkup + result.substring(seg.endIndex);
  }
  return result;
}
