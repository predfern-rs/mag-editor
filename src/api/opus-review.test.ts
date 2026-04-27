import { describe, it, expect } from 'vitest';
import { extractBoldLabelParagraphs, extractHeadingBlocks, validateLocks } from './opus-review';

describe('extractHeadingBlocks', () => {
  it('extracts each heading block', () => {
    const content = `
<!-- wp:heading -->
<h2 class="wp-block-heading">Section One</h2>
<!-- /wp:heading -->

<!-- wp:paragraph --><p>Body.</p><!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Related Articles</h3>
<!-- /wp:heading -->
`.trim();

    const headings = extractHeadingBlocks(content);
    expect(headings).toHaveLength(2);
    expect(headings[0]).toContain('Section One');
    expect(headings[1]).toContain('Related Articles');
  });
});

describe('validateLocks', () => {
  it('reports a heading drop as a heading failure (not a link failure)', () => {
    const original = `
<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Related Articles</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul><!-- wp:list-item --><li><a href="/x">Indoor skiing guide</a></li><!-- /wp:list-item --></ul>
<!-- /wp:list -->
`.trim();

    const reviewed = `
<!-- wp:list -->
<ul><!-- wp:list-item --><li><a href="/x">Indoor skiing guide</a></li><!-- /wp:list-item --></ul>
<!-- /wp:list -->
`.trim();

    const failures = validateLocks(original, reviewed, [
      { anchor: 'Indoor skiing guide', href: '/x' },
    ]);

    expect(failures).toHaveLength(1);
    expect(failures[0]!.type).toBe('heading');
    expect(failures[0]!.value).toBe('Related Articles');
  });

  it('passes cleanly when headings and locks are preserved', () => {
    const original = `
<!-- wp:heading -->
<h2 class="wp-block-heading">Intro</h2>
<!-- /wp:heading -->

<!-- wp:paragraph --><p>With <a href="/x">a link</a>.</p><!-- /wp:paragraph -->
`.trim();

    const failures = validateLocks(original, original, [
      { anchor: 'a link', href: '/x' },
    ]);
    expect(failures).toEqual([]);
  });

  it('reports a heading text change as a failure', () => {
    const original = `<!-- wp:heading -->\n<h2 class="wp-block-heading">Related Articles</h2>\n<!-- /wp:heading -->`;
    const reviewed = `<!-- wp:heading -->\n<h2 class="wp-block-heading">Related</h2>\n<!-- /wp:heading -->`;
    const failures = validateLocks(original, reviewed, []);
    // Reported twice on purpose: the old heading is missing (heading drop)
    // AND the edited heading is a block that didn't exist in the original
    // (new-block). Both signals are accurate and the UI treats them the same.
    expect(failures.map((f) => f.type).sort()).toEqual(['heading', 'new-block']);
  });

  it('allows dropping a Related Reading heading when its collapsed list is also dropped', () => {
    const original = `
<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Related Reading</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul><!-- wp:list-item --><li><a href="/x">Only one item left</a></li><!-- /wp:list-item --></ul>
<!-- /wp:list -->
`.trim();

    const reviewed = `<!-- wp:paragraph --><p>Some body copy above the old section.</p><!-- /wp:paragraph -->`;

    const failures = validateLocks(original, reviewed, []);
    // heading + list both dropped together → no heading failure. The remaining
    // anchor/href failures come from the locked link (if any) — we passed [],
    // so failures should be empty.
    expect(failures).toEqual([]);
  });

  it('still fails when a Related Reading heading is dropped but its list stays', () => {
    const original = `
<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Related Reading</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul><!-- wp:list-item --><li><a href="/x">Still here</a></li><!-- /wp:list-item --></ul>
<!-- /wp:list -->
`.trim();

    const reviewed = `
<!-- wp:list -->
<ul><!-- wp:list-item --><li><a href="/x">Still here</a></li><!-- /wp:list-item --></ul>
<!-- /wp:list -->
`.trim();

    const failures = validateLocks(original, reviewed, []);
    const headingFailures = failures.filter((f) => f.type === 'heading');
    expect(headingFailures).toHaveLength(1);
    expect(headingFailures[0]!.value).toBe('Related Reading');
  });

  it('allows dropping a bold-label Related Reading paragraph with its collapsed list', () => {
    const original = `
<!-- wp:paragraph -->
<p><strong>Related Reading:</strong></p>
<!-- /wp:paragraph -->

<!-- wp:list -->
<ul><!-- wp:list-item --><li><a href="/x">Last one</a></li><!-- /wp:list-item --></ul>
<!-- /wp:list -->
`.trim();

    const reviewed = `<!-- wp:paragraph --><p>Normal body copy.</p><!-- /wp:paragraph -->`;

    const failures = validateLocks(original, reviewed, []);
    expect(failures).toEqual([]);
  });
});

