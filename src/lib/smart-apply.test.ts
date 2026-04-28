import { describe, it, expect } from 'vitest';
import {
  applyRecommendation,
  applyAtPlacement,
  normalize,
  extractSignificantWords,
  extractSentenceHtml,
  findMatchingSentenceText,
  removeAddedLinkInstance,
  findCarouselBlock,
  removeCarouselBlock,
  findCarouselPlacements,
  moveCarouselToBottom,
} from './smart-apply';
import type { LinkRecommendation } from './report-parser';

// Helper to build a REMOVE recommendation
function removeRec(url: string): LinkRecommendation {
  return { action: 'remove', section: 'remove', anchor: '', targetUrl: url, reason: '', suggestedSentence: '' };
}

// Helper to build an ADD recommendation
function addRec(anchor: string, url: string, sentence: string, reason = ''): LinkRecommendation {
  return { action: 'add', section: 'article', anchor, targetUrl: url, reason, suggestedSentence: sentence };
}

// ── REMOVE link tests ───────────────────────────────────────────────

describe('applyRemoveRecommendation', () => {
  it('removes a basic link with no separator', () => {
    const content = '<p>Check our <a href="https://example.com/guide/">guide</a> here.</p>';
    const result = applyRecommendation(removeRec('https://example.com/guide/'), content);
    expect(result.success).toBe(true);
    expect(result.modifiedContent).toBe('<p>Check our  here.</p>');
  });

  it('does not consume content across block boundaries when looking for a trailing separator', () => {
    // Regression: the REMOVE regex used [\s\S]*? inside <a>…</a>, which
    // extended across sections to find the NEXT </a> followed by " / ".
    // That silently deleted Look sections, FAQs, Wrapping up, and half of
    // Related Reading from a real test on post 1201. Tempered greedy token
    // now caps the anchor body at its immediate </a>.
    const content = [
      '<!-- wp:heading --><h2>Get inspiration</h2><!-- /wp:heading -->',
      '<!-- wp:paragraph --><p>Check <a href="https://example.com/target">target</a> to keep you warm.</p><!-- /wp:paragraph -->',
      '<!-- wp:heading --><h2>Middle section</h2><!-- /wp:heading -->',
      '<!-- wp:paragraph --><p>Some long body copy that must survive removes.</p><!-- /wp:paragraph -->',
      '<!-- wp:list --><ul>',
      '<!-- wp:list-item --><li><a href="https://example.com/other">Other link</a> / <a href="https://example.com/extra">Extra</a></li><!-- /wp:list-item -->',
      '</ul><!-- /wp:list -->',
    ].join('\n\n');

    const result = applyRecommendation(removeRec('https://example.com/target'), content);
    expect(result.success).toBe(true);
    // Middle section and its paragraph MUST still be present. The old regex
    // would have deleted them along with the target anchor.
    expect(result.modifiedContent).toContain('Middle section');
    expect(result.modifiedContent).toContain('Some long body copy');
    expect(result.modifiedContent).toContain('Other link');
    // Target link itself must be gone.
    expect(result.modifiedContent).not.toContain('href="https://example.com/target"');
  });

  it('removes link with &nbsp;/&nbsp; separator BEFORE (middle item)', () => {
    const content =
      '<li><a href="/first/">First</a>&nbsp;/&nbsp;<a href="/second/">Second</a>&nbsp;/&nbsp;<a href="/third/">Third</a></li>';
    const result = applyRecommendation(removeRec('/second/'), content);
    expect(result.success).toBe(true);
    expect(result.modifiedContent).toBe(
      '<li><a href="/first/">First</a>&nbsp;/&nbsp;<a href="/third/">Third</a></li>',
    );
  });

  it('removes link with separator AFTER (first item in list)', () => {
    const content =
      '<li><a href="/first/">First</a>&nbsp;/&nbsp;<a href="/second/">Second</a></li>';
    const result = applyRecommendation(removeRec('/first/'), content);
    expect(result.success).toBe(true);
    expect(result.modifiedContent).toBe('<li><a href="/second/">Second</a></li>');
  });

  it('cleans up empty <li> after removal', () => {
    const content = '<ul><li><a href="/only/">Only</a></li></ul>';
    const result = applyRecommendation(removeRec('/only/'), content);
    expect(result.success).toBe(true);
    expect(result.modifiedContent).not.toContain('<li>');
  });

  it('cleans up empty wp:list-item block after removal', () => {
    const content = `<!-- wp:list-item -->
<li><a href="/only/">Only Link</a></li>
<!-- /wp:list-item -->`;
    const result = applyRecommendation(removeRec('/only/'), content);
    expect(result.success).toBe(true);
    expect(result.modifiedContent.trim()).toBe('');
  });

  it('cleans up empty wp:list block when all items removed', () => {
    const content = `<!-- wp:list {"className":"link-list"} -->
<ul class="link-list">
<!-- wp:list-item -->
<li><a href="/only/">Only Link</a></li>
<!-- /wp:list-item -->
</ul>
<!-- /wp:list -->`;
    const result = applyRecommendation(removeRec('/only/'), content);
    expect(result.success).toBe(true);
    // After removing the link + text, the list-item is empty, then the list is empty
    expect(result.modifiedContent.trim()).toBe('');
  });

  it('normalizes trailing slash — URL without slash matches content with slash', () => {
    const content = '<p><a href="/guide/">read the guide</a></p>';
    const result = applyRecommendation(removeRec('/guide'), content);
    expect(result.success).toBe(true);
    expect(result.modifiedContent).not.toContain('guide');
  });

  it('normalizes trailing slash — URL with slash matches content without slash', () => {
    const content = '<p><a href="/guide">read the guide</a></p>';
    const result = applyRecommendation(removeRec('/guide/'), content);
    expect(result.success).toBe(true);
    expect(result.modifiedContent).not.toContain('guide');
  });

  it('keepText=true removes link tag but preserves text', () => {
    const content = '<p>Check our <a href="/guide/">complete guide</a> here.</p>';
    const result = applyRecommendation(removeRec('/guide/'), content, true);
    expect(result.success).toBe(true);
    expect(result.modifiedContent).toBe('<p>Check our complete guide here.</p>');
    expect(result.modifiedContent).not.toContain('<a');
  });

  it('handles link with extra attributes (target, rel, class)', () => {
    const content = '<p><a href="/guide/" target="_blank" rel="noopener" class="link">Guide</a></p>';
    const result = applyRecommendation(removeRec('/guide/'), content);
    expect(result.success).toBe(true);
    expect(result.modifiedContent).not.toContain('Guide');
  });

  it('handles URL with special regex characters', () => {
    const content = '<p><a href="/search?page=1&ref=test">Results</a></p>';
    const result = applyRecommendation(removeRec('/search?page=1&ref=test'), content);
    expect(result.success).toBe(true);
    expect(result.modifiedContent).not.toContain('Results');
  });

  it('returns failure when URL not found in content', () => {
    const content = '<p>No links here.</p>';
    const result = applyRecommendation(removeRec('/missing/'), content);
    expect(result.success).toBe(false);
    expect(result.modifiedContent).toBe(content);
  });

  it('returns no-op for KEEP recommendations', () => {
    const rec: LinkRecommendation = {
      action: 'keep', section: 'article', anchor: 'test', targetUrl: '/test/', reason: '', suggestedSentence: '',
    };
    const result = applyRecommendation(rec, '<p>test</p>');
    expect(result.success).toBe(false);
  });
});

