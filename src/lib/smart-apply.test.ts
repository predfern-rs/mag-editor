import { describe, it, expect } from 'vitest';
import {
  applyRecommendation,
  normalize,
  extractSignificantWords,
  extractSentenceHtml,
  findMatchingSentenceText,
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
