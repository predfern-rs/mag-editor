import type { LinkRecommendation } from './report-parser';
import { parseBlocks } from './block-parser';
import { isRelatedReadingLabelText, labelTextFor } from './opus-cleanup';

export interface ApplyResult {
  success: boolean;
  modifiedContent: string;
  explanation: string;
}

/**
 * When Strategy 3 finds a target paragraph, we prefer appending the new sentence
 * to the end of that paragraph rather than emitting a standalone block — provided
 * the resulting paragraph stays under this plain-text length. 600 chars is roughly
 * a comfortable reading paragraph; beyond that, a new block reads cleaner.
 */
const MERGE_MAX_COMBINED_CHARS = 600;

/**
 * Directly apply a recommendation to post content — no AI needed.
 * Analyses the recommendation's reason/context to find the right spot.
 */
export function applyRecommendation(
  rec: LinkRecommendation,
  content: string,
  keepText?: boolean,
): ApplyResult {
  if (rec.action === 'add') {
    return applyAddRecommendation(rec, content);
  } else if (rec.action === 'remove') {
    return applyRemoveRecommendation(rec, content, keepText ?? false);
  }
  return { success: false, modifiedContent: content, explanation: 'No action needed for KEEP recommendations' };
}

function applyAddRecommendation(rec: LinkRecommendation, content: string): ApplyResult {
  const anchor = rec.anchor;
  const url = rec.targetUrl;

  // Strategy 1: If there's a suggested sentence, try to find where it should go
  // using contextual clues from the reason field
  if (rec.suggestedSentence) {
    const result = insertSuggestedSentence(rec, content);
    if (result) return result;
  }

  // Strategy 2: If the anchor text already exists in the content, just wrap it in a link
  if (anchor) {
    const result = wrapExistingText(anchor, url, content);
    if (result) return result;
  }

  // Strategy 3: Use contextual clues from the reason to find the right section
  if (rec.suggestedSentence && rec.reason) {
    const result = insertNearContext(rec, content);
    if (result) return result;
  }

  return {
    success: false,
    modifiedContent: content,
    explanation: `Could not automatically apply: couldn't find "${anchor}" or a suitable location in the content. Use the AI Editor to apply manually.`,
  };
}

function applyRemoveRecommendation(rec: LinkRecommendation, content: string, keepText = false): ApplyResult {
  const url = rec.targetUrl;
  // Try both with and without trailing slash
  const urls = [url, url.endsWith('/') ? url.slice(0, -1) : url + '/'];

  let newContent = content;
  let found = false;
  let anchorText = '';

  for (const tryUrl of urls) {
    const escapedUrl = tryUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Tempered greedy token for anchor body: matches any char that isn't the
    // start of "</a>". Prevents the non-greedy regex from extending across
    // block boundaries when the nearest </a> isn't followed by the expected
    // suffix. Without this guard, a REMOVE can silently delete paragraphs
    // or sections between the target anchor and the next matching </a>.
    const anchorBody = `((?:(?!</a>)[\\s\\S])*?)`;
    const linkRegex = new RegExp(`<a\\s[^>]*href="${escapedUrl}"[^>]*>${anchorBody}</a>`, 'gi');

    if (linkRegex.test(newContent)) {
      found = true;
      linkRegex.lastIndex = 0;

      // Extract anchor text before replacing
      const extractMatch = linkRegex.exec(newContent);
      if (extractMatch) anchorText = extractMatch[1] ?? '';
      linkRegex.lastIndex = 0;

      if (keepText) {
        // Keep text, just remove the <a> tag
        newContent = newContent.replace(linkRegex, '$1');
      } else {
        // Remove the link AND its text entirely
        // Handle separators: &nbsp;/&nbsp; or / or | with any whitespace/nbsp around them
        const sep = `(?:\\s|&nbsp;)*[/|](?:\\s|&nbsp;)*`;

        // Pattern 1: separator BEFORE the link: " / <a>text</a>"
        const beforeSepRegex = new RegExp(`${sep}<a\\s[^>]*href="${escapedUrl}"[^>]*>${anchorBody}</a>`, 'gi');
        if (beforeSepRegex.test(newContent)) {
          beforeSepRegex.lastIndex = 0;
          newContent = newContent.replace(beforeSepRegex, '');
        }
        // Pattern 2: separator AFTER the link: "<a>text</a> / "
        else {
          const afterSepRegex = new RegExp(`<a\\s[^>]*href="${escapedUrl}"[^>]*>${anchorBody}</a>${sep}`, 'gi');
          if (afterSepRegex.test(newContent)) {
            afterSepRegex.lastIndex = 0;
            newContent = newContent.replace(afterSepRegex, '');
          }
          // Pattern 3: just the link, no separator
          else {
            newContent = newContent.replace(linkRegex, '');
          }
        }
      }

      break;
    }
  }

  if (!found) {
    return {
      success: false,
      modifiedContent: content,
      explanation: `Could not find a link to ${url} in the content.`,
    };
  }

  // Clean up empty wp:list-item blocks (must run before standalone <li> cleanup)
  newContent = newContent.replace(
    /<!-- wp:list-item -->\s*<li>(?:\s|&nbsp;)*<\/li>\s*<!-- \/wp:list-item -->\s*/g,
    '',
  );

  // Clean up empty list items: <li></li> or <li> </li> or <li>&nbsp;</li>
  newContent = newContent.replace(/<li>(?:\s|&nbsp;)*<\/li>/g, '');

  // Clean up empty wp:list blocks (no list items left)
  newContent = newContent.replace(
    /<!-- wp:list[^>]*-->\s*<ul[^>]*>\s*<\/ul>\s*<!-- \/wp:list -->\s*/g,
    '',
  );

  // Clean up excessive newlines
  newContent = newContent.replace(/\n{3,}/g, '\n\n');

  return {
    success: true,
    modifiedContent: newContent,
    explanation: keepText
      ? `Removed link to ${url} (kept "${anchorText}")`
      : `Removed "${anchorText}" and link to ${url}`,
  };
}

