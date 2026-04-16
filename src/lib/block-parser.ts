export interface ParsedBlock {
  type: string;
  isAcf: boolean;
  startIndex: number;
  endIndex: number;
  fullMarkup: string;
  innerContent: string;
  data: Record<string, unknown> | null;
  blockId: string;
  label: string;
  fields: Record<string, string>;
}

// Keep old export name for compatibility
export type Block = ParsedBlock;

/**
 * Parse raw Gutenberg content into an array of blocks.
 */
export function parseBlocks(rawContent: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const openingRegex = /<!--\s*wp:(\S+?)(\s+(\{[\s\S]*?\}))?\s*(\/)?-->/g;
  let match: RegExpExecArray | null;

  while ((match = openingRegex.exec(rawContent)) !== null) {
    const type = match[1]!;
    const jsonStr = match[3];
    const isSelfClosing = match[4] === '/';
    const startIndex = match.index;
    const isAcf = type.startsWith('acf/');

    let data: Record<string, unknown> | null = null;
    let blockId = `block-${match.index}`;
    const fields: Record<string, string> = {};

    if (jsonStr) {
      try {
        data = JSON.parse(jsonStr) as Record<string, unknown>;
        if (data && 'id' in data) blockId = String(data.id);
        if (isAcf && data?.data && typeof data.data === 'object') {
          for (const [key, val] of Object.entries(data.data as Record<string, unknown>)) {
            if (!key.startsWith('_')) {
              // Preserve objects (like link fields) as JSON strings
              if (val !== null && typeof val === 'object') {
                fields[key] = JSON.stringify(val);
              } else {
                fields[key] = String(val ?? '');
              }
            }
          }
        }
      } catch { /* skip */ }
    }

    let endIndex: number;
    let fullMarkup: string;
    let innerContent = '';

    if (isSelfClosing) {
      endIndex = startIndex + match[0].length;
      fullMarkup = match[0];
    } else {
      const closingRegex = new RegExp(
        `<!--\\s*/wp:${type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*-->`,
      );
      const remaining = rawContent.slice(startIndex + match[0].length);
      const closingMatch = closingRegex.exec(remaining);

      if (closingMatch) {
        endIndex = startIndex + match[0].length + closingMatch.index + closingMatch[0].length;
        innerContent = remaining.slice(0, closingMatch.index).trim();
      } else {
        endIndex = startIndex + match[0].length;
      }
      fullMarkup = rawContent.slice(startIndex, endIndex);
    }

    blocks.push({
      type,
      isAcf,
      startIndex,
      endIndex,
      fullMarkup,
      innerContent,
      data,
      blockId,
      label: getBlockLabel(type, fields, innerContent),
      fields,
    });
  }

  return blocks;
}

export function removeBlock(rawContent: string, block: ParsedBlock): string {
  // Also remove surrounding whitespace/newlines
  let start = block.startIndex;
  let end = block.endIndex;
  while (start > 0 && rawContent[start - 1] === '\n') start--;
  while (end < rawContent.length && rawContent[end] === '\n') end++;
  return rawContent.substring(0, start) + rawContent.substring(end);
}

export function insertBlockAfter(
  rawContent: string,
  afterBlock: ParsedBlock,
  newBlockMarkup: string,
): string {
  return (
    rawContent.substring(0, afterBlock.endIndex) +
    '\n\n' + newBlockMarkup + '\n\n' +
    rawContent.substring(afterBlock.endIndex)
  );
}

export function insertBlockAtStart(rawContent: string, newBlockMarkup: string): string {
  return newBlockMarkup + '\n\n' + rawContent;
}

export function replaceBlock(rawContent: string, block: ParsedBlock, newMarkup: string): string {
  return rawContent.substring(0, block.startIndex) + newMarkup + rawContent.substring(block.endIndex);
}

export function buildAcfBlockMarkup(blockType: string, fields: Record<string, unknown>): string {
  const id = 'block_' + Math.random().toString(36).substring(2, 14);
  const internalData: Record<string, unknown> = {};
  for (const key of Object.keys(fields)) {
    internalData[key] = fields[key];
  }
  const blockData = { name: `acf/${blockType}`, data: internalData, mode: 'preview', id };
  return `<!-- wp:acf/${blockType} ${JSON.stringify(blockData)} /-->`;
}

export function updateAcfBlockFields(block: ParsedBlock, updatedFields: Record<string, string>): string {
  if (!block.data) return block.fullMarkup;
  const newData = { ...block.data };
  if (newData.data && typeof newData.data === 'object') {
    const acfData = { ...(newData.data as Record<string, unknown>) };
    for (const [key, val] of Object.entries(updatedFields)) {
      acfData[key] = val;
    }
    newData.data = acfData;
  }
  return `<!-- wp:${block.type} ${JSON.stringify(newData)} /-->`;
}

function getBlockLabel(type: string, fields: Record<string, string>, innerContent: string): string {
  if (type === 'paragraph' || type === 'core/paragraph') {
    const text = innerContent.replace(/<[^>]+>/g, '').trim();
    return text.length > 60 ? text.substring(0, 60) + '...' : text || 'Empty paragraph';
  }
  if (type === 'heading' || type === 'core/heading') {
    const text = innerContent.replace(/<[^>]+>/g, '').trim();
    return text || 'Heading';
  }
  if (type.startsWith('acf/')) {
    for (const key of Object.keys(fields)) {
      if ((key.includes('title') || key.includes('heading') || key.includes('name')) && fields[key]) {
        const val = fields[key]!;
        return val.length > 50 ? val.substring(0, 50) + '...' : val;
      }
    }
  }
  const cleanType = type.replace('acf/', '').replace(/-/g, ' ');
  return cleanType.replace(/\b\w/g, (c) => c.toUpperCase());
}