// ── Sentence matching tests ─────────────────────────────────────────

describe('normalize', () => {
  it('strips accents and lowercases', () => {
    expect(normalize('Après-ski')).toBe('apres-ski');
    expect(normalize('Zürich')).toBe('zurich');
    expect(normalize('Mayrhofen')).toBe('mayrhofen');
  });
});

describe('extractSignificantWords', () => {
  it('filters short words and stop words', () => {
    const words = extractSignificantWords('Check out the best après-ski tips for your experience');
    expect(words).toContain('après-ski');
    expect(words).toContain('best');
    expect(words).not.toContain('the');
    expect(words).not.toContain('for');
    expect(words).not.toContain('out'); // 3 chars, filtered
    expect(words).not.toContain('tips'); // in custom stop list
    expect(words).not.toContain('experience'); // in custom stop list
    expect(words).not.toContain('check'); // in custom stop list
  });
});

describe('extractSentenceHtml', () => {
  it('extracts sentence from HTML with inline tags', () => {
    const html = 'This is <strong>bold text</strong> in a sentence.';
    const result = extractSentenceHtml(html, 'This is', 'a sentence.');
    expect(result).toBe('This is <strong>bold text</strong> in a sentence.');
  });

  it('extracts sentence with <a> tags', () => {
    const html = 'Visit <a href="/x">our shop</a> for more gear.';
    const result = extractSentenceHtml(html, 'Visit', 'more gear.');
    expect(result).toBe('Visit <a href="/x">our shop</a> for more gear.');
  });

  it('returns null when first anchor not found', () => {
    const result = extractSentenceHtml('Some other text.', 'Not here', 'at all');
    expect(result).toBeNull();
  });
});