/**
 * Remove the single <a href=url> instance that was newly added relative to
 * `beforeContent`. Multiset-aware: if the URL already had links pointing to it
 * before the apply, those instances are preserved. Used by per-rec Undo to
 * cleanly remove just the link this apply inserted, even when other changes
 * have layered on top of `currentContent` since.
 *
 * Returns currentContent unchanged if no new instance can be identified.
 */
export function removeAddedLinkInstance(
  currentContent: string,
  beforeContent: string,
  url: string,
): string {
  if (!url) return currentContent;
  const urls = [url, url.endsWith('/') ? url.slice(0, -1) : url + '/'];
  const anchorBody = `(?:(?!</a>)[\\s\\S])*?`;

  for (const tryUrl of urls) {
    const escapedUrl = tryUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const linkRegex = new RegExp(`<a\\s[^>]*href="${escapedUrl}"[^>]*>${anchorBody}</a>`, 'gi');

    const beforeMatches = [...beforeContent.matchAll(linkRegex)].map((m) => m[0]);
    const currentMatches = [...currentContent.matchAll(linkRegex)].map((m) => m[0]);
    if (currentMatches.length === 0) continue;

    const beforeCounts = new Map<string, number>();
    for (const m of beforeMatches) beforeCounts.set(m, (beforeCounts.get(m) ?? 0) + 1);

    for (const m of currentMatches) {
      const remaining = beforeCounts.get(m) ?? 0;
      if (remaining > 0) {
        beforeCounts.set(m, remaining - 1);
        continue;
      }
      // First match in current that wasn't in before: this is the inserted one.
      const idx = currentContent.indexOf(m);
      if (idx >= 0) {
        return currentContent.substring(0, idx) + currentContent.substring(idx + m.length);
      }
    }
  }

  return currentContent;
}

/**
 * Try to apply the suggested sentence intelligently.
 *
 * Strategy:
 * 1. Extract the plain text from the suggested sentence (strip the markdown link)
 * 2. Find words from the suggested sentence in the existing content
 * 3. If there's a strong overlap with an existing sentence → it's a REWRITE → replace that sentence
 * 4. If no overlap → it's a NEW sentence → insert it near the relevant section
 */
function insertSuggestedSentence(rec: LinkRecommendation, content: string): ApplyResult | null {
  const sentence = rec.suggestedSentence;
  if (!sentence) return null;

  // Convert markdown links to HTML
  const htmlSentence = sentence.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2">$1</a>',
  );

  // Get the plain text of the suggested sentence (no links)
  const plainSuggested = sentence.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Extract significant words from the suggested sentence (4+ chars, not common)
  const suggestedWords = extractSignificantWords(plainSuggested);

  // Find the best matching sentence in the content using simple text search
  const matchedSentence = findMatchingSentenceText(content, suggestedWords);

  if (matchedSentence) {
    // Simple string replacement — find the exact sentence text and replace it
    const newContent = content.replace(matchedSentence, htmlSentence);

    if (newContent !== content) {
      return {
        success: true,
        modifiedContent: newContent,
        explanation: `Replaced: "${matchedSentence.substring(0, 60)}..." → linked sentence with "${rec.anchor}"`,
      };
    }
  }

  // No matching sentence found — this is a NEW sentence to insert
  // Use context terms from the reason, then from the suggested sentence and anchor
  const contextTerms = extractContextTerms(rec.reason);

  // Also extract significant words from the suggested sentence as fallback search terms
  if (contextTerms.length === 0) {
    const sentenceWords = extractSignificantWords(plainSuggested);
    // Use longer/rarer words first as paragraph search terms
    const fallbackTerms = sentenceWords
      .sort((a, b) => b.length - a.length)
      .slice(0, 8);
    contextTerms.push(...fallbackTerms);
  }

  const result = insertNearParagraph(contextTerms, content, htmlSentence, rec);
  if (result) return result;

  return null;
}

/** @internal — exported for testing */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Find the actual sentence text in the HTML content that best matches
 * the suggested words. Returns the raw HTML string of that sentence
 * so we can do a simple string.replace().
 *
 * This avoids complex character position mapping — we just find what
 * to search for and what to replace it with.
 */
