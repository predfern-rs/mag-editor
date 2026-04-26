import { describe, it, expect } from 'vitest';
import {
  parseLocationHint,
  findSectionByHint,
  isLinkInSection,
  findPlacementOptionsInSection,
  applyLinkRelocation,
} from './relocate';

describe('parseLocationHint', () => {
  it('pulls the prefix before "Already linked"', () => {
    expect(
      parseLocationHint('Intro paragraph - Already linked - keeping as it is the cluster pillar'),
    ).toBe('Intro paragraph');
  });

  it('keeps multi-segment section names intact', () => {
    expect(
      parseLocationHint('Look 1 - The Piste Skier - Already linked - keeping as it directly serves readers'),
    ).toBe('Look 1 - The Piste Skier');
  });

  it('strips trailing "/ already linked" fragments', () => {
    expect(
      parseLocationHint('Related Reading / already linked - Already linked - keeping for cross-cluster discovery'),
    ).toBe('Related Reading');
  });

  it('returns null when no "Already linked" marker is present', () => {
    expect(parseLocationHint('Just some reason with no hint')).toBeNull();
    expect(parseLocationHint('')).toBeNull();
  });

  it('is case-insensitive on the marker', () => {
    expect(parseLocationHint('Top — already linked — keeping')).toBe('Top');
  });
});

describe('findSectionByHint', () => {
  const article = `
<!-- wp:paragraph --><p>Intro prose with an overview of après ski.</p><!-- /wp:paragraph -->

<!-- wp:heading --><h2 class="wp-block-heading" id="Piste">Look 1 - The Piste Skier</h2><!-- /wp:heading -->

<!-- wp:paragraph --><p>The piste skier wears anorak-style jackets.</p><!-- /wp:paragraph -->

<!-- wp:paragraph --><p>Another paragraph in Look 1.</p><!-- /wp:paragraph -->

<!-- wp:heading --><h2 class="wp-block-heading" id="Snowboarder">Look 2 - The Snowboarder</h2><!-- /wp:heading -->

<!-- wp:paragraph --><p>Snowboarders ride baggy.</p><!-- /wp:paragraph -->

<!-- wp:separator --><hr/><!-- /wp:separator -->

<!-- wp:paragraph --><p><strong>Related Reading:</strong></p><!-- /wp:paragraph -->

<!-- wp:list --><ul><!-- wp:list-item --><li><a href="/a">A</a></li><!-- /wp:list-item --></ul><!-- /wp:list -->
`.trim();

  it('locates a Look section by its multi-part hint', () => {
    const section = findSectionByHint(article, 'Look 1 - The Piste Skier');
    expect(section).not.toBeNull();
    expect(section!.headingTitle).toContain('Look 1');
    // Section should NOT include Look 2's heading.
    const slice = article.substring(section!.startIndex, section!.endIndex);
    expect(slice).toContain('piste skier wears anorak');
    expect(slice).not.toContain('Look 2');
    expect(slice).not.toContain('Snowboarders ride baggy');
  });

  it('locates a bold-label section like "Related Reading"', () => {
    const section = findSectionByHint(article, 'Related Reading');
    expect(section).not.toBeNull();
    const slice = article.substring(section!.startIndex, section!.endIndex);
    expect(slice).toContain('<a href="/a">A</a>');
  });

  it('returns null when no heading is close enough', () => {
    expect(findSectionByHint(article, 'Unrelated galactic travel tips')).toBeNull();
  });

  it('treats "Intro paragraph" as the unheaded content above the first heading', () => {
    const section = findSectionByHint(article, 'Intro paragraph');
    expect(section).not.toBeNull();
    expect(section!.startIndex).toBe(0);
    // End should be exactly at the Look 1 heading's opening comment.
    expect(article.substring(section!.endIndex, section!.endIndex + 50)).toMatch(/^<!-- wp:heading -->/);
    expect(section!.headingTitle).toBe('Intro');
  });

  it.each(['Intro', 'Introduction', 'Opening', 'Top', 'Lead paragraph', 'First paragraph'])(
    'treats "%s" as an intro reference',
    (hint) => {
      const section = findSectionByHint(article, hint);
      expect(section).not.toBeNull();
      expect(section!.startIndex).toBe(0);
    },
  );
});

