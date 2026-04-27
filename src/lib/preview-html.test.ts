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
});