/** @internal — exported for testing */
export function findMatchingSentenceText(
  content: string,
  suggestedWords: string[],
): string | null {
  if (suggestedWords.length === 0) return null;

  const normalizedWords = suggestedWords.map(normalize);

  // Extract all text inside <p> tags
  const paraRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let paraMatch: RegExpExecArray | null;

  let bestSentence: string | null = null;
  let bestScore = 0;

  while ((paraMatch = paraRegex.exec(content)) !== null) {
    const innerHtml = paraMatch[1]!;
    const plainText = innerHtml.replace(/<[^>]+>/g, '');
    if (plainText.length < 15) continue;

    // Split plain text into sentences (split on .!? AND on : followed by space)
    // This ensures "Ridestore recommends:" is separate from "For après on steroids..."
    const rawSentences = plainText.match(/[^.!?:]+[.!?:]+/g) || [plainText];
    // Re-join colon-split fragments that are too short (less than 20 chars) with the next one
    const sentences: string[] = [];
    for (let i = 0; i < rawSentences.length; i++) {
      const s = rawSentences[i]!;
      if (s.trim().endsWith(':') && i + 1 < rawSentences.length) {
        // This is a label like "Ridestore recommends:" — skip it, let the next sentence stand alone
        sentences.push(rawSentences[i + 1]!);
        i++; // skip next since we consumed it
      } else {
        sentences.push(s);
      }
    }

    // Pass 1: Score individual sentences
    for (const sentPlain of sentences) {
      const trimmed = sentPlain.trim();
      if (trimmed.length < 10) continue;

      const sentNormalized = normalize(trimmed);
      const matchCount = normalizedWords.filter((w) => sentNormalized.includes(w)).length;
      const score = matchCount / normalizedWords.length;

      if (score > bestScore && score >= 0.35) {
        const words = trimmed.split(/\s+/);
        const firstFew = words.slice(0, 3).join(' ');
        const lastFew = words.slice(-2).join(' ');

        const htmlSentence = extractSentenceHtml(innerHtml, firstFew, lastFew);
        if (htmlSentence) {
          bestSentence = htmlSentence;
          bestScore = score;
        }
      }
    }

    // Pass 2: Try windows of 2-3 adjacent sentences
    // This handles cases where the suggested sentence rewrites multiple existing sentences
    if (sentences.length >= 2) {
      for (let windowSize = 2; windowSize <= Math.min(3, sentences.length); windowSize++) {
        for (let start = 0; start <= sentences.length - windowSize; start++) {
          const windowSentences = sentences.slice(start, start + windowSize);
          const combinedPlain = windowSentences.map((s) => s.trim()).join(' ');
          if (combinedPlain.length < 15) continue;

          const combinedNormalized = normalize(combinedPlain);
          const matchCount = normalizedWords.filter((w) => combinedNormalized.includes(w)).length;
          const score = matchCount / normalizedWords.length;

          if (score > bestScore && score >= 0.35) {
            // Use the first words of the first sentence and last words of the last sentence
            const firstWords = windowSentences[0]!.trim().split(/\s+/);
            const lastWords = windowSentences[windowSize - 1]!.trim().split(/\s+/);
            const firstFew = firstWords.slice(0, 3).join(' ');
            const lastFew = lastWords.slice(-2).join(' ');

            const htmlSentence = extractSentenceHtml(innerHtml, firstFew, lastFew);
            if (htmlSentence) {
              bestSentence = htmlSentence;
              bestScore = score;
            }
          }
        }
      }
    }
  }

  return bestSentence;
}

/**
 * Extract a sentence from HTML by finding text anchors (first few words, last few words)
 * and returning everything between them INCLUDING any HTML tags.
 */
/** @internal — exported for testing */
export function extractSentenceHtml(
  innerHtml: string,
  firstFew: string,
  lastFew: string,
): string | null {
  const normFirst = normalize(firstFew);
  const normLast = normalize(lastFew);

  // We need to find firstFew and lastFew in the plain text,
  // but map those positions to the HTML string (which has tags)

  // Build a map: for each position in the plain text, what's the corresponding HTML position?
  const plainToHtml: number[] = [];
  for (let i = 0; i < innerHtml.length; i++) {
    if (innerHtml[i] === '<') {
      // Skip tag
      const tagEnd = innerHtml.indexOf('>', i);
      if (tagEnd >= 0) {
        i = tagEnd; // loop will i++ past the >
        continue;
      }
    }
    plainToHtml.push(i);
  }

  const plainText = innerHtml.replace(/<[^>]+>/g, '');
  const normPlain = normalize(plainText);

  // Find firstFew in plain text
  const startPlain = normPlain.indexOf(normFirst);
  if (startPlain < 0) return null;

  // Find lastFew in plain text (after firstFew)
  const endPlainStart = normPlain.indexOf(normLast, startPlain);
  if (endPlainStart < 0) return null;
  const endPlain = endPlainStart + lastFew.length;

  // Map to HTML positions
  if (startPlain >= plainToHtml.length || endPlain > plainToHtml.length) return null;

  const startHtml = plainToHtml[startPlain]!;
  let endHtml = endPlain < plainToHtml.length ? plainToHtml[endPlain]! : innerHtml.length;

  // Extend endHtml to include trailing punctuation
  while (endHtml < innerHtml.length && /[.!?]/.test(innerHtml[endHtml]!)) {
    endHtml++;
  }

  // The sentence in the HTML
  const sentenceHtml = innerHtml.substring(startHtml, endHtml);

  // Sanity check — should not be too short or too long relative to plain text
  if (sentenceHtml.length < 10) return null;

  return sentenceHtml;
}