describe('isLinkInSection', () => {
  const article = `
<!-- wp:heading --><h2>Alpha</h2><!-- /wp:heading -->
<!-- wp:paragraph --><p>Read <a href="/foo">the foo guide</a> here.</p><!-- /wp:paragraph -->
<!-- wp:heading --><h2>Beta</h2><!-- /wp:heading -->
<!-- wp:paragraph --><p>Beta content only.</p><!-- /wp:paragraph -->
`.trim();

  it('returns true when both anchor and href appear inside the range', () => {
    const alphaStart = article.indexOf('<!-- wp:heading -->');
    const betaStart = article.indexOf('<!-- wp:heading -->', alphaStart + 1);
    expect(isLinkInSection(article, 'the foo guide', '/foo', alphaStart, betaStart)).toBe(true);
  });

  it('returns false when the link is outside the range', () => {
    const betaStart = article.indexOf('Beta');
    expect(isLinkInSection(article, 'the foo guide', '/foo', betaStart, article.length)).toBe(false);
  });

  it('requires both anchor AND href to match (not just anchor)', () => {
    const alphaStart = article.indexOf('<!-- wp:heading -->');
    const betaStart = article.indexOf('<!-- wp:heading -->', alphaStart + 1);
    expect(isLinkInSection(article, 'the foo guide', '/wrong', alphaStart, betaStart)).toBe(false);
  });

  it('matches anchor case-insensitively and tolerates extra words in the real link text', () => {
    // Real-world case: rec.anchor = "best ski resorts in Europe" (lowercase),
    // article has "100 Best Ski Resorts In Europe" (capitalised, extra "100 ").
    const realArticle = `
<!-- wp:paragraph --><p><strong>Related Reading:</strong></p><!-- /wp:paragraph -->
<!-- wp:list --><ul><!-- wp:list-item --><li><a href="https://example.com/best-ski-resorts/">100 Best Ski Resorts In Europe</a></li><!-- /wp:list-item --></ul><!-- /wp:list -->
`.trim();
    expect(
      isLinkInSection(
        realArticle,
        'best ski resorts in Europe',
        'https://example.com/best-ski-resorts/',
        0,
        realArticle.length,
      ),
    ).toBe(true);
  });
});

describe('findPlacementOptionsInSection', () => {
  const article = `
<!-- wp:heading --><h2>Look 1 - The Piste Skier</h2><!-- /wp:heading -->

<!-- wp:paragraph --><p>The piste skier wears a jacket.</p><!-- /wp:paragraph -->

<!-- wp:paragraph --><p>A second paragraph in Look 1.</p><!-- /wp:paragraph -->

<!-- wp:heading --><h2>Look 2</h2><!-- /wp:heading -->

<!-- wp:paragraph --><p>Different section.</p><!-- /wp:paragraph -->
`.trim();

  it('yields an insertion point after each block inside the section', () => {
    const section = findSectionByHint(article, 'Look 1 - The Piste Skier');
    expect(section).not.toBeNull();
    const options = findPlacementOptionsInSection(article, section!);
    // Heading + 2 paragraphs = 3 options.
    expect(options).toHaveLength(3);
    expect(options[0]!.label).toContain('Below heading');
    expect(options[1]!.label).toContain('After');
    // None of the options should point past Look 2.
    const look2Start = article.indexOf('Look 2');
    for (const opt of options) {
      expect(opt.insertAt).toBeLessThanOrEqual(look2Start);
    }
  });
});

