import { describe, it, expect } from 'vitest';
import {
  parseBlocks,
  removeBlock,
  replaceBlock,
  buildAcfBlockMarkup,
  updateAcfBlockFields,
} from './block-parser';

describe('parseBlocks', () => {
  it('parses a self-closing ACF block', () => {
    const content = `<!-- wp:acf/custom-image {"name":"acf/custom-image","data":{"image":"12345","_image":"field_abc"},"mode":"preview","id":"block_xyz"} /-->`;
    const blocks = parseBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.type).toBe('acf/custom-image');
    expect(blocks[0]!.isAcf).toBe(true);
    expect(blocks[0]!.data).not.toBeNull();
    expect(blocks[0]!.blockId).toBe('block_xyz');
    // Private fields (starting with _) should be excluded from fields
    expect(blocks[0]!.fields).toEqual({ image: '12345' });
  });

  it('parses a nested core paragraph block', () => {
    const content = `<!-- wp:paragraph -->\n<p>Hello <strong>world</strong>.</p>\n<!-- /wp:paragraph -->`;
    const blocks = parseBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.type).toBe('paragraph');
    expect(blocks[0]!.isAcf).toBe(false);
    expect(blocks[0]!.innerContent).toContain('<strong>world</strong>');
    expect(blocks[0]!.label).toBe('Hello world.');
  });

  it('handles malformed JSON gracefully — data is null', () => {
    const content = `<!-- wp:acf/broken {not valid json} /-->`;
    const blocks = parseBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.data).toBeNull();
    expect(blocks[0]!.fields).toEqual({});
  });

  it('parses multiple blocks in sequence', () => {
    const content = `<!-- wp:heading -->\n<h2>Title</h2>\n<!-- /wp:heading -->\n\n<!-- wp:paragraph -->\n<p>Text here.</p>\n<!-- /wp:paragraph -->`;
    const blocks = parseBlocks(content);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.type).toBe('heading');
    expect(blocks[1]!.type).toBe('paragraph');
  });

  it('preserves link field objects as JSON strings in fields', () => {
    const linkObj = { title: 'Shop', url: 'https://example.com', target: '_blank' };
    const data = { name: 'acf/custom-button', data: { link: linkObj, _link: 'field_def' }, id: 'block_1' };
    const content = `<!-- wp:acf/custom-button ${JSON.stringify(data)} /-->`;
    const blocks = parseBlocks(content);
    expect(blocks[0]!.fields.link).toBe(JSON.stringify(linkObj));
  });
});

describe('removeBlock', () => {
  it('removes block and surrounding newlines', () => {
    const para1 = `<!-- wp:paragraph -->\n<p>First.</p>\n<!-- /wp:paragraph -->`;
    const para2 = `<!-- wp:paragraph -->\n<p>Second.</p>\n<!-- /wp:paragraph -->`;
    const content = `${para1}\n\n${para2}`;
    const blocks = parseBlocks(content);
    expect(blocks).toHaveLength(2);

    const result = removeBlock(content, blocks[1]!);
    expect(result.trim()).toBe(para1);
  });
});

describe('replaceBlock', () => {
  it('replaces block content while preserving surrounding text', () => {
    const content = `Before\n<!-- wp:paragraph -->\n<p>Old.</p>\n<!-- /wp:paragraph -->\nAfter`;
    const blocks = parseBlocks(content);
    const newMarkup = `<!-- wp:paragraph -->\n<p>New.</p>\n<!-- /wp:paragraph -->`;
    const result = replaceBlock(content, blocks[0]!, newMarkup);
    expect(result).toContain('Before');
    expect(result).toContain('After');
    expect(result).toContain('<p>New.</p>');
    expect(result).not.toContain('<p>Old.</p>');
  });
});

describe('buildAcfBlockMarkup', () => {
  it('creates a valid self-closing ACF block with fields', () => {
    const markup = buildAcfBlockMarkup('custom-image', { image: '999' });
    expect(markup).toMatch(/^<!-- wp:acf\/custom-image \{.*\} \/-->$/);
    const json = markup.match(/\{.*\}/)?.[0];
    expect(json).toBeDefined();
    const data = JSON.parse(json!);
    expect(data.name).toBe('acf/custom-image');
    expect(data.data.image).toBe('999');
    expect(data.id).toMatch(/^block_/);
    expect(data.mode).toBe('preview');
  });
});

describe('updateAcfBlockFields', () => {
  it('merges updated fields into existing block data', () => {
    const data = { name: 'acf/custom-image', data: { image: '100', caption: 'Old' }, id: 'block_1' };
    const content = `<!-- wp:acf/custom-image ${JSON.stringify(data)} /-->`;
    const blocks = parseBlocks(content);

    const newMarkup = updateAcfBlockFields(blocks[0]!, { caption: 'New', alt: 'Alt text' });
    const json = newMarkup.match(/\{.*\}/)?.[0];
    const newData = JSON.parse(json!);
    expect(newData.data.image).toBe('100'); // unchanged
    expect(newData.data.caption).toBe('New'); // updated
    expect(newData.data.alt).toBe('Alt text'); // added
  });

  it('returns original markup when block has no data', () => {
    const content = `<!-- wp:acf/broken {not valid} /-->`;
    const blocks = parseBlocks(content);
    const result = updateAcfBlockFields(blocks[0]!, { foo: 'bar' });
    expect(result).toBe(blocks[0]!.fullMarkup);
  });
});
