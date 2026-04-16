const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function getApiKey(): string {
  const key = import.meta.env.VITE_OPENROUTER_API_KEY as string;
  if (!key) throw new Error('Missing VITE_OPENROUTER_API_KEY in .env');
  return key;
}

export interface AiEditResult {
  modifiedContent: string;
  explanation: string;
}

/**
 * Try to handle the instruction locally (instant, no API call).
 * Falls back to AI only for complex instructions.
 */
export async function requestAiEdit(
  instruction: string,
  fullContent: string,
  postTitle: string,
): Promise<AiEditResult> {
  // Try instant local edit first
  const localResult = tryLocalEdit(instruction, fullContent);
  if (localResult) return localResult;

  // Fall back to AI — always try snippet mode first to avoid sending 70k+ content

  // Strategy 1: Find quoted text in the instruction
  const quoted = extractQuotedText(instruction);
  if (quoted && quoted.length > 15) {
    const idx = fullContent.indexOf(quoted);
    if (idx !== -1) {
      return snippetAiEdit(instruction, fullContent, quoted, idx, postTitle);
    }
    const partial = quoted.substring(0, 40);
    const fuzzyIdx = fullContent.indexOf(partial);
    if (fuzzyIdx !== -1) {
      const block = extractBlockAround(fullContent, fuzzyIdx);
      return snippetAiEdit(instruction, fullContent, block.text, block.start, postTitle);
    }
  }

  // Strategy 2: Find key nouns from the instruction in the content
  const keyWords = instruction
    .replace(/["'\u201c\u201d]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 5 && /^[A-Z]/.test(w));
  for (const word of keyWords) {
    const wordIdx = fullContent.indexOf(word);
    if (wordIdx !== -1) {
      const block = extractBlockAround(fullContent, wordIdx);
      return snippetAiEdit(instruction, fullContent, block.text, block.start, postTitle);
    }
  }

  // Strategy 3: If content is small enough, send full content
  if (fullContent.length < 15000) {
    return fullContentAiEdit(instruction, fullContent, postTitle);
  }

  // Content too large for AI — return error with helpful message
  return {
    modifiedContent: fullContent,
    explanation: 'This article is too large for AI editing. Try using more specific instructions like: Below "Section Name" replace the paragraph "first few words..." with "new text"',
  };
}

// ────────────────────────────────────────────
// LOCAL EDIT ENGINE (instant, no API)
// ────────────────────────────────────────────

interface LinkInstruction {
  anchorText: string;
  url: string;
}

function tryLocalEdit(instruction: string, content: string): AiEditResult | null {
  const lower = instruction.toLowerCase();

  // Pattern: make "X" a link to URL / link "X" to URL / add a link from "X" to URL
  const linkPattern = /(?:make|link|add\s+(?:a\s+)?(?:internal\s+)?link\s+(?:from|on)?)\s+["'\u201c]([^"'\u201d]+)["'\u201d]\s+(?:a\s+link\s+)?(?:to|pointing\s+to|linking\s+to|href)\s+(https?:\/\/[^\s"']+|\/[^\s"']+)/i;
  const linkMatch = instruction.match(linkPattern);

  if (linkMatch) {
    return applyLinkEdit(content, { anchorText: linkMatch[1]!, url: linkMatch[2]! });
  }

  // Pattern: link "X" to URL (simpler)
  const simpleLinkPattern = /["'\u201c]([^"'\u201d]+)["'\u201d]\s+(?:should\s+)?(?:link|point)\s+to\s+(https?:\/\/[^\s"']+|\/[^\s"']+)/i;
  const simpleMatch = instruction.match(simpleLinkPattern);
  if (simpleMatch) {
    return applyLinkEdit(content, { anchorText: simpleMatch[1]!, url: simpleMatch[2]! });
  }

  // Pattern: make "X" an anchor text to URL
  const anchorPattern = /(?:make|use)\s+["'\u201c]([^"'\u201d]+)["'\u201d]\s+(?:as\s+)?(?:an?\s+)?anchor\s+text\s+(?:to|for|linking\s+to)\s+(?:this\s+url\s+)?(https?:\/\/[^\s"']+|\/[^\s"']+)/i;
  const anchorMatch = instruction.match(anchorPattern);
  if (anchorMatch) {
    return applyLinkEdit(content, { anchorText: anchorMatch[1]!, url: anchorMatch[2]! });
  }

  // Pattern: change link /old to /new
  if (lower.includes('change') && lower.includes('link')) {
    const changeLinkPattern = /change\s+(?:the\s+)?link\s+(\/[^\s]+|https?:\/\/[^\s]+)\s+to\s+(\/[^\s]+|https?:\/\/[^\s]+)/i;
    const changeMatch = instruction.match(changeLinkPattern);
    if (changeMatch) {
      return applyHrefChange(content, changeMatch[1]!, changeMatch[2]!);
    }
  }

  // Pattern: remove link from "X" / unlink "X"
  if (lower.includes('remove') || lower.includes('unlink')) {
    const removePattern = /(?:remove\s+(?:the\s+)?link\s+(?:from|around|on)\s+|unlink\s+)["'\u201c]([^"'\u201d]+)["'\u201d]/i;
    const removeMatch = instruction.match(removePattern);
    if (removeMatch) {
      return applyUnlink(content, removeMatch[1]!);
    }
  }

  // Pattern: add text/paragraph above/before/after/below/under "heading" or a section
  if (lower.includes('above') || lower.includes('before') || lower.includes('after') || lower.includes('below') || lower.includes('under')) {
    const result = tryInsertOrReplace(instruction, content);
    if (result) return result;
  }

  // Pattern: replace "old text" with "new text" / replace the paragraph "X"
  if (lower.includes('replace')) {
    const result = tryReplace(instruction, content);
    if (result) return result;
  }

  // Pattern: instruction contains a markdown link [text](url) — extract and add it
  const mdLinkInInstruction = instruction.match(/\[([^\]]+)\]\((https?:\/\/[^)]+|\/[^)]+)\)/);
  if (mdLinkInInstruction) {
    // Check if the anchor text already exists in the content
    const anchor = mdLinkInInstruction[1]!;
    const url = mdLinkInInstruction[2]!;
    // Try to find a quoted sentence to insert
    const quotedSentence = extractQuotedSentence(instruction);
    if (quotedSentence) {
      // Convert markdown links in the sentence to HTML
      const htmlSentence = quotedSentence.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2">$1</a>',
      );
      return tryInsertText(instruction, content, htmlSentence);
    }
    // Otherwise just try to add the link on existing text
    return applyLinkEdit(content, { anchorText: anchor, url });
  }

  return null;
}

/**
 * Try to insert text above/before/after a heading or section marker.
 */
/**
 * Handle insert or replace near a heading/section.
 * Supports: "under/below/after 'Heading' add/replace..."
 */
function tryInsertOrReplace(
  instruction: string,
  content: string,
): AiEditResult | null {
  const lower = instruction.toLowerCase();
  const isReplace = lower.includes('replace');
  const isBefore = lower.includes('above') || lower.includes('before');

  // Find the target heading/section
  const targetMatch = instruction.match(
    /(?:above|before|after|below|under)\s+(?:the\s+)?(?:heading\s+|section\s+|text\s+)?["'\u201c]([^"'\u201d]+)["'\u201d]/i,
  );
  if (!targetMatch) return null;

  const targetText = targetMatch[1]!;

  // Find the heading in the content
  const targetIdx = content.toLowerCase().indexOf(targetText.toLowerCase());
  if (targetIdx === -1) return null;

  // Get the text to insert (from quoted sentence or markdown in instruction)
  let textToInsert = '';
  const quotedSentence = extractQuotedSentence(instruction);
  if (quotedSentence) {
    textToInsert = quotedSentence.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  }
  if (!textToInsert) {
    // Try markdown link in instruction
    const mdMatch = instruction.match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (mdMatch) {
      // There's a markdown link but no full sentence — extract everything around it
      const fullSentence = instruction.match(/"([^"]*\[[^\]]+\]\([^)]+\)[^"]*)"/);
      if (fullSentence) {
        textToInsert = fullSentence[1]!.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
      }
    }
  }
  if (!textToInsert) return null;

  // Find the paragraph block after the heading
  const afterTarget = content.substring(targetIdx);
  const headingEnd = afterTarget.match(/<!-- \/wp:heading -->/);
  if (!headingEnd || headingEnd.index === undefined) return null;

  const afterHeading = content.substring(targetIdx + headingEnd.index + headingEnd[0].length);

  // Find the first paragraph after the heading
  const firstParaMatch = afterHeading.match(/(<!-- wp:paragraph -->\s*<p[^>]*>)([\s\S]*?)(<\/p>\s*<!-- \/wp:paragraph -->)/);

  if (isReplace && firstParaMatch && firstParaMatch.index !== undefined) {
    // Replace the first paragraph's content
    const paraFullStart = targetIdx + headingEnd.index + headingEnd[0].length + firstParaMatch.index;
    const paraFullEnd = paraFullStart + firstParaMatch[0].length;

    const newPara = `<!-- wp:paragraph -->\n<p>${textToInsert}</p>\n<!-- /wp:paragraph -->`;
    const newContent = content.substring(0, paraFullStart) + newPara + content.substring(paraFullEnd);

    return {
      modifiedContent: newContent,
      explanation: `Replaced paragraph below "${targetText}" with new linked content`,
    };
  }

  // Insert mode
  if (isBefore) {
    // Insert before the heading
    const headingStart = content.lastIndexOf('<!-- wp:heading', targetIdx);
    const insertAt = headingStart >= 0 ? headingStart : targetIdx;
    const newBlock = `<!-- wp:paragraph -->\n<p>${textToInsert}</p>\n<!-- /wp:paragraph -->\n\n`;
    const newContent = content.substring(0, insertAt) + newBlock + content.substring(insertAt);

    return {
      modifiedContent: newContent,
      explanation: `Added paragraph above "${targetText}"`,
    };
  } else {
    // Insert after the first paragraph below the heading
    if (firstParaMatch && firstParaMatch.index !== undefined) {
      const insertAt = targetIdx + headingEnd.index + headingEnd[0].length + firstParaMatch.index + firstParaMatch[0].length;
      const newBlock = `\n\n<!-- wp:paragraph -->\n<p>${textToInsert}</p>\n<!-- /wp:paragraph -->`;
      const newContent = content.substring(0, insertAt) + newBlock + content.substring(insertAt);

      return {
        modifiedContent: newContent,
        explanation: `Added paragraph after "${targetText}" section`,
      };
    }
  }

  return null;
}

/**
 * Handle "replace paragraph X with Y" or "replace 'old text' with 'new text'"
 */
function tryReplace(instruction: string, content: string): AiEditResult | null {
  // Pattern: replace "old text" with "new text"
  const replaceMatch = instruction.match(
    /replace\s+(?:the\s+)?(?:paragraph\s+|text\s+|sentence\s+)?["'\u201c]([^"'\u201d]+)["'\u201d]\s+with\s+(?:this\s+)?["'\u201c]([^"'\u201d]+)["'\u201d]/i,
  );

  if (replaceMatch) {
    const oldText = replaceMatch[1]!;
    const newText = replaceMatch[2]!.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // Find the old text in the content
    const idx = content.indexOf(oldText);
    if (idx === -1) {
      // Try case-insensitive
      const lowerIdx = content.toLowerCase().indexOf(oldText.toLowerCase());
      if (lowerIdx === -1) return null;

      const original = content.substring(lowerIdx, lowerIdx + oldText.length);
      const newContent = content.substring(0, lowerIdx) + newText + content.substring(lowerIdx + original.length);
      return {
        modifiedContent: newContent,
        explanation: `Replaced "${oldText.substring(0, 40)}..." with new content`,
      };
    }

    const newContent = content.substring(0, idx) + newText + content.substring(idx + oldText.length);
    return {
      modifiedContent: newContent,
      explanation: `Replaced "${oldText.substring(0, 40)}..." with new content`,
    };
  }

  return null;
}

function tryInsertText(
  instruction: string,
  content: string,
  overrideText?: string,
): AiEditResult | null {
  const lower = instruction.toLowerCase();
  const isBefore = lower.includes('above') || lower.includes('before');

  // Find the target heading/text to insert near
  // Look for "above/before/after X" where X is in quotes or follows the keyword
  const targetMatch = instruction.match(
    /(?:above|before|after)\s+(?:the\s+)?(?:heading\s+|section\s+|text\s+)?["'\u201c]([^"'\u201d]+)["'\u201d]/i,
  );

  if (!targetMatch) return null;
  const targetText = targetMatch[1]!;

  // Find where this heading/text appears in the content
  const targetIdx = content.indexOf(targetText);
  if (targetIdx === -1) {
    // Try case-insensitive
    const lowerContent = content.toLowerCase();
    const lowerTarget = targetText.toLowerCase();
    const ciIdx = lowerContent.indexOf(lowerTarget);
    if (ciIdx === -1) return null;
    return insertNearTarget(content, ciIdx, isBefore, instruction, overrideText);
  }

  return insertNearTarget(content, targetIdx, isBefore, instruction, overrideText);
}

function insertNearTarget(
  content: string,
  targetIdx: number,
  isBefore: boolean,
  instruction: string,
  overrideText?: string,
): AiEditResult | null {
  // Determine what text to insert
  let textToInsert = overrideText || '';

  if (!textToInsert) {
    // Try to extract a quoted sentence from the instruction
    const quoted = extractQuotedSentence(instruction);
    if (quoted) {
      // Convert markdown links to HTML
      textToInsert = quoted.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2">$1</a>',
      );
    }
  }

  if (!textToInsert) return null;

  // Wrap in a paragraph block if not already wrapped
  const wrappedText = textToInsert.startsWith('<!-- wp:')
    ? textToInsert
    : `<!-- wp:paragraph -->\n<p>${textToInsert}</p>\n<!-- /wp:paragraph -->`;

  if (isBefore) {
    // Find the start of the block containing the target
    const beforeTarget = content.substring(0, targetIdx);
    const lastBlockStart = beforeTarget.lastIndexOf('<!-- wp:');
    const insertAt = lastBlockStart >= 0 ? lastBlockStart : targetIdx;

    const newContent =
      content.substring(0, insertAt) +
      wrappedText + '\n\n' +
      content.substring(insertAt);

    return {
      modifiedContent: newContent,
      explanation: `Added paragraph ${isBefore ? 'above' : 'below'} the target section`,
    };
  } else {
    // Insert after: find the end of the block containing the target
    const afterTarget = content.substring(targetIdx);
    const blockEndMatch = afterTarget.match(/<!-- \/wp:\S+ -->/);
    const insertAt = blockEndMatch
      ? targetIdx + blockEndMatch.index! + blockEndMatch[0].length
      : targetIdx + 100;

    const newContent =
      content.substring(0, insertAt) +
      '\n\n' + wrappedText +
      content.substring(insertAt);

    return {
      modifiedContent: newContent,
      explanation: `Added paragraph after the target section`,
    };
  }
}

/**
 * Extract a quoted sentence from the instruction (the text between the outermost quotes
 * that contains a markdown link or is a full sentence).
 */
function extractQuotedSentence(instruction: string): string | null {
  // Match text in double quotes that's longer than 20 chars
  const doubleQuote = instruction.match(/"([^"]{20,})"/);
  if (doubleQuote) return doubleQuote[1]!;

  // Match text in smart quotes
  const smartQuote = instruction.match(/\u201c([^\u201d]{20,})\u201d/);
  if (smartQuote) return smartQuote[1]!;

  // Match after a dash/hyphen followed by a quote
  const dashQuote = instruction.match(/[-–—]\s*["'\u201c]([^"'\u201d]{15,})["'\u201d]/);
  if (dashQuote) return dashQuote[1]!;

  return null;
}