describe('findMatchingSentenceText (Pass 1 vs Pass 2)', () => {
  it('matches a single sentence with high word overlap', () => {
    const content = '<p>The best snowboard jackets combine waterproof protection with breathable comfort for all-day riding.</p>';
    const words = extractSignificantWords('The best snowboard jackets offer waterproof protection and breathable comfort for riding.');
    const result = findMatchingSentenceText(content, words);
    expect(result).not.toBeNull();
    expect(result).toContain('snowboard jackets');
  });

  it('matches accent-insensitive (après vs apres)', () => {
    const content = '<p>The après-ski scene in Mayrhofen is legendary among winter sports enthusiasts.</p>';
    const words = extractSignificantWords('The apres-ski scene in Mayrhofen is legendary among winter sports fans.');
    const result = findMatchingSentenceText(content, words);
    expect(result).not.toBeNull();
    expect(result).toContain('après-ski');
  });

  it('Pass 2 window beats mediocre Pass 1 match', () => {
    // Paragraph with 3 sentences. The suggested text rewrites sentences 2+3.
    // Sentence 1 has a few overlapping words (mediocre match).
    // Sentences 2+3 combined have strong overlap.
    const content = `<p>Waterproof jackets keep riders protected during storms. The membrane technology blocks moisture while allowing vapor to escape. Advanced seam taping ensures complete waterproof coverage throughout the jacket.</p>`;

    // These words overlap strongly with sentences 2+3 but weakly with sentence 1
    const words = extractSignificantWords(
      'Modern membrane technology blocks moisture while letting vapor escape and advanced seam taping provides complete waterproof coverage across the entire jacket.',
    );

    const result = findMatchingSentenceText(content, words);
    expect(result).not.toBeNull();
    // Should match the 2-sentence window, not just sentence 1
    expect(result).toContain('membrane technology');
    expect(result).toContain('seam taping');
  });
});

// ── ADD recommendation (integration) ────────────────────────────────

describe('applyRecommendation ADD', () => {
  it('wraps existing anchor text in a link', () => {
    const content = `<!-- wp:paragraph -->\n<p>Check out the snowboard jackets for your next trip.</p>\n<!-- /wp:paragraph -->`;
    const rec = addRec('snowboard jackets', 'https://example.com/jackets/', '');
    const result = applyRecommendation(rec, content);
    expect(result.success).toBe(true);
    expect(result.modifiedContent).toContain('<a href="https://example.com/jackets/">snowboard jackets</a>');
  });

  it('does not wrap text that is already linked', () => {
    const content = `<p>Check <a href="/old/">snowboard jackets</a> here.</p>`;
    const rec = addRec('snowboard jackets', 'https://example.com/new/', '');
    const result = applyRecommendation(rec, content);
    expect(result.success).toBe(false);
  });

  it('inserts new sentence using suggested-sentence words when reason has no proper nouns', () => {
    const content = [
      '<!-- wp:paragraph -->',
      '<p>Working a season job at a ski resort is a dream for many skiers and snowboarders.</p>',
      '<!-- /wp:paragraph -->',
      '',
      '<!-- wp:paragraph -->',
      '<p>The work can be demanding but the lifestyle is incredibly rewarding.</p>',
      '<!-- /wp:paragraph -->',
    ].join('\n');

    const rec = addRec(
      'coworking spaces for skiers',
      'https://example.com/coworking/',
      'If you are not ready to quit your day job entirely, there are also excellent [coworking spaces for skiers](https://example.com/coworking/) that let you work remotely from the mountains.',
      'Readers considering a season job may also consider remote work as an alternative',
    );
    const result = applyRecommendation(rec, content);
    expect(result.success).toBe(true);
    expect(result.modifiedContent).toContain('<a href="https://example.com/coworking/">coworking spaces for skiers</a>');
    expect(result.modifiedContent).toContain('work remotely from the mountains');
  });
});

