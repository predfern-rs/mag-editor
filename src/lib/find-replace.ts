export interface Match {
  index: number;
  text: string;
  context: {
    before: string;
    after: string;
  };
  blockType: string;
}

export interface LinkMatch {
  index: number;
  fullTag: string; // e.g. <a href="/old">anchor text</a>
  href: string;
  anchorText: string;
  context: {
    before: string;
    after: string;
  };
  blockType: string;
}

/**
 * Find all text matches in content (searches raw block markup,
 * but skips inside <!-- wp:... --> block comment delimiters).
 */
export function findMatches(content: string, searchText: string): Match[] {
  if (!searchText) return [];

  // Identify block comment regions to skip
  const skipRegions: Array<{ start: number; end: number }> = [];
  const commentRegex = /<!--[\s\S]*?-->/g;
  let commentMatch: RegExpExecArray | null;
  while ((commentMatch = commentRegex.exec(content)) !== null) {
    skipRegions.push({
      start: commentMatch.index,
      end: commentMatch.index + commentMatch[0].length,
    });
  }

  const matches: Match[] = [];
  const escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'gi');
  let result: RegExpExecArray | null;

  while ((result = regex.exec(content)) !== null) {
    const idx = result.index;
    // Skip if inside a block comment
    const inComment = skipRegions.some((r) => idx >= r.start && idx < r.end);
    if (inComment) continue;

    const ctxStart = Math.max(0, idx - 60);
    const ctxEnd = Math.min(content.length, idx + result[0].length + 60);

    matches.push({
      index: idx,
      text: result[0],
      context: {
        before: content.slice(ctxStart, idx),
        after: content.slice(idx + result[0].length, ctxEnd),
      },
      blockType: detectBlockType(content, idx),
    });
  }

  return matches;
}

/**
 * Find all <a> links in content. Searches for anchor tags and extracts href + text.
 * Can filter by href substring, anchor text, or both.
 */
export function findLinks(
  content: string,
  filter?: { href?: string; anchorText?: string },
): LinkMatch[] {
  const linkRegex = /<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const matches: LinkMatch[] = [];
  let result: RegExpExecArray | null;

  while ((result = linkRegex.exec(content)) !== null) {
    const href = result[1] ?? '';
    const anchorText = result[2] ?? '';
    const fullTag = result[0];
    const idx = result.index;

    // Apply filters if provided
    if (filter?.href && !href.toLowerCase().includes(filter.href.toLowerCase())) continue;
    if (filter?.anchorText && !anchorText.toLowerCase().includes(filter.anchorText.toLowerCase())) continue;

    const ctxStart = Math.max(0, idx - 40);
    const ctxEnd = Math.min(content.length, idx + fullTag.length + 40);

    matches.push({
      index: idx,
      fullTag,
      href,
      anchorText,
      context: {
        before: content.slice(ctxStart, idx),
        after: content.slice(idx + fullTag.length, ctxEnd),
      },
      blockType: detectBlockType(content, idx),
    });
  }

  return matches;
}

/**
 * Replace a single match in content by index.
 */
export function replaceSingle(
  content: string,
  match: Match | LinkMatch,
  replacement: string,
): string {
  const originalLength = 'fullTag' in match ? match.fullTag.length : match.text.length;
  return (
    content.slice(0, match.index) +
    replacement +
    content.slice(match.index + originalLength)
  );
}

/**
 * Replace all occurrences of searchText with replacement.
 */
export function replaceAll(
  content: string,
  searchText: string,
  replacement: string,
): string {
  if (!searchText) return content;
  const escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return content.replace(new RegExp(escaped, 'gi'), replacement);
}

/**
 * Build an <a> tag string.
 */
export function buildLink(href: string, anchorText: string): string {
  return `<a href="${href}">${anchorText}</a>`;
}

/**
 * Wrap matched text in a link: finds the text, wraps it in <a href="...">text</a>.
 */
export function wrapTextInLink(
  content: string,
  match: Match,
  href: string,
): string {
  const linked = `<a href="${href}">${match.text}</a>`;
  return replaceSingle(content, match, linked);
}

/**
 * Update the href of an existing link match.
 */
export function updateLinkHref(
  content: string,
  linkMatch: LinkMatch,
  newHref: string,
): string {
  const newTag = linkMatch.fullTag.replace(
    /href="[^"]*"/,
    `href="${newHref}"`,
  );
  return replaceSingle(content, linkMatch, newTag);
}

/**
 * Update the anchor text of an existing link match.
 */
export function updateLinkAnchorText(
  content: string,
  linkMatch: LinkMatch,
  newAnchorText: string,
): string {
  // Rebuild tag preserving other attributes
  const tagWithNewText = linkMatch.fullTag.replace(
    />[\s\S]*?<\/a>/,
    `>${newAnchorText}</a>`,
  );
  return replaceSingle(content, linkMatch, tagWithNewText);
}

/**
 * Remove a link but keep the anchor text (unlink).
 */
export function removeLink(
  content: string,
  linkMatch: LinkMatch,
): string {
  return replaceSingle(content, linkMatch, linkMatch.anchorText);
}

function detectBlockType(content: string, index: number): string {
  const before = content.slice(Math.max(0, index - 500), index);
  const blockComment = before.match(/<!-- wp:(\S+)/g);
  if (blockComment && blockComment.length > 0) {
    const last = blockComment[blockComment.length - 1];
    return last!.replace('<!-- wp:', '');
  }
  return 'unknown';
}
