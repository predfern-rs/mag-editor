import { describe, it, expect } from 'vitest';
import { tryMergeAtParagraphEnd } from './smart-apply';

function buildParaBlock(innerHtml: string): string {
  return `<!-- wp:paragraph -->\n<p>${innerHtml}</p>\n<!-- /wp:paragraph -->`;
}

describe('tryMergeAtParagraphEnd', () => {
  it('merges a sentence into a paragraph that ends in a full stop', () => {
    const block = buildParaBlock('Ski culture in the Alps runs deep.');
    const content = `prefix\n\n${block}\n\nsuffix`;
    const paraStart = content.indexOf('<!-- wp:paragraph -->');
    const paraEnd = content.indexOf('<!-- /wp:paragraph -->') + '<!-- /wp:paragraph -->'.length;

    const result = tryMergeAtParagraphEnd(
      content,
      paraStart,
      paraEnd,
      'For kit, see <a href="/jackets">our jackets guide</a>.',
    );

    expect(result).not.toBeNull();
    expect(result).toContain(
      'Ski culture in the Alps runs deep. For kit, see <a href="/jackets">our jackets guide</a>.',
    );
    expect(result).toContain('<!-- wp:paragraph -->');
    expect(result).toContain('<!-- /wp:paragraph -->');
  });

  it('returns null when the paragraph ends in a colon', () => {
    const block = buildParaBlock('Here are the essentials:');
    const content = `${block}`;
    const paraEnd = content.indexOf('<!-- /wp:paragraph -->') + '<!-- /wp:paragraph -->'.length;

    const result = tryMergeAtParagraphEnd(
      content,
      0,
      paraEnd,
      'A good base layer matters.',
    );

    expect(result).toBeNull();
  });

  it('returns null when the paragraph ends in a comma', () => {
    const block = buildParaBlock('Among the best options,');
    const content = `${block}`;
    const paraEnd = content.indexOf('<!-- /wp:paragraph -->') + '<!-- /wp:paragraph -->'.length;

    const result = tryMergeAtParagraphEnd(
      content,
      0,
      paraEnd,
      'are the touring skis.',
    );

    expect(result).toBeNull();
  });

  it('returns null when combined paragraph would exceed the length cap', () => {
    const longText = 'Sentence. '.repeat(60);
    const block = buildParaBlock(longText.trim());
    const content = `${block}`;
    const paraEnd = content.indexOf('<!-- /wp:paragraph -->') + '<!-- /wp:paragraph -->'.length;

    const result = tryMergeAtParagraphEnd(
      content,
      0,
      paraEnd,
      'One more added sentence for good measure.',
    );

    expect(result).toBeNull();
  });

  it('merges when paragraph ends with punctuation even inside an anchor tag', () => {
    const block = buildParaBlock(
      'Read more on <a href="/apres">our aprés guide</a>.',
    );
    const content = block;
    const paraEnd = content.indexOf('<!-- /wp:paragraph -->') + '<!-- /wp:paragraph -->'.length;

    const result = tryMergeAtParagraphEnd(
      content,
      0,
      paraEnd,
      'Pair it with the right boots.',
    );

    expect(result).not.toBeNull();
    expect(result).toContain(
      'Read more on <a href="/apres">our aprés guide</a>. Pair it with the right boots.',
    );
  });

  it('does not corrupt surrounding content', () => {
    const block = buildParaBlock('First paragraph.');
    const before = '<!-- wp:heading --><h2>Section</h2><!-- /wp:heading -->\n\n';
    const after = '\n\n<!-- wp:paragraph --><p>Another paragraph.</p><!-- /wp:paragraph -->';
    const content = before + block + after;
    const paraStart = content.indexOf('<!-- wp:paragraph -->');
    const paraEnd = content.indexOf('<!-- /wp:paragraph -->') + '<!-- /wp:paragraph -->'.length;

    const result = tryMergeAtParagraphEnd(
      content,
      paraStart,
      paraEnd,
      'Second sentence added.',
    );

    expect(result).not.toBeNull();
    expect(result!.startsWith(before)).toBe(true);
    expect(result!.endsWith(after)).toBe(true);
    expect(result).toContain('First paragraph. Second sentence added.');
  });
});