describe('removeAddedLinkInstance', () => {
  it('removes the newly added link when there were none before', () => {
    const before = '<p>Some prose without the link.</p>';
    const current = '<p>Some prose with <a href="/x">a new link</a> in it.</p>';
    const result = removeAddedLinkInstance(current, before, '/x');
    expect(result).toBe('<p>Some prose with  in it.</p>');
  });

  it('preserves a pre-existing same-URL link and removes only the new one', () => {
    const before = '<p>Old: <a href="/x">first</a> only.</p>';
    const current = '<p>Old: <a href="/x">first</a> only.</p><p>New: <a href="/x">second</a>.</p>';
    const result = removeAddedLinkInstance(current, before, '/x');
    expect(result).toContain('<a href="/x">first</a>');
    expect(result).not.toContain('<a href="/x">second</a>');
  });

  it('returns content unchanged when no new instance exists', () => {
    const before = '<p>Already had <a href="/x">link</a>.</p>';
    const current = before;
    const result = removeAddedLinkInstance(current, before, '/x');
    expect(result).toBe(current);
  });

  it('handles trailing-slash url variation', () => {
    const before = '<p>No links yet.</p>';
    const current = '<p>Now with <a href="/x/">link</a>.</p>';
    const result = removeAddedLinkInstance(current, before, '/x');
    expect(result).toBe('<p>Now with .</p>');
  });

  it('removes only the first new instance even if two were added', () => {
    const before = '<p>None.</p>';
    const current = '<p>None.</p><p><a href="/x">A</a> and <a href="/x">B</a>.</p>';
    const result = removeAddedLinkInstance(current, before, '/x');
    expect(result).toBe('<p>None.</p><p> and <a href="/x">B</a>.</p>');
  });
});

// ── applyAtPlacement: anchor-wrapping fallback ──────────────────────

describe('applyAtPlacement anchor wrapping', () => {
  const baseContent = '<!-- wp:paragraph -->\n<p>Existing body.</p>\n<!-- /wp:paragraph -->';
  const placement = { snippet: 's', position: 'after' as const, label: 'l', score: 1, insertAt: baseContent.length };

  it('expands markdown [anchor](url) into an <a> tag', () => {
    const rec: LinkRecommendation = {
      action: 'add',
      section: 'article',
      anchor: 'come vestirsi sulla neve',
      targetUrl: 'https://www.ridestore.com/it/mag/come-vestirsi-sulla-neve/',
      reason: '',
      suggestedSentence: 'Sapere [come vestirsi sulla neve](https://www.ridestore.com/it/mag/come-vestirsi-sulla-neve/) è importante.',
    };
    const result = applyAtPlacement(rec, baseContent, placement);
    expect(result.success).toBe(true);
    expect(result.modifiedContent).toContain('<a href="https://www.ridestore.com/it/mag/come-vestirsi-sulla-neve/">come vestirsi sulla neve</a>');
  });

  it('wraps the literal anchor text when the suggested sentence has no markdown link', () => {
    // This is the WP Post #46510 case from the v2 IT report — the report
    // wrote the anchor as plain prose, not as `[anchor](url)`. The applier
    // must still produce a clickable link.
    const rec: LinkRecommendation = {
      action: 'add',
      section: 'article',
      anchor: 'come vestirsi sulla neve',
      targetUrl: 'https://www.ridestore.com/it/mag/come-vestirsi-sulla-neve/',
      reason: 'Intro',
      suggestedSentence: 'Se vuoi prima una panoramica completa su come vestirsi sulla neve in ogni stagione, consulta la nostra guida generale prima di approfondire i consigli primaverili.',
    };
    const result = applyAtPlacement(rec, baseContent, placement);
    expect(result.success).toBe(true);
    expect(result.modifiedContent).toContain(
      '<a href="https://www.ridestore.com/it/mag/come-vestirsi-sulla-neve/">come vestirsi sulla neve</a>',
    );
    // The wrapping must replace the FIRST occurrence only, not duplicate text
    const occurrences = (result.modifiedContent.match(/come vestirsi sulla neve/g) || []).length;
    expect(occurrences).toBe(1);
  });

  it('inserts the sentence unchanged when neither markdown nor plain anchor is found', () => {
    const rec: LinkRecommendation = {
      action: 'add',
      section: 'article',
      anchor: 'something missing',
      targetUrl: 'https://example.com/',
      reason: '',
      suggestedSentence: 'A paraphrased sentence with no obvious anchor.',
    };
    const result = applyAtPlacement(rec, baseContent, placement);
    expect(result.success).toBe(true);
    // Sentence still inserted, just without the anchor wrap
    expect(result.modifiedContent).toContain('A paraphrased sentence');
    expect(result.modifiedContent).not.toContain('<a href=');
  });

  it('escapes regex metacharacters in the anchor when wrapping plain text', () => {
    const rec: LinkRecommendation = {
      action: 'add',
      section: 'article',
      anchor: 'jackets (women)',
      targetUrl: 'https://example.com/jackets/',
      reason: '',
      suggestedSentence: 'Browse our jackets (women) for all conditions.',
    };
    const result = applyAtPlacement(rec, baseContent, placement);
    expect(result.success).toBe(true);
    expect(result.modifiedContent).toContain('<a href="https://example.com/jackets/">jackets (women)</a>');
  });
});