function applyLinkEdit(content: string, link: LinkInstruction): AiEditResult | null {
  const escapedText = link.anchorText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Check if already linked (possibly nested) — find the full linked region
  // Match any <a> wrapping around the anchor text, including nested <a> tags
  const linkedRegex = new RegExp(`(<a\\s[^>]*>)+\\s*${escapedText}\\s*(</a>)+`, 'i');
  const linkedMatch = content.match(linkedRegex);

  if (linkedMatch) {
    // Replace the entire linked region with a clean single link
    const newContent = content.replace(
      linkedRegex,
      `<a href="${link.url}">${link.anchorText}</a>`,
    );
    return {
      modifiedContent: newContent,
      explanation: `Updated the link on "${link.anchorText}" to ${link.url}`,
    };
  }

  // Not linked yet — find the plain text and wrap it
  const idx = content.indexOf(link.anchorText);
  if (idx === -1) {
    // Try case-insensitive
    const lowerContent = content.toLowerCase();
    const lowerAnchor = link.anchorText.toLowerCase();
    const ciIdx = lowerContent.indexOf(lowerAnchor);
    if (ciIdx === -1) return null;

    const originalText = content.substring(ciIdx, ciIdx + link.anchorText.length);
    const newContent =
      content.substring(0, ciIdx) +
      `<a href="${link.url}">${originalText}</a>` +
      content.substring(ciIdx + originalText.length);

    return {
      modifiedContent: newContent,
      explanation: `Added link on "${originalText}" → ${link.url}`,
    };
  }

  const newContent =
    content.substring(0, idx) +
    `<a href="${link.url}">${link.anchorText}</a>` +
    content.substring(idx + link.anchorText.length);

  return {
    modifiedContent: newContent,
    explanation: `Added link on "${link.anchorText}" → ${link.url}`,
  };
}

