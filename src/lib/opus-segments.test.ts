import { describe, it, expect } from 'vitest';
import { extractReviewSegments, stitchReviewedSegments } from './opus-segments';

function para(text: string): string {
  return `<!-- wp:paragraph -->\n<p>${text}</p>\n<!-- /wp:paragraph -->`;
}

function acfSelfClosing(name: string): string {
  return `<!-- wp:acf/${name} {"name":"acf/${name}","data":{}} /-->`;
}

function heading(text: string): string {
  return `<!-- wp:heading -->\n<h2>${text}</h2>\n<!-- /wp:heading -->`;
}

describe('extractReviewSegments', () => {
  it('returns no segments when there are no locks', () => {
    const content = [para('Intro.'), para('More.')].join('\n\n');
    const segments = extractReviewSegments(content, []);
    expect(segments).toEqual([]);
  });

  it('finds a single target block and expands context by one on each side', () => {
    const content = [
      para('Block A, no link.'),
      para('Block B, contains <a href="/guide">the guide</a> link.'),
      para('Block C, no link.'),
      para('Block D, far away.'),
    ].join('\n\n');

    const segments = extractReviewSegments(content, [
      { anchor: 'the guide', href: '/guide' },
    ]);

    expect(segments).toHaveLength(1);
    expect(segments[0]!.id).toBe('s1');
    expect(segments[0]!.markup).toContain('Block A, no link.');
    expect(segments[0]!.markup).toContain('Block B');
    expect(segments[0]!.markup).toContain('Block C, no link.');
    expect(segments[0]!.markup).not.toContain('Block D, far away.');
    expect(segments[0]!.locks).toEqual([{ anchor: 'the guide', href: '/guide' }]);
  });

  it('merges overlapping context ranges into a single segment', () => {
    const content = [
      para('A.'),
      para('B with <a href="/one">one</a>.'),
      para('C in between.'),
      para('D with <a href="/two">two</a>.'),
      para('E.'),
    ].join('\n\n');

    const segments = extractReviewSegments(content, [
      { anchor: 'one', href: '/one' },
      { anchor: 'two', href: '/two' },
    ]);

    expect(segments).toHaveLength(1);
    expect(segments[0]!.markup).toContain('A.');
    expect(segments[0]!.markup).toContain('E.');
  });

  it('does not expand context across ACF blocks', () => {
    const content = [
      para('A.'),
      acfSelfClosing('custom-image'),
      para('B with <a href="/guide">the guide</a>.'),
      para('C.'),
    ].join('\n\n');

    const segments = extractReviewSegments(content, [
      { anchor: 'the guide', href: '/guide' },
    ]);

    expect(segments).toHaveLength(1);
    // ACF block must not appear in the segment — it's the "wall"
    expect(segments[0]!.markup).not.toContain('wp:acf/');
    expect(segments[0]!.markup).toContain('B with');
    expect(segments[0]!.markup).toContain('C.');
    expect(segments[0]!.markup).not.toContain('A.');
  });

  it('skips targets inside ACF blocks even if the anchor string appears there', () => {
    // Pretend the locked anchor happens to exist inside an ACF JSON blob.
    const content = [
      para('Real paragraph with <a href="/x">the guide</a>.'),
      `<!-- wp:acf/custom-list {"name":"acf/custom-list","data":{"label":"the guide"}} /-->`,
    ].join('\n\n');

    const segments = extractReviewSegments(content, [
      { anchor: 'the guide', href: '/x' },
    ]);

    expect(segments).toHaveLength(1);
    expect(segments[0]!.markup).toContain('Real paragraph');
    expect(segments[0]!.markup).not.toContain('wp:acf/');
  });

  it('produces multiple segments when targets are far apart', () => {
    const content = [
      para('A.'),
      para('B with <a href="/one">one</a>.'),
      para('C.'),
      heading('Gap section'),
      para('D.'),
      para('E.'),
      para('F with <a href="/two">two</a>.'),
      para('G.'),
    ].join('\n\n');

    const segments = extractReviewSegments(content, [
      { anchor: 'one', href: '/one' },
      { anchor: 'two', href: '/two' },
    ]);

    expect(segments).toHaveLength(2);
    expect(segments[0]!.markup).toContain('one');
    expect(segments[1]!.markup).toContain('two');
    expect(segments[0]!.markup).not.toContain('two');
    expect(segments[1]!.markup).not.toContain('one');
  });
});

describe('stitchReviewedSegments', () => {
  it('replaces the original byte range with the reviewed markup', () => {
    const content = [para('A.'), para('B with <a href="/x">anchor</a>.'), para('C.')].join('\n\n');
    const segments = extractReviewSegments(content, [{ anchor: 'anchor', href: '/x' }]);
    expect(segments).toHaveLength(1);

    const reviewed = para('NEW merged block with <a href="/x">anchor</a>.');
    const result = stitchReviewedSegments(content, segments, { [segments[0]!.id]: reviewed });

    expect(result).toContain('NEW merged block with <a href="/x">anchor</a>.');
    expect(result).not.toContain('A.\n'); // wait, context expansion swallowed A too
  });

  it('leaves unreviewed segments alone', () => {
    const content = [para('A.'), para('B with <a href="/x">anchor</a>.'), para('C.')].join('\n\n');
    const segments = extractReviewSegments(content, [{ anchor: 'anchor', href: '/x' }]);

    const result = stitchReviewedSegments(content, segments, {});

    expect(result).toBe(content);
  });

  it('stitches multiple segments without shifting byte offsets', () => {
    const content = [
      para('A.'),
      para('B with <a href="/one">one</a>.'),
      para('C.'),
      heading('Gap'),
      para('D.'),
      para('E with <a href="/two">two</a>.'),
      para('F.'),
    ].join('\n\n');

    const segments = extractReviewSegments(content, [
      { anchor: 'one', href: '/one' },
      { anchor: 'two', href: '/two' },
    ]);

    const result = stitchReviewedSegments(content, segments, {
      [segments[0]!.id]: para('S1 replaced with <a href="/one">one</a>.'),
      [segments[1]!.id]: para('S2 replaced with <a href="/two">two</a>.'),
    });

    expect(result).toContain('S1 replaced');
    expect(result).toContain('S2 replaced');
    expect(result).toContain('<!-- wp:heading -->');
  });
});