// ── Carousel helpers ───────────────────────────────────────────────

const CAROUSEL_BLOCK = '<!-- wp:shortcode -->\n[global_carousel_people_list id="1"]\n<!-- /wp:shortcode -->';
const CAROUSEL_BLOCK_NO_ID = '<!-- wp:shortcode -->\n[global_carousel_people_list]\n<!-- /wp:shortcode -->';

const ARTICLE_HEAD = [
  '<!-- wp:paragraph --><p>Intro paragraph.</p><!-- /wp:paragraph -->',
  '<!-- wp:heading --><h2>First section</h2><!-- /wp:heading -->',
  '<!-- wp:paragraph --><p>First body.</p><!-- /wp:paragraph -->',
].join('\n\n');

const ARTICLE_TAIL = [
  '<!-- wp:heading --><h2>Second section</h2><!-- /wp:heading -->',
  '<!-- wp:paragraph --><p>Second body.</p><!-- /wp:paragraph -->',
  '<!-- wp:heading --><h2>Wrapping up</h2><!-- /wp:heading -->',
  '<!-- wp:paragraph --><p>Closing thoughts.</p><!-- /wp:paragraph -->',
].join('\n\n');

describe('findCarouselBlock', () => {
  it('finds a carousel block with id attribute', () => {
    const content = `${ARTICLE_HEAD}\n\n${CAROUSEL_BLOCK}\n\n${ARTICLE_TAIL}`;
    const match = findCarouselBlock(content);
    expect(match).not.toBeNull();
    expect(match!.markup).toContain('global_carousel_people_list');
    expect(content.slice(match!.startIndex, match!.endIndex)).toBe(match!.markup);
  });

  it('finds a carousel block without an id attribute', () => {
    const content = `${ARTICLE_HEAD}\n\n${CAROUSEL_BLOCK_NO_ID}\n\n${ARTICLE_TAIL}`;
    const match = findCarouselBlock(content);
    expect(match).not.toBeNull();
    expect(match!.markup).toContain('[global_carousel_people_list]');
  });

  it('returns null when no carousel block is present', () => {
    const content = `${ARTICLE_HEAD}\n\n${ARTICLE_TAIL}`;
    expect(findCarouselBlock(content)).toBeNull();
  });

  it('ignores other shortcodes', () => {
    const otherShortcode = '<!-- wp:shortcode -->\n[some_other_shortcode]\n<!-- /wp:shortcode -->';
    const content = `${ARTICLE_HEAD}\n\n${otherShortcode}\n\n${ARTICLE_TAIL}`;
    expect(findCarouselBlock(content)).toBeNull();
  });

  it('finds the carousel when wrapped in a paragraph block', () => {
    const para = '<!-- wp:paragraph -->\n<p>[global_carousel_people_list id="1"]</p>\n<!-- /wp:paragraph -->';
    const content = `${ARTICLE_HEAD}\n\n${para}\n\n${ARTICLE_TAIL}`;
    const match = findCarouselBlock(content);
    expect(match).not.toBeNull();
    expect(match!.markup).toContain('global_carousel_people_list');
  });

  it('finds the carousel when wrapped in a wp:html block', () => {
    const htmlBlock = '<!-- wp:html -->\n[global_carousel_people_list id="1"]\n<!-- /wp:html -->';
    const content = `${ARTICLE_HEAD}\n\n${htmlBlock}\n\n${ARTICLE_TAIL}`;
    const match = findCarouselBlock(content);
    expect(match).not.toBeNull();
    expect(match!.markup).toContain('global_carousel_people_list');
  });

  it('finds the carousel when bare in raw content (no wp block wrapper)', () => {
    const content = `${ARTICLE_HEAD}\n\n[global_carousel_people_list id="1"]\n\n${ARTICLE_TAIL}`;
    const match = findCarouselBlock(content);
    expect(match).not.toBeNull();
    expect(match!.markup).toContain('global_carousel_people_list');
  });
});