function applyHrefChange(content: string, oldHref: string, newHref: string): AiEditResult | null {
  const escaped = oldHref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`href="${escaped}"`, 'g');
  if (!regex.test(content)) return null;

  const newContent = content.replace(regex, `href="${newHref}"`);
  const count = (content.match(regex) || []).length;

  return {
    modifiedContent: newContent,
    explanation: `Changed ${count} link(s) from ${oldHref} to ${newHref}`,
  };
}

function applyUnlink(content: string, anchorText: string): AiEditResult | null {
  const escaped = anchorText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Match any number of nested <a> tags wrapping the anchor text
  const regex = new RegExp(`(<a\\s[^>]*>)+\\s*(${escaped})\\s*(</a>)+`, 'gi');
  if (!regex.test(content)) return null;

  // Reset regex lastIndex after test
  regex.lastIndex = 0;
  const newContent = content.replace(regex, '$2');

  return {
    modifiedContent: newContent,
    explanation: `Removed link from "${anchorText}"`,
  };
}

// ────────────────────────────────────────────
// AI EDIT (only for complex instructions)
// ────────────────────────────────────────────

async function snippetAiEdit(
  instruction: string,
  fullContent: string,
  snippet: string,
  snippetIndex: number,
  postTitle: string,
): Promise<AiEditResult> {
  const systemPrompt = `You edit HTML snippets from WordPress posts. Return ONLY JSON: {"modified": "the edited snippet", "explanation": "what you changed"}. Preserve all HTML structure.`;

  const userPrompt = `Post: ${postTitle}\n\nSnippet:\n${snippet}\n\nInstruction: ${instruction}`;

  const raw = await callOpenRouter(systemPrompt, userPrompt);
  const parsed = parseJsonResponse(raw);
  const modifiedSnippet = parsed.modified || parsed.modifiedContent || '';
  if (!modifiedSnippet) throw new Error('AI returned empty content');

  const before = fullContent.substring(0, snippetIndex);
  const after = fullContent.substring(snippetIndex + snippet.length);

  return {
    modifiedContent: before + modifiedSnippet + after,
    explanation: parsed.explanation || 'Changes applied.',
  };
}