/**
 * Extract significant words from a sentence (skip short/common words).
 */
/** @internal — exported for testing */
export function extractSignificantWords(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'and', 'or', 'but',
    'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'must', 'not',
    'this', 'that', 'these', 'those', 'it', 'its', 'from', 'by', 'as', 'so', 'if',
    'then', 'than', 'too', 'very', 'just', 'also', 'more', 'most', 'some', 'any',
    'one', 'two', 'our', 'your', 'you', 'we', 'they', 'them', 'their', 'about',
    'out', 'up', 'into', 'over', 'after', 'before', 'between', 'under', 'again',
    'check', 'guide', 'tips', 'recommendations', 'experience',
  ]);

  return text
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-ZÀ-ÿ'-]/g, ''))
    .filter((w) => w.length >= 4 && !stopWords.has(w.toLowerCase()));
}

/**
 * Wrap existing anchor text in a link if it exists in the content.
 */
function wrapExistingText(anchor: string, url: string, content: string): ApplyResult | null {
  const escapedAnchor = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Check if already linked
  const alreadyLinked = new RegExp(`<a\\s[^>]*>[^<]*${escapedAnchor}[^<]*</a>`, 'i');
  if (alreadyLinked.test(content)) {
    return {
      success: false,
      modifiedContent: content,
      explanation: `"${anchor}" is already linked in the content.`,
    };
  }

  // Find the text (case-insensitive)
  const lowerContent = content.toLowerCase();
  const lowerAnchor = anchor.toLowerCase();
  const idx = lowerContent.indexOf(lowerAnchor);

  if (idx === -1) return null;

  // Make sure we're inside HTML content, not in a block comment
  const before = content.substring(Math.max(0, idx - 100), idx);
  if (before.includes('<!--') && !before.includes('-->')) return null;

  const originalText = content.substring(idx, idx + anchor.length);
  const newContent =
    content.substring(0, idx) +
    `<a href="${url}">${originalText}</a>` +
    content.substring(idx + anchor.length);

  return {
    success: true,
    modifiedContent: newContent,
    explanation: `Wrapped "${originalText}" with link to ${url}`,
  };
}

/**
 * Use context clues to find a relevant paragraph and insert the sentence nearby.
 */
function insertNearContext(rec: LinkRecommendation, content: string): ApplyResult | null {
  if (!rec.suggestedSentence) return null;

  const htmlSentence = rec.suggestedSentence.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2">$1</a>',
  );

  const contextTerms = extractContextTerms(rec.reason);
  return insertNearParagraph(contextTerms, content, htmlSentence, rec);
}

/**
 * Find a paragraph in the content that mentions one of the context terms,
 * then insert the new sentence after it.
 * Tries headings first, then falls back to searching paragraph text.
 *
 * For each candidate paragraph we first attempt to *merge* the new sentence
 * into the paragraph's existing <p>...</p>. If the paragraph is already long,
 * or doesn't end in a sentence-terminal punctuation, we fall back to emitting
 * a standalone new <!-- wp:paragraph --> block (original behaviour).
 */