describe('removeCarouselBlock', () => {
  it('removes the carousel block when present', () => {
    const content = `${ARTICLE_HEAD}\n\n${CAROUSEL_BLOCK}\n\n${ARTICLE_TAIL}`;
    const result = removeCarouselBlock(content);
    expect(result.success).toBe(true);
    expect(result.modifiedContent).not.toContain('global_carousel_people_list');
    expect(result.modifiedContent).toContain('First section');
    expect(result.modifiedContent).toContain('Wrapping up');
  });

  it('is a no-op when no carousel block exists', () => {
    const content = `${ARTICLE_HEAD}\n\n${ARTICLE_TAIL}`;
    const result = removeCarouselBlock(content);
    expect(result.success).toBe(false);
    expect(result.modifiedContent).toBe(content);
  });

  it('is idempotent: calling twice produces the same result as once', () => {
    const content = `${ARTICLE_HEAD}\n\n${CAROUSEL_BLOCK}\n\n${ARTICLE_TAIL}`;
    const first = removeCarouselBlock(content);
    const second = removeCarouselBlock(first.modifiedContent);
    expect(second.success).toBe(false);
    expect(second.modifiedContent).toBe(first.modifiedContent);
  });
});

describe('findCarouselPlacements', () => {
  it('always offers an end-of-article option', () => {
    const content = `${ARTICLE_HEAD}\n\n${ARTICLE_TAIL}`;
    const opts = findCarouselPlacements(content);
    expect(opts.length).toBeGreaterThan(0);
    expect(opts[0]!.insertAt).toBe(content.length);
    expect(opts[0]!.label.toLowerCase()).toContain('end of the article');
  });

  it('offers heading-relative options when headings exist', () => {
    const content = `${ARTICLE_HEAD}\n\n${ARTICLE_TAIL}`;
    const opts = findCarouselPlacements(content);
    const labels = opts.map((o) => o.label).join('|');
    expect(labels).toContain('Wrapping up');
  });

  it('returns the end-only option for content with no headings', () => {
    const content = '<!-- wp:paragraph --><p>Just one paragraph.</p><!-- /wp:paragraph -->';
    const opts = findCarouselPlacements(content);
    expect(opts).toHaveLength(1);
    expect(opts[0]!.insertAt).toBe(content.length);
  });

  it('puts the Related Reading option at the top when section exists', () => {
    const relatedReadingHeading = '<!-- wp:heading -->\n<h2>Related Reading</h2>\n<!-- /wp:heading -->';
    const relatedReadingList = [
      '<!-- wp:list -->',
      '<ul><li><a href="/foo">Foo</a></li><li><a href="/bar">Bar</a></li></ul>',
      '<!-- /wp:list -->',
    ].join('\n');
    const content = `${ARTICLE_HEAD}\n\n${ARTICLE_TAIL}\n\n${relatedReadingHeading}\n\n${relatedReadingList}`;
    const opts = findCarouselPlacements(content);
    expect(opts.length).toBeGreaterThan(1);
    expect(opts[0]!.label.toLowerCase()).toContain('related reading');
    expect(opts[0]!.score).toBe(1);
    // The end-of-article option should be demoted below the Related Reading one
    const endOption = opts.find((o) => o.insertAt === content.length);
    expect(endOption).toBeDefined();
    expect(endOption!.score).toBeLessThan(1);
  });

  it('detects Related Reading via bold-label paragraph too', () => {
    const boldLabel = '<!-- wp:paragraph -->\n<p><strong>Related Reading:</strong></p>\n<!-- /wp:paragraph -->';
    const content = `${ARTICLE_HEAD}\n\n${ARTICLE_TAIL}\n\n${boldLabel}`;
    const opts = findCarouselPlacements(content);
    expect(opts[0]!.label.toLowerCase()).toContain('related reading');
  });

  it('end-of-article placement lands AFTER trailing ACF blocks', () => {
    const acfFaq = '<!-- wp:acf/faq {"name":"acf/faq","data":{"title":"Frequently asked"},"mode":"preview"} /-->';
    const acfCta = '<!-- wp:acf/cta {"name":"acf/cta","data":{"heading":"Buy now"},"mode":"preview"} /-->';
    // Realistic flow: carousel currently at TOP, ACF blocks at the very end.
    const carouselSource = `${CAROUSEL_BLOCK}\n\n${ARTICLE_HEAD}\n\n${ARTICLE_TAIL}\n\n${acfFaq}\n\n${acfCta}`;
    const opts = findCarouselPlacements(carouselSource);
    const endOption = opts.find((o) => o.snippet === 'End of article');
    expect(endOption).toBeDefined();
    expect(endOption!.insertAt).toBe(carouselSource.length);
    // Label should mention the trailing ACF count so the user can confirm.
    expect(endOption!.label).toContain('2 ACF block');
    const result = moveCarouselToBottom(carouselSource, endOption);
    expect(result.success).toBe(true);
    const moved = result.modifiedContent;
    const faqIdx = moved.indexOf('acf/faq');
    const ctaIdx = moved.indexOf('acf/cta');
    const carouselIdx = moved.indexOf('global_carousel_people_list');
    expect(faqIdx).toBeLessThan(carouselIdx);
    expect(ctaIdx).toBeLessThan(carouselIdx);
  });

  // Localised Related Reading section markers — Ridestore caters to 9 langs.
  const LOCALISED_HEADINGS: Array<[string, string]> = [
    ['IT', 'Letture correlate'],
    ['IT', 'Articoli correlati'],
    ['DE', 'Verwandte Artikel'],
    ['DE', 'Ähnliche Artikel'],
    ['FR', 'Articles liés'],
    ['FR', 'À lire aussi'],
    ['ES', 'Artículos relacionados'],
    ['ES', 'Lecturas relacionadas'],
    ['PL', 'Powiązane artykuły'],
    ['PL', 'Zobacz też'],
    ['NL', 'Gerelateerde artikelen'],
    ['NL', 'Lees ook'],
    ['SV', 'Relaterade artiklar'],
    ['SV', 'Läs också'],
    ['FI', 'Liittyvät artikkelit'],
    ['FI', 'Lue myös'],
  ];

  for (const [lang, heading] of LOCALISED_HEADINGS) {
    it(`detects localised Related Reading heading: ${lang} "${heading}"`, () => {
      const block = `<!-- wp:heading -->\n<h2>${heading}</h2>\n<!-- /wp:heading -->`;
      const content = `${ARTICLE_HEAD}\n\n${ARTICLE_TAIL}\n\n${block}`;
      const opts = findCarouselPlacements(content);
      // The localised heading should be the top-scored option.
      expect(opts[0]!.score).toBe(1);
      expect(opts[0]!.label).toContain(heading);
    });
  }
});