async function fullContentAiEdit(
  instruction: string,
  fullContent: string,
  postTitle: string,
): Promise<AiEditResult> {
  const systemPrompt = `You edit WordPress post content. Return ONLY JSON: {"modifiedContent": "full content with changes", "explanation": "what you changed"}. Preserve all <!-- wp: --> block comments.`;

  const userPrompt = `Post: ${postTitle}\n\nContent:\n${fullContent}\n\nInstruction: ${instruction}`;

  const raw = await callOpenRouter(systemPrompt, userPrompt);
  const parsed = parseJsonResponse(raw);
  const content = parsed.modifiedContent || parsed.modified || '';
  if (!content) throw new Error('AI returned empty content');

  return {
    modifiedContent: content,
    explanation: parsed.explanation || 'Changes applied.',
  };
}

async function callOpenRouter(system: string, user: string): Promise<string> {
  const apiKey = getApiKey();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'MAG SEO Editor',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: 8000,
        temperature: 0,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as Record<string, unknown>;
      throw new Error(err.error ? JSON.stringify(err.error) : `OpenRouter error: ${res.status}`);
    }

    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content ?? '';
  } finally {
    clearTimeout(timeout);
  }
}

function parseJsonResponse(raw: string): Record<string, string> {
  let jsonStr = raw;
  const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) jsonStr = codeBlock[1]!;

  try {
    return JSON.parse(jsonStr.trim()) as Record<string, string>;
  } catch {
    throw new Error(`Failed to parse AI response. Raw: ${raw.substring(0, 200)}...`);
  }
}

function extractQuotedText(instruction: string): string | null {
  const m = instruction.match(/["'\u201c]([^"'\u201d]{15,})["'\u201d]/);
  return m ? m[1]! : null;
}

function extractBlockAround(content: string, position: number): { text: string; start: number } {
  const before = content.substring(0, position);
  const startIdx = before.lastIndexOf('<!-- wp:');
  const start = startIdx >= 0 ? startIdx : Math.max(0, position - 200);

  const after = content.substring(position);
  const endMatch = after.match(/[\s\S]*?<!-- \/wp:\S+ -->/);
  const end = endMatch ? position + endMatch[0].length : Math.min(content.length, position + 500);

  return { text: content.substring(start, end), start };
}