describe('extractBoldLabelParagraphs', () => {
  it('picks up a bold-only label paragraph used as a section heading', () => {
    const content = `<!-- wp:paragraph -->\n<p><strong>Related Reading:</strong></p>\n<!-- /wp:paragraph -->`;
    const labels = extractBoldLabelParagraphs(content);
    expect(labels).toHaveLength(1);
    expect(labels[0]).toContain('Related Reading');
  });

  it('picks up a label with trailing nbsp and colon outside the strong tag', () => {
    const content = `<!-- wp:paragraph -->\n<p><strong>More from the mag</strong>:&nbsp;</p>\n<!-- /wp:paragraph -->`;
    const labels = extractBoldLabelParagraphs(content);
    expect(labels).toHaveLength(1);
  });

  it('does NOT treat a normal paragraph with inline bold as a label', () => {
    const content = `<!-- wp:paragraph -->\n<p><strong>Pssst:</strong> Don\u2019t forget to grab your kit before winter hits.</p>\n<!-- /wp:paragraph -->`;
    const labels = extractBoldLabelParagraphs(content);
    expect(labels).toEqual([]);
  });

  it('does NOT treat a long bolded sentence as a label', () => {
    const content = `<!-- wp:paragraph -->\n<p><strong>This is a rather long passage that should not be mistaken for a short label because it is clearly body copy set in bold for emphasis.</strong></p>\n<!-- /wp:paragraph -->`;
    const labels = extractBoldLabelParagraphs(content);
    expect(labels).toEqual([]);
  });
});

describe('validateLocks — bold-label paragraphs', () => {
  it('fires a label failure when a Related Reading label is dropped', () => {
    const original = `
<!-- wp:paragraph -->
<p><strong>Related Reading:</strong></p>
<!-- /wp:paragraph -->

<!-- wp:list -->
<ul><!-- wp:list-item --><li><a href="/x">Indoor skiing guide</a></li><!-- /wp:list-item --></ul>
<!-- /wp:list -->
`.trim();

    const reviewed = `
<!-- wp:list -->
<ul><!-- wp:list-item --><li><a href="/x">Indoor skiing guide</a></li><!-- /wp:list-item --></ul>
<!-- /wp:list -->
`.trim();

    const failures = validateLocks(original, reviewed, [
      { anchor: 'Indoor skiing guide', href: '/x' },
    ]);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.type).toBe('label');
    expect(failures[0]!.value).toBe('Related Reading:');
  });

  it('skips locked-anchor verbatim check when href lives in a Related Reading list', () => {
    const original = `
<!-- wp:heading -->
<h2 class="wp-block-heading">Related Reading</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul><!-- wp:list-item --><li><a href="https://www.ridestore.com/mag/night-skiing/">The ultimate guide to night skiing</a></li><!-- /wp:list-item --></ul>
<!-- /wp:list -->
`.trim();

    const reviewed = original;

    const failures = validateLocks(original, reviewed, [
      { anchor: 'guide to night skiing', href: 'https://www.ridestore.com/mag/night-skiing/' },
    ]);

    expect(failures).toHaveLength(0);
  });

  it('still fails the anchor lock when href is NOT in a Related Reading list', () => {
    const original = `
<!-- wp:paragraph --><p>Some prose with a <a href="/x">cool link</a> inline.</p><!-- /wp:paragraph -->
`.trim();

    const reviewed = original;

    const failures = validateLocks(original, reviewed, [
      { anchor: 'different anchor', href: '/x' },
    ]);

    expect(failures.some((f) => f.type === 'anchor')).toBe(true);
  });
});