describe('moveCarouselToBottom', () => {
  it('moves a top-positioned carousel to the end of the article by default', () => {
    const content = `${CAROUSEL_BLOCK}\n\n${ARTICLE_HEAD}\n\n${ARTICLE_TAIL}`;
    const result = moveCarouselToBottom(content);
    expect(result.success).toBe(true);
    expect(result.modifiedContent).not.toContain(`${CAROUSEL_BLOCK}\n\n${ARTICLE_HEAD}`);
    // Carousel still present
    const stillThere = findCarouselBlock(result.modifiedContent);
    expect(stillThere).not.toBeNull();
    // Now sits after the body content
    expect(stillThere!.startIndex).toBeGreaterThan(result.modifiedContent.indexOf('Wrapping up'));
  });

  it('moves carousel to a chosen placement option', () => {
    const content = `${CAROUSEL_BLOCK}\n\n${ARTICLE_HEAD}\n\n${ARTICLE_TAIL}`;
    // Pick the "Before final heading" option
    const removed = removeCarouselBlock(content).modifiedContent;
    const placement = findCarouselPlacements(removed).find((o) => o.label.includes('Before final heading'));
    expect(placement).toBeDefined();
    // findCarouselPlacements is computed against the original content elsewhere; here we
    // pass it back through moveCarouselToBottom which should still place it correctly.
    const result = moveCarouselToBottom(content, placement);
    expect(result.success).toBe(true);
    // The carousel must appear before "Wrapping up"
    const moved = result.modifiedContent;
    const carouselIdx = moved.indexOf('global_carousel_people_list');
    const wrappingIdx = moved.indexOf('Wrapping up');
    expect(carouselIdx).toBeGreaterThan(0);
    expect(carouselIdx).toBeLessThan(wrappingIdx);
  });

  it('fails gracefully when there is no carousel to move', () => {
    const content = `${ARTICLE_HEAD}\n\n${ARTICLE_TAIL}`;
    const result = moveCarouselToBottom(content);
    expect(result.success).toBe(false);
    expect(result.modifiedContent).toBe(content);
  });

  it('does not duplicate the carousel block', () => {
    const content = `${CAROUSEL_BLOCK}\n\n${ARTICLE_HEAD}\n\n${ARTICLE_TAIL}`;
    const result = moveCarouselToBottom(content);
    const occurrences = (result.modifiedContent.match(/global_carousel_people_list/g) || []).length;
    expect(occurrences).toBe(1);
  });

  it('prepends a bold subheading paragraph when provided', () => {
    const content = `${CAROUSEL_BLOCK}\n\n${ARTICLE_HEAD}\n\n${ARTICLE_TAIL}`;
    const result = moveCarouselToBottom(content, undefined, { subheading: 'Meet the team' });
    expect(result.success).toBe(true);
    const subheadingBlock = '<!-- wp:paragraph -->\n<p><strong>Meet the team</strong></p>\n<!-- /wp:paragraph -->';
    expect(result.modifiedContent).toContain(subheadingBlock);
    // Subheading must precede the carousel block
    const subIdx = result.modifiedContent.indexOf('Meet the team');
    const carIdx = result.modifiedContent.indexOf('global_carousel_people_list');
    expect(subIdx).toBeGreaterThan(0);
    expect(subIdx).toBeLessThan(carIdx);
  });

  it('omits the subheading block when the value is empty or whitespace', () => {
    const content = `${CAROUSEL_BLOCK}\n\n${ARTICLE_HEAD}\n\n${ARTICLE_TAIL}`;
    const blank = moveCarouselToBottom(content, undefined, { subheading: '' });
    const whitespace = moveCarouselToBottom(content, undefined, { subheading: '   ' });
    const undef = moveCarouselToBottom(content);
    expect(blank.modifiedContent).toBe(undef.modifiedContent);
    expect(whitespace.modifiedContent).toBe(undef.modifiedContent);
    expect(blank.modifiedContent).not.toContain('<strong>');
  });

  it('escapes HTML special characters in the subheading text', () => {
    const content = `${CAROUSEL_BLOCK}\n\n${ARTICLE_HEAD}\n\n${ARTICLE_TAIL}`;
    const result = moveCarouselToBottom(content, undefined, { subheading: 'Pros & cons <experts>' });
    expect(result.modifiedContent).toContain('<p><strong>Pros &amp; cons &lt;experts&gt;</strong></p>');
    expect(result.modifiedContent).not.toContain('<experts>');
  });
});