describe('applyLinkRelocation', () => {
  const article = `
<!-- wp:heading --><h2>Intro</h2><!-- /wp:heading -->

<!-- wp:paragraph --><p>Start here.</p><!-- /wp:paragraph -->

<!-- wp:heading --><h2>Look 1</h2><!-- /wp:heading -->

<!-- wp:paragraph --><p>Piste skier wears a jacket.</p><!-- /wp:paragraph -->

<!-- wp:heading --><h2>Related Reading</h2><!-- /wp:heading -->

<!-- wp:paragraph --><p>See <a href="/mag/apres">the ultimate après ski guide</a> for more.</p><!-- /wp:paragraph -->
`.trim();

  it('removes the anchor from its current location and drops a bare anchor at the chosen point', () => {
    // Insert at the start of the Look 1 section body (right after the heading).
    const look1HeadingEnd =
      article.indexOf('<!-- /wp:heading -->', article.indexOf('Look 1')) + '<!-- /wp:heading -->'.length;
    const result = applyLinkRelocation(
      article,
      'the ultimate après ski guide',
      '/mag/apres',
      look1HeadingEnd,
    );
    expect(result.success).toBe(true);
    // The anchor should appear exactly once in the modified content — at its
    // new location, not its old one.
    const anchorMatches = result.modifiedContent.match(
      /<a\s[^>]*href="\/mag\/apres"[^>]*>the ultimate après ski guide<\/a>/g,
    );
    expect(anchorMatches).toHaveLength(1);
    // And the single remaining instance should be inside Look 1, not Related Reading.
    const look1Start = result.modifiedContent.indexOf('Look 1');
    const relatedStart = result.modifiedContent.indexOf('Related Reading');
    const anchorStart = result.modifiedContent.indexOf('<a href="/mag/apres">');
    expect(anchorStart).toBeGreaterThan(look1Start);
    expect(anchorStart).toBeLessThan(relatedStart);
    // The original Related Reading paragraph should have lost its anchor.
    const relatedSection = result.modifiedContent.substring(relatedStart);
    expect(relatedSection).not.toContain('<a href="/mag/apres">');
  });

  it('fails gracefully when the anchor cannot be found', () => {
    const result = applyLinkRelocation(article, 'nonexistent', '/nope', 0);
    expect(result.success).toBe(false);
    expect(result.modifiedContent).toBe(article);
  });

  it('locates the link by href and uses the rec\'s prose anchor text at the new spot', () => {
    // Article has Title Case anchor (Related Reading list style). Rec carries
    // the sentence-case form. We want the new location to use the rec's form
    // so it reads naturally in prose, not as Title Case lifted from a list.
    const doc = `
<!-- wp:heading --><h2>Intro</h2><!-- /wp:heading -->

<!-- wp:paragraph --><p>Start here.</p><!-- /wp:paragraph -->

<!-- wp:heading --><h2>Related</h2><!-- /wp:heading -->

<!-- wp:paragraph --><p>See <a href="/mag/resorts/">100 Best Ski Resorts In Europe</a>.</p><!-- /wp:paragraph -->
`.trim();
    const introHeadingEnd =
      doc.indexOf('<!-- /wp:heading -->', doc.indexOf('Intro')) + '<!-- /wp:heading -->'.length;
    const result = applyLinkRelocation(
      doc,
      'best ski resorts in Europe', // rec anchor (sentence case)
      '/mag/resorts/',
      introHeadingEnd,
    );
    expect(result.success).toBe(true);
    // The new anchor uses the rec's sentence-case text, not the article's Title Case.
    expect(result.modifiedContent).toContain(
      '<a href="/mag/resorts/">best ski resorts in Europe</a>',
    );
    // Title Case form must NOT remain anywhere.
    expect(result.modifiedContent).not.toContain('100 Best Ski Resorts In Europe');
    // Still exactly one link to that href overall.
    const matches = result.modifiedContent.match(/href="\/mag\/resorts\/"/g);
    expect(matches).toHaveLength(1);
  });

  it('falls back to the article\'s anchor text only when the rec has none', () => {
    const doc = `<!-- wp:heading --><h2>Intro</h2><!-- /wp:heading -->

<!-- wp:paragraph --><p>Start here.</p><!-- /wp:paragraph -->

<!-- wp:paragraph --><p>See <a href="/mag/resorts/">Fallback Link Text</a>.</p><!-- /wp:paragraph -->`;
    const introHeadingEnd =
      doc.indexOf('<!-- /wp:heading -->', doc.indexOf('Intro')) + '<!-- /wp:heading -->'.length;
    const result = applyLinkRelocation(doc, '', '/mag/resorts/', introHeadingEnd);
    expect(result.success).toBe(true);
    expect(result.modifiedContent).toContain(
      '<a href="/mag/resorts/">Fallback Link Text</a>',
    );
  });
});
