import { describe, it, expect } from 'vitest';
import { extractHeadingBlocks, validateLocks } from './opus-review';

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
    expect(failures).toHaveLength(1);
    expect(failures[0]!.type).toBe('heading');
  });
});