function insertNearParagraph(
  contextTerms: string[],
  content: string,
  htmlSentence: string,
  rec: LinkRecommendation,
): ApplyResult | null {
  // Strategy A: Find a heading matching a context term, insert at end of that section
  for (const term of contextTerms) {
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const headingRegex = new RegExp(
      `(<!-- wp:heading[^>]*-->\\s*<h[2-4][^>]*>[^<]*${escapedTerm}[^<]*</h[2-4]>\\s*<!-- /wp:heading -->)`,
      'i',
    );
    const headingMatch = content.match(headingRegex);

    if (headingMatch && headingMatch.index !== undefined) {
      const afterHeading = content.substring(headingMatch.index + headingMatch[0].length);
      const nextHeadingIdx = afterHeading.search(/<!-- wp:heading/);
      const sectionContent = nextHeadingIdx >= 0
        ? afterHeading.substring(0, nextHeadingIdx)
        : afterHeading.substring(0, 2000);

      const lastParaEnd = sectionContent.lastIndexOf('<!-- /wp:paragraph -->');
      if (lastParaEnd >= 0) {
        const paraEndGlobal = headingMatch.index + headingMatch[0].length + lastParaEnd + '<!-- /wp:paragraph -->'.length;
        const paraStartGlobal = content.lastIndexOf('<!-- wp:paragraph -->', paraEndGlobal);

        if (paraStartGlobal >= 0) {
          const merged = tryMergeAtParagraphEnd(content, paraStartGlobal, paraEndGlobal, htmlSentence);
          if (merged) {
            return {
              success: true,
              modifiedContent: merged,
              explanation: `Merged sentence into paragraph in "${term}" section: "${rec.anchor}" → ${rec.targetUrl}`,
            };
          }
        }

        const newBlock = `\n\n<!-- wp:paragraph -->\n<p>${htmlSentence}</p>\n<!-- /wp:paragraph -->`;
        const newContent = content.substring(0, paraEndGlobal) + newBlock + content.substring(paraEndGlobal);

        return {
          success: true,
          modifiedContent: newContent,
          explanation: `Added paragraph at end of "${term}" section: "${rec.anchor}" → ${rec.targetUrl}`,
        };
      }
    }
  }

  // Strategy B: Find a paragraph containing a context term, insert after it
  for (const term of contextTerms) {
    const termIdx = content.toLowerCase().indexOf(term.toLowerCase());
    if (termIdx === -1) continue;

    // Make sure we're inside a paragraph, not a block comment
    const beforeTerm = content.substring(0, termIdx);
    if (beforeTerm.includes('<!--') && !beforeTerm.includes('-->')) continue;

    const paraStart = beforeTerm.lastIndexOf('<!-- wp:paragraph -->');
    if (paraStart < 0) continue;

    const paraContent = content.substring(paraStart);
    const paraEndMatch = paraContent.match(/<\/p>\s*\n\s*<!-- \/wp:paragraph -->/);
    if (!paraEndMatch || paraEndMatch.index === undefined) continue;

    const paraEndGlobal = paraStart + paraEndMatch.index + paraEndMatch[0].length;

    const merged = tryMergeAtParagraphEnd(content, paraStart, paraEndGlobal, htmlSentence);
    if (merged) {
      return {
        success: true,
        modifiedContent: merged,
        explanation: `Merged sentence into paragraph about "${term}": "${rec.anchor}" → ${rec.targetUrl}`,
      };
    }

    const newBlock = `\n\n<!-- wp:paragraph -->\n<p>${htmlSentence}</p>\n<!-- /wp:paragraph -->`;
    const newContent = content.substring(0, paraEndGlobal) + newBlock + content.substring(paraEndGlobal);

    return {
      success: true,
      modifiedContent: newContent,
      explanation: `Added new paragraph with link near "${term}": "${rec.anchor}" → ${rec.targetUrl}`,
    };
  }

  return null;
}

/**
 * Try to append the new sentence into the <p>...</p> that spans
 * [paraStart, paraEnd] in content. Returns the modified content, or null
 * if the merge wouldn't read well (short final char, combined length over cap).
 */
export function tryMergeAtParagraphEnd(
  content: string,
  paraStart: number,
  paraEnd: number,
  htmlSentence: string,
): string | null {
  const block = content.substring(paraStart, paraEnd);

  // Find the last </p> within the block.
  const closingTagIdx = block.lastIndexOf('</p>');
  if (closingTagIdx < 0) return null;

  // Extract <p>...</p> inner HTML.
  const openingTagMatch = block.match(/<p(?:\s[^>]*)?>/);
  if (!openingTagMatch || openingTagMatch.index === undefined) return null;
  const innerStart = openingTagMatch.index + openingTagMatch[0].length;
  const innerHtml = block.substring(innerStart, closingTagIdx);

  const existingPlain = stripHtml(innerHtml).trim();
  if (existingPlain.length === 0) return null;

  // Paragraph should end in a sentence-final punctuation mark. If it ends
  // in a comma, colon, semicolon, or an open structure, merging reads badly.
  const trailingChar = existingPlain.slice(-1);
  if (!['.', '!', '?'].includes(trailingChar)) return null;

  const newPlain = stripHtml(htmlSentence).trim();
  if (newPlain.length === 0) return null;

  // Length gate: combined plain-text paragraph shouldn't exceed the cap.
  if (existingPlain.length + 1 + newPlain.length > MERGE_MAX_COMBINED_CHARS) return null;

  const mergedInner = `${innerHtml.replace(/\s+$/, '')} ${htmlSentence}`;
  const mergedBlock =
    block.substring(0, innerStart) +
    mergedInner +
    block.substring(closingTagIdx);

  return content.substring(0, paraStart) + mergedBlock + content.substring(paraEnd);
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
}

// ── Placement suggestions ──────────────────────────────────────────

export interface PlacementOption {
  /** Text snippet from the article (the paragraph or heading) */
  snippet: string;
  /** Where to insert relative to the snippet */
  position: 'after' | 'before';
  /** Label like "After paragraph about ski culture..." */
  label: string;
  /** Relevance score 0-1 */
  score: number;
  /** The byte offset in the content where the new block would be inserted */
  insertAt: number;
}

/**
 * Scan article content and return the best placement options for a suggested sentence.
 * Returns up to `limit` options sorted by relevance score.
 */
