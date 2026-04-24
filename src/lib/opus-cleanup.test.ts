import { describe, it, expect } from 'vitest';
import { findCleanupTargets, isTruncated, isOrphanLinkBlock } from './opus-cleanup';

function para(text: string): string {
  return `<!-- wp:paragraph -->\n<p>${text}</p>\n<!-- /wp:paragraph -->`;
}

describe('isTruncated', () => {
  it.each([
    ['Pssst: Don\u2019t forget to check out the new collection and find a', true],
    ['The best options include', true],
    ['We recommend the', true],
    ['This paragraph ends normally.', false],
    ['A complete sentence!', false],
    ['A question?', false],
    ['Heading', false], // short enough to not fire punctuation rule
  ])('%s → %s', (input, expected) => {
    expect(isTruncated(input)).toBe(expected);
  });
});

describe('isOrphanLinkBlock', () => {
  it('flags a paragraph with only an anchor', () => {
    const html = '<a href="/x">Read more</a>';
    expect(isOrphanLinkBlock(html, 'Read more')).toBe(true);
  });

  it('does not flag a paragraph with prose around the anchor', () => {
    const html = 'Our <a href="/x">new jackets guide</a> covers everything you need to know about winter kit.';
    const plain = 'Our new jackets guide covers everything you need to know about winter kit.';
    expect(isOrphanLinkBlock(html, plain)).toBe(false);
  });

  it('does not flag paragraphs with multiple links', () => {
    const html = '<a href="/a">A</a> and <a href="/b">B</a>';
    expect(isOrphanLinkBlock(html, 'A and B')).toBe(false);
  });
});

describe('findCleanupTargets', () => {
  it('flags a paragraph ending in "find a"', () => {
    const content = [
      para('Normal paragraph here.'),
      para('Pssst: Don\u2019t forget to check out the new collection and find a&nbsp;'),
      para('Another normal paragraph.'),
    ].join('\n\n');

    const targets = findCleanupTargets(content);
    expect(targets).toEqual([1]);
  });

  it('flags orphan link paragraphs', () => {
    const content = [
      para('Intro prose.'),
      para('<a href="/guide">Best indoor skiing &amp; dry slopes in the UK</a>'),
      para('Outro prose.'),
    ].join('\n\n');

    const targets = findCleanupTargets(content);
    expect(targets).toEqual([1]);
  });

  it('ignores ACF blocks and healthy paragraphs', () => {
    const content = [
      para('Full sentence number one.'),
      `<!-- wp:acf/custom-image {"data":{}} /-->`,
      para('Another healthy paragraph.'),
    ].join('\n\n');

    const targets = findCleanupTargets(content);
    expect(targets).toEqual([]);
  });

  it('flags multiple issues in one article', () => {
    const content = [
      para('Fine paragraph.'),
      para('Ends in the'),
      para('Also fine.'),
      para('<a href="/x">orphan link</a>'),
      para('Yet another fine one.'),
    ].join('\n\n');

    const targets = findCleanupTargets(content);
    expect(targets).toEqual([1, 3]);
  });
});
