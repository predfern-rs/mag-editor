import { describe, it, expect } from 'vitest';
import { renderPreviewHtml } from './preview-html';

describe('renderPreviewHtml', () => {
  it('strips plain wp:* block comments and keeps inner HTML', () => {
    const content = '<!-- wp:paragraph -->\n<p>Hello world</p>\n<!-- /wp:paragraph -->';
    const out = renderPreviewHtml(content);
    expect(out).toContain('<p>Hello world</p>');
    expect(out).not.toContain('wp:paragraph');
  });

  it('renders ACF blocks as visible placeholder cards with type and label', () => {
    const acf = '<!-- wp:acf/faq {"name":"acf/faq","data":{"title":"Frequently asked"},"mode":"preview"} /-->';
    const content = `<!-- wp:paragraph --><p>Intro</p><!-- /wp:paragraph -->\n\n${acf}`;
    const out = renderPreviewHtml(content);
    expect(out).toContain('<aside class="acf-placeholder"');
    expect(out).toContain('data-acf-type="faq"');
    expect(out).toContain('Frequently asked');
    expect(out).toContain('<p>Intro</p>');
  });

  it('escapes HTML in the ACF label so user-supplied content cannot break the placeholder', () => {
    const acf = '<!-- wp:acf/cta {"name":"acf/cta","data":{"title":"<script>alert(1)</script>"},"mode":"preview"} /-->';
    const out = renderPreviewHtml(acf);
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('passes plain HTML through when no wp comments are present', () => {
    const html = '<p>Already rendered.</p><h2>Heading</h2>';
    const out = renderPreviewHtml(html);
    expect(out).toContain('<p>Already rendered.</p>');
    expect(out).toContain('<h2>Heading</h2>');
  });

  it('returns empty for empty input', () => {
    expect(renderPreviewHtml('')).toBe('');
  });

  it('orders placeholders correctly relative to surrounding paragraphs', () => {
    const acfFaq = '<!-- wp:acf/faq {"name":"acf/faq","data":{"title":"FAQ"},"mode":"preview"} /-->';
    const content = [
      '<!-- wp:paragraph --><p>Above</p><!-- /wp:paragraph -->',
      acfFaq,
      '<!-- wp:paragraph --><p>Below</p><!-- /wp:paragraph -->',
    ].join('\n\n');
    const out = renderPreviewHtml(content);
    const above = out.indexOf('Above');
    const placeholder = out.indexOf('acf-placeholder');
    const below = out.indexOf('Below');
    expect(above).toBeLessThan(placeholder);
    expect(placeholder).toBeLessThan(below);
  });

  it('preserves a freshly-inserted link sentence with anchor tag, paragraph block edge case', () => {
    // Reproduce the user's exact bug: applyAtPlacement converts the markdown
    // [anchor](url) to <a href="url">anchor</a>, wraps it in a wp:paragraph
    // block, and inserts. The preview must keep the <a> tag intact.
    const insertedBlock = '<!-- wp:paragraph -->\n<p>Sapere <a href="https://www.ridestore.com/it/mag/come-vestirsi-sulla-neve/">come vestirsi sulla neve</a> significa anche capire perché rimanere asciutti è vitale.</p>\n<!-- /wp:paragraph -->';
    const out = renderPreviewHtml(insertedBlock);
    expect(out).toContain('come vestirsi sulla neve');
    expect(out).toContain('<a href=');
    expect(out).toContain('href="https://www.ridestore.com/it/mag/come-vestirsi-sulla-neve/"');
  });

  it('handles nested wp:list and wp:list-item without dropping or duplicating content', () => {
    const content = [
      '<!-- wp:paragraph --><p>Intro <a href="/foo">foo</a>.</p><!-- /wp:paragraph -->',
      '<!-- wp:list --><ul>',
      '<!-- wp:list-item --><li><a href="/bar">bar</a></li><!-- /wp:list-item -->',
      '<!-- wp:list-item --><li><a href="/baz">baz</a></li><!-- /wp:list-item -->',
      '</ul><!-- /wp:list -->',
      '<!-- wp:paragraph --><p>After list <a href="/added">come vestirsi sulla neve</a>.</p><!-- /wp:paragraph -->',
    ].join('\n\n');
    const out = renderPreviewHtml(content);
    // Each anchor should appear exactly once
    expect((out.match(/href="\/foo"/g) || []).length).toBe(1);
    expect((out.match(/href="\/bar"/g) || []).length).toBe(1);
    expect((out.match(/href="\/baz"/g) || []).length).toBe(1);
    expect((out.match(/href="\/added"/g) || []).length).toBe(1);
    // Inserted anchor text must be present
    expect(out).toContain('come vestirsi sulla neve');
  });

  it('does not eat <a> tags inside paragraph blocks when stripping comments', () => {
    const block = '<!-- wp:paragraph --><p>Read <a href="/foo">our guide</a> first.</p><!-- /wp:paragraph -->';
    const out = renderPreviewHtml(block);
    expect(out).toContain('<a href="/foo">our guide</a>');
  });

  it('preserves a freshly-inserted link sentence (apply-at-placement → preview flow)', () => {
    // User flow: existing article has paragraphs and headings. Click "Show places",
    // pick one, click "Insert here" → applyAtPlacement inserts a new wp:paragraph
    // block containing an <a> tag. The Review Preview must show that sentence.
    const baseContent = [
      '<!-- wp:paragraph -->\n<p>Existing intro about ski clothing.</p>\n<!-- /wp:paragraph -->',
      '<!-- wp:heading -->\n<h2>Il Base-Layer</h2>\n<!-- /wp:heading -->',
      '<!-- wp:paragraph -->\n<p>The base layer protects you from cold.</p>\n<!-- /wp:paragraph -->',
    ].join('\n\n');

    // Simulate applyAtPlacement output: a brand-new paragraph block with an anchor
    const insertedBlock = '\n\n<!-- wp:paragraph -->\n<p>For a deep dive read our <a href="https://example.com/sottotuta/">sottotuta sci per la neve</a> guide.</p>\n<!-- /wp:paragraph -->';
    const insertAt = baseContent.indexOf('<!-- wp:heading');
    const modifiedContent = baseContent.slice(0, insertAt) + insertedBlock + '\n\n' + baseContent.slice(insertAt);

    const out = renderPreviewHtml(modifiedContent);
    expect(out).toContain('sottotuta sci per la neve');
    expect(out).toContain('href="https://example.com/sottotuta/"');
    // Sentence should appear between the intro and the heading
    expect(out.indexOf('sottotuta')).toBeGreaterThan(out.indexOf('Existing intro'));
    expect(out.indexOf('sottotuta')).toBeLessThan(out.indexOf('Il Base-Layer'));
  });
});