export function findPlacementOptions(
  rec: LinkRecommendation,
  content: string,
  limit = 4,
): PlacementOption[] {
  if (!rec.suggestedSentence) return [];

  const plainSuggested = rec.suggestedSentence.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  const suggestedWords = extractSignificantWords(plainSuggested);
  const normalizedWords = suggestedWords.map(normalize);

  // Also get context terms from the reason
  const contextTerms = extractContextTerms(rec.reason);
  const contextNormalized = contextTerms.map((t) => normalize(t));

  const options: PlacementOption[] = [];

  // Find all paragraphs and headings as potential insertion points
  const blockRegex = /<!-- wp:(paragraph|heading)(?:\s[^>]*)? -->\s*<(p|h[2-4])[^>]*>([\s\S]*?)<\/\2>\s*<!-- \/wp:\1 -->/gi;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(content)) !== null) {
    const blockType = match[1]!.toLowerCase();
    const innerHtml = match[3]!;
    const plainText = innerHtml.replace(/<[^>]+>/g, '').trim();
    if (plainText.length < 10) continue;

    const normText = normalize(plainText);

    // Score: how many suggested words appear in this paragraph?
    let wordScore = 0;
    if (normalizedWords.length > 0) {
      const wordHits = normalizedWords.filter((w) => normText.includes(w)).length;
      wordScore = wordHits / normalizedWords.length;
    }

    // Bonus for context term matches (from reason field)
    let contextBonus = 0;
    for (const ct of contextNormalized) {
      if (normText.includes(ct)) {
        contextBonus += 0.15;
      }
    }

    // Bonus for headings (they're section markers — good insertion points)
    const headingBonus = blockType === 'heading' ? 0.1 : 0;

    const totalScore = Math.min(wordScore + contextBonus + headingBonus, 1);
    if (totalScore < 0.08) continue;

    // Determine insertion point (after this block)
    const insertAt = match.index + match[0].length;

    // Build a readable snippet (truncate if long)
    const snippetText = plainText.length > 120
      ? plainText.substring(0, 117) + '...'
      : plainText;

    const isHeading = blockType === 'heading';
    const label = isHeading
      ? `Below heading: "${snippetText}"`
      : `After: "${snippetText}"`;

    options.push({
      snippet: snippetText,
      position: 'after',
      label,
      score: totalScore,
      insertAt,
    });
  }

  // Sort by score descending, take top N
  options.sort((a, b) => b.score - a.score);

  // Deduplicate: if options are very close in position (within 200 chars), keep the higher-scored one
  const filtered: PlacementOption[] = [];
  for (const opt of options) {
    const tooClose = filtered.some((f) => Math.abs(f.insertAt - opt.insertAt) < 200);
    if (!tooClose) {
      filtered.push(opt);
      if (filtered.length >= limit) break;
    }
  }

  return filtered;
}

/**
 * Insert a suggested sentence at a specific placement option's location.
 */
export function applyAtPlacement(
  rec: LinkRecommendation,
  content: string,
  placement: PlacementOption,
): ApplyResult {
  if (!rec.suggestedSentence) {
    return { success: false, modifiedContent: content, explanation: 'No suggested sentence' };
  }

  const htmlSentence = rec.suggestedSentence.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2">$1</a>',
  );

  const newBlock = `\n\n<!-- wp:paragraph -->\n<p>${htmlSentence}</p>\n<!-- /wp:paragraph -->`;
  const newContent =
    content.substring(0, placement.insertAt) +
    newBlock +
    content.substring(placement.insertAt);

  return {
    success: true,
    modifiedContent: newContent,
    explanation: `Inserted "${rec.anchor}" link ${placement.position} "${placement.snippet.substring(0, 50)}..."`,
  };
}

/**
 * Extract meaningful context terms from a reason string.
 * e.g. "Mayrhofen section (Snowbombing mention)" → ["Mayrhofen", "Snowbombing"]
 * e.g. "Related reading - natural companion for ski packing" → ["ski packing"]
 */
function extractContextTerms(reason: string): string[] {
  const terms: string[] = [];

  // Extract proper nouns and section references
  // Look for capitalized words that aren't common English words
  const commonWords = new Set([
    'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'and', 'or', 'but',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
    'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'must',
    'this', 'that', 'these', 'those', 'it', 'its', 'not', 'no', 'yes', 'from', 'by',
    'as', 'so', 'if', 'then', 'than', 'too', 'very', 'just', 'also', 'same', 'other',
    'same-cluster', 'supporting', 'article', 'pillar', 'related', 'reading', 'existing',
    'link', 'linked', 'already', 'relevant', 'section', 'mention', 'mentioned', 'where',
    'editorially', 'perfect', 'natural', 'companion', 'directly', 'readers', 'reader',
    'cross-cluster', 'content', 'tof', 'mof', 'bof', 'pre-funnel',
  ]);

  // Extract words in parentheses — these are often specific context clues
  const parenMatch = reason.match(/\(([^)]+)\)/g);
  if (parenMatch) {
    parenMatch.forEach((p) => {
      const inner = p.replace(/[()]/g, '').trim();
      // Split by common delimiters and take meaningful parts
      inner.split(/\s*[-–,]\s*/).forEach((part) => {
        const cleaned = part.replace(/\b(section|mention|mentioned|where|directly)\b/gi, '').trim();
        if (cleaned.length > 3) terms.push(cleaned);
      });
    });
  }

  // Extract capitalized proper nouns from the reason
  const words = reason.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!.replace(/[^a-zA-ZÀ-ÿ]/g, '');
    if (
      word.length > 3 &&
      word[0] === word[0]!.toUpperCase() &&
      !commonWords.has(word.toLowerCase())
    ) {
      terms.push(word);
      // Also try two-word proper nouns
      if (i + 1 < words.length) {
        const next = words[i + 1]!.replace(/[^a-zA-ZÀ-ÿ]/g, '');
        if (next.length > 2 && next[0] === next[0]!.toUpperCase() && !commonWords.has(next.toLowerCase())) {
          terms.push(`${word} ${next}`);
        }
      }
    }
  }

  // Extract "X section" patterns
  const sectionMatch = reason.match(/(\w+(?:\s+\w+)?)\s+section/gi);
  if (sectionMatch) {
    sectionMatch.forEach((s) => {
      const cleaned = s.replace(/\s*section\s*/i, '').trim();
      if (cleaned.length > 3) terms.push(cleaned);
    });
  }

  // Deduplicate and prioritize longer terms
  const unique = [...new Set(terms)].sort((a, b) => b.length - a.length);
  return unique;
}

// ── Carousel apply ─────────────────────────────────────────────────

export interface CarouselBlockMatch {
  startIndex: number;
  endIndex: number;
  markup: string;
}

/**
 * Locate the global_carousel_people_list shortcode block, regardless of id
 * attribute or whitespace around it. Returns null when no such block exists.
 *
 * Uses the existing block parser so we honour the same boundaries as every
 * other tool: the wp:shortcode opening comment through its matching closer.
 */
export function findCarouselBlock(content: string): CarouselBlockMatch | null {
  // Step 1: any wp block whose innerContent contains the shortcode. This
  // catches wp:shortcode (most common), wp:html, wp:paragraph wrappers, and
  // anything else upstream may have wrapped it in.
  const blocks = parseBlocks(content);
  for (const block of blocks) {
    if (!/\[\s*global_carousel_people_list\b/i.test(block.fullMarkup)) continue;
    return {
      startIndex: block.startIndex,
      endIndex: block.endIndex,
      markup: block.fullMarkup,
    };
  }

  // Step 2: fallback — the shortcode sits in raw text outside any wp block
  // comment. Match the bare shortcode call and treat it as the entire move
  // unit, plus any wp:shortcode comment markers that wrap it.
  const bareMatch = content.match(/\[\s*global_carousel_people_list[^\]]*\]/i);
  if (!bareMatch || bareMatch.index === undefined) return null;

  let startIndex = bareMatch.index;
  let endIndex = startIndex + bareMatch[0].length;

  // Extend backwards over any preceding wp:shortcode opening comment.
  const beforeSlice = content.slice(0, startIndex);
  const openMatch = beforeSlice.match(/<!--\s*wp:shortcode\s*-->\s*$/i);
  if (openMatch) {
    startIndex = openMatch.index!;
  }

  // Extend forwards over any following wp:shortcode closing comment.
  const afterSlice = content.slice(endIndex);
  const closeMatch = afterSlice.match(/^\s*<!--\s*\/wp:shortcode\s*-->/i);
  if (closeMatch) {
    endIndex = endIndex + closeMatch[0].length;
  }

  return {
    startIndex,
    endIndex,
    markup: content.slice(startIndex, endIndex),
  };
}

/**
 * Remove the carousel block plus a single trailing or leading blank line so
 * we don't leave a double newline gap. Idempotent: a second call returns the
 * same content unchanged with success=false.
 */
export function removeCarouselBlock(content: string): ApplyResult {
  const match = findCarouselBlock(content);
  if (!match) {
    return {
      success: false,
      modifiedContent: content,
      explanation: 'No carousel block found in this article.',
    };
  }

  // Trim one trailing newline run after the block, so we don't double-space.
  let endIndex = match.endIndex;
  while (endIndex < content.length && (content[endIndex] === '\n' || content[endIndex] === '\r')) {
    endIndex += 1;
    // Stop after consuming up to one blank line (two newlines).
    if (endIndex - match.endIndex >= 2) break;
  }

  const modifiedContent = content.slice(0, match.startIndex) + content.slice(endIndex);
  return {
    success: true,
    modifiedContent,
    explanation: 'Removed carousel block.',
  };
}

/**
 * Suggest 2-4 placement candidates for repositioning the carousel near the
 * end of the article. Reuses the standard PlacementOption shape so the same
 * PlacementPicker UI handles the choice.
 *
 * Candidates (in priority order):
 *   1. Above Related Reading section, when one exists. This is the right call
 *      ~95% of the time so it leads when present.
 *   2. End of content (true bottom)
 *   3. Before the last heading
 *   4. After the second-to-last heading
 */
export function findCarouselPlacements(content: string, limit = 4): PlacementOption[] {
  const blocks = parseBlocks(content);
  const headings = blocks.filter(
    (b) => b.type === 'heading' || b.type === 'core/heading',
  );

  const options: PlacementOption[] = [];

  // 1. Above Related Reading section if it exists (preferred placement)
  const relatedReading = blocks.find((b) => {
    const label = labelTextFor(b);
    return label !== null && isRelatedReadingLabelText(label);
  });
  if (relatedReading) {
    const labelText = labelTextFor(relatedReading) ?? 'Related Reading';
    options.push({
      snippet: labelText,
      position: 'before',
      label: `Above "${truncate(labelText, 60)}" section (recommended)`,
      score: 1,
      insertAt: relatedReading.startIndex,
    });
  }

  // 2. True end of article
  options.push({
    snippet: 'End of article',
    position: 'after',
    label: relatedReading
      ? 'At the very end of the article'
      : 'At the end of the article (recommended for MOVE_TO_BOTTOM)',
    score: relatedReading ? 0.7 : 1,
    insertAt: content.length,
  });

  // 3. Before the last heading (so carousel sits above e.g. "Conclusion")
  // Skip when this would duplicate the Related Reading option.
  if (headings.length >= 1) {
    const last = headings[headings.length - 1]!;
    if (!relatedReading || last.startIndex !== relatedReading.startIndex) {
      const headingText = headingPlainText(last.fullMarkup);
      options.push({
        snippet: headingText,
        position: 'before',
        label: `Before final heading: "${truncate(headingText, 80)}"`,
        score: 0.85,
        insertAt: last.startIndex,
      });
    }
  }

  // 4. After the second-to-last heading (penultimate section)
  if (headings.length >= 2) {
    const penult = headings[headings.length - 2]!;
    const headingText = headingPlainText(penult.fullMarkup);
    options.push({
      snippet: headingText,
      position: 'after',
      label: `Below penultimate heading: "${truncate(headingText, 80)}"`,
      score: 0.6,
      insertAt: penult.endIndex,
    });
  }

  return options.slice(0, limit);
}

export interface MoveCarouselOptions {
  /** Optional bold subheading inserted as a paragraph block right above the carousel. */
  subheading?: string;
}

/**
 * Move the existing carousel block to the chosen placement (or the bottom if
 * no placement is given). Removes the original location first, then inserts
 * the same markup at the destination.
 *
 * If `options.subheading` is a non-empty trimmed string, prepend a paragraph
 * block (`<p><strong>...</strong></p>`) right before the carousel for flow.
 *
 * If the destination offset sits inside the original block range, fall back
 * to inserting at the end of content so we never produce nested or duplicate
 * shortcodes.
 */
export function moveCarouselToBottom(
  content: string,
  placement?: PlacementOption,
  options?: MoveCarouselOptions,
): ApplyResult {
  const match = findCarouselBlock(content);
  if (!match) {
    return {
      success: false,
      modifiedContent: content,
      explanation: 'No carousel block found to move.',
    };
  }

  const removeResult = removeCarouselBlock(content);
  if (!removeResult.success) return removeResult;

  const removedShift = content.length - removeResult.modifiedContent.length;

  // Translate the placement's insertAt to the post-removal coordinate space.
  let insertAt: number;
  if (placement) {
    if (placement.insertAt <= match.startIndex) {
      insertAt = placement.insertAt;
    } else if (placement.insertAt >= match.endIndex) {
      insertAt = placement.insertAt - removedShift;
    } else {
      // Inside the original block — fall back to end of content
      insertAt = removeResult.modifiedContent.length;
    }
  } else {
    insertAt = removeResult.modifiedContent.length;
  }

  insertAt = Math.max(0, Math.min(insertAt, removeResult.modifiedContent.length));

  const carouselMarkup = match.markup.replace(/^\s+|\s+$/g, '');
  const subheadingMarkup = buildSubheadingBlock(options?.subheading);
  const blockToInsert = subheadingMarkup
    ? `\n\n${subheadingMarkup}\n\n${carouselMarkup}\n\n`
    : `\n\n${carouselMarkup}\n\n`;

  const modifiedContent =
    removeResult.modifiedContent.slice(0, insertAt) +
    blockToInsert +
    removeResult.modifiedContent.slice(insertAt);

  return {
    success: true,
    modifiedContent,
    explanation: placement
      ? `Moved carousel to: ${placement.label}${subheadingMarkup ? ' (with subheading)' : ''}`
      : `Moved carousel to the end of the article${subheadingMarkup ? ' (with subheading)' : ''}.`,
  };
}

/**
 * Build a `<!-- wp:paragraph --><p><strong>...</strong></p><!-- /wp:paragraph -->`
 * block from the user-supplied label. Returns null when the label is blank or
 * whitespace-only. HTML-escapes the text so user-supplied special characters
 * don't break the block markup.
 */
function buildSubheadingBlock(raw: string | undefined): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  const escaped = trimmed
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<!-- wp:paragraph -->\n<p><strong>${escaped}</strong></p>\n<!-- /wp:paragraph -->`;
}

function headingPlainText(markup: string): string {
  const inner = markup.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
  const raw = inner ? inner[1]! : markup;
  return raw.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
