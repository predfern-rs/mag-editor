import { useMemo, useState } from 'react';
import {
  parseBlocks,
  removeBlock,
  insertBlockAfter,
  insertBlockAtStart,
  buildAcfBlockMarkup,
  updateAcfBlockFields,
  replaceBlock,
} from '../../lib/block-parser';
import type { ParsedBlock } from '../../lib/block-parser';
import { MediaPreview, MediaPicker } from './MediaPicker';

const BLOCK_ICONS: Record<string, string> = {
  'paragraph': '¶',
  'heading': 'H',
  'list': '•',
  'image': '🖼️',
  'acf/custom-image': '🖼️',
  'acf/custom-video': '🎬',
  'acf/accordion': '📂',
  'acf/call-out-horizontal': '📊',
  'acf/call-out-conversation': '💬',
  'acf/call-out-bullet-list': '📋',
  'acf/custom-button': '🔘',
  'acf/custom-code-snippet': '💻',
  'acf/custom-google-map': '🗺️',
  'acf/image-quote': '💭',
  'acf/product-review': '⭐',
  'acf/numbered-heading': '#️⃣',
  'acf/people-list': '👥',
  'acf/product-comparison-table': '📊',
  'acf/simple-icon-list': '📝',
  'acf/simple-numbered-icon-list': '🔢',
  'acf/simple-quote': '❝',
  'acf/table-of-contents': '📑',
  'acf/image-icon-bullet-list': '📋',
};

const ACF_BLOCK_TYPES = [
  'custom-image',
  'custom-video',
  'accordion',
  'call-out-horizontal',
  'call-out-conversation',
  'call-out-bullet-list',
  'custom-button',
  'custom-code-snippet',
  'custom-google-map',
  'image-quote',
  'product-review',
  'numbered-heading',
  'people-list',
  'product-comparison-table',
  'simple-icon-list',
  'simple-numbered-icon-list',
  'simple-quote',
  'table-of-contents',
  'image-icon-bullet-list',
];

interface BlockManagerProps {
  content: string;
  onContentChange: (newContent: string) => void;
}

export function BlockManager({ content, onContentChange }: BlockManagerProps) {
  const blocks = useMemo(() => parseBlocks(content), [content]);
  const [expandedBlockId, setExpandedBlockId] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState<number | null>(null); // index to insert after, -1 for start
  const [filter, setFilter] = useState<'all' | 'acf'>('all');

  const acfBlocks = blocks.filter((b) => b.isAcf);
  const displayBlocks = filter === 'acf' ? acfBlocks : blocks;

  function handleDelete(block: ParsedBlock) {
    const newContent = removeBlock(content, block);
    onContentChange(newContent);
    setExpandedBlockId(null);
  }

  function handleUpdateFields(block: ParsedBlock, updatedFields: Record<string, string>) {
    const newMarkup = updateAcfBlockFields(block, updatedFields);
    const newContent = replaceBlock(content, block, newMarkup);
    onContentChange(newContent);
  }

  function handleAddBlock(blockType: string, afterIndex: number) {
    const markup = buildAcfBlockMarkup(blockType, {});
    let newContent: string;
    if (afterIndex === -1) {
      newContent = insertBlockAtStart(content, markup);
    } else {
      const afterBlock = blocks[afterIndex];
      if (!afterBlock) return;
      newContent = insertBlockAfter(content, afterBlock, markup);
    }
    onContentChange(newContent);
    setShowAddMenu(null);
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">
            {blocks.length} blocks
          </span>
          <span className="text-xs text-gray-400">
            ({acfBlocks.length} ACF)
          </span>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-md p-0.5">
          <button
            onClick={() => setFilter('all')}
            className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
              filter === 'all' ? 'bg-white text-gray-700 shadow-sm' : 'text-gray-500'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('acf')}
            className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
              filter === 'acf' ? 'bg-white text-gray-700 shadow-sm' : 'text-gray-500'
            }`}
          >
            ACF Only
          </button>
        </div>
      </div>

      {/* Add at start button */}
      <AddBlockButton
        onClick={() => setShowAddMenu(showAddMenu === -1 ? null : -1)}
        isOpen={showAddMenu === -1}
      />
      {showAddMenu === -1 && (
        <AddBlockMenu onSelect={(type) => handleAddBlock(type, -1)} onClose={() => setShowAddMenu(null)} />
      )}

      {/* Block list */}
      <div className="space-y-1">
        {displayBlocks.map((block, displayIdx) => {
          const realIdx = filter === 'acf' ? blocks.indexOf(block) : displayIdx;
          const isExpanded = expandedBlockId === block.blockId;

          return (
            <div key={`${block.blockId}-${block.startIndex}`}>
              {/* Block card */}
              <div
                className={`rounded-lg border transition-all ${
                  isExpanded
                    ? 'border-blue-200 bg-blue-50/50'
                    : block.isAcf
                      ? 'border-indigo-100 bg-white hover:border-indigo-200'
                      : 'border-gray-100 bg-white hover:border-gray-200'
                }`}
              >
                <div
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer"
                  onClick={() => setExpandedBlockId(isExpanded ? null : block.blockId)}
                >
                  {/* Icon */}
                  <span className="text-sm flex-shrink-0 w-6 text-center">
                    {BLOCK_ICONS[block.type] || (block.isAcf ? '🧩' : '📄')}
                  </span>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-mono px-1 py-0.5 rounded ${
                        block.isAcf ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {block.type}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 mt-0.5 truncate">
                      {block.label}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete this ${block.type} block?`)) handleDelete(block);
                      }}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                      title="Delete block"
                    >
                      🗑️
                    </button>
                    <span className="text-gray-300 text-xs">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Expanded view for ACF blocks */}
                {isExpanded && block.isAcf && (
                  <BlockFieldEditor
                    block={block}
                    onUpdateFields={(fields) => handleUpdateFields(block, fields)}
                  />
                )}

                {/* Expanded view for standard blocks */}
                {isExpanded && !block.isAcf && (
                  <div className="px-3 pb-3 border-t border-gray-100 mt-1 pt-2">
                    <pre className="text-[10px] font-mono text-gray-500 bg-gray-50 rounded p-2 max-h-32 overflow-auto whitespace-pre-wrap">
                      {block.innerContent || block.fullMarkup.substring(0, 300)}
                    </pre>
                  </div>
                )}
              </div>

              {/* Add block after this one */}
              <AddBlockButton
                onClick={() => setShowAddMenu(showAddMenu === realIdx ? null : realIdx)}
                isOpen={showAddMenu === realIdx}
              />
              {showAddMenu === realIdx && (
                <AddBlockMenu onSelect={(type) => handleAddBlock(type, realIdx)} onClose={() => setShowAddMenu(null)} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Field type detection ──

interface LinkValue {
  title: string;
  url: string;
  target?: string;
}

function parseLink(val: string): LinkValue | null {
  if (!val.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(val);
    if (parsed && typeof parsed === 'object' && 'url' in parsed) {
      return { title: parsed.title || '', url: parsed.url || '', target: parsed.target || '' };
    }
  } catch { /* not JSON */ }
  return null;
}

function isImageField(key: string, val: string): boolean {
  if (!val || isNaN(Number(val))) return false;
  const num = Number(val);
  if (num < 100) return false;
  const lk = key.toLowerCase();
  return lk.includes('image') || lk.includes('photo') || lk.includes('thumbnail') ||
    lk.includes('avatar') || lk.includes('featured');
}

function prettyFieldName(key: string): string {
  // Remove repeater prefixes like "people_list_0_people_list_group_"
  let clean = key.replace(/^[a-z_]+_\d+_[a-z_]+_group_/, '');
  clean = clean.replace(/^[a-z_]+_\d+_/, '');
  clean = clean.replace(/_/g, ' ');
  return clean.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Inline field editor for ACF blocks — with image previews + link editors */
function BlockFieldEditor({
  block,
  onUpdateFields,
}: {
  block: ParsedBlock;
  onUpdateFields: (fields: Record<string, string>) => void;
}) {
  const [editedFields, setEditedFields] = useState<Record<string, string>>({ ...block.fields });
  const [mediaPickerField, setMediaPickerField] = useState<string | null>(null);
  const hasChanges = JSON.stringify(editedFields) !== JSON.stringify(block.fields);

  const fieldEntries = Object.entries(editedFields).filter(([, val]) => val !== '');

  function handleMediaSelect(fieldKey: string, mediaId: number) {
    setEditedFields({ ...editedFields, [fieldKey]: String(mediaId) });
    setMediaPickerField(null);
  }

  function handleLinkChange(fieldKey: string, linkVal: LinkValue) {
    setEditedFields({ ...editedFields, [fieldKey]: JSON.stringify(linkVal) });
  }

  return (
    <div className="px-3 pb-3 border-t border-gray-100 mt-1 pt-2 space-y-2">
      <div className="max-h-96 overflow-y-auto space-y-2.5">
        {fieldEntries.map(([key, val]) => {
          const isImage = isImageField(key, val);
          const linkVal = parseLink(val);

          return (
            <div key={key}>
              <label className="block text-[9px] font-medium text-gray-500 mb-0.5" title={key}>
                {prettyFieldName(key)}
              </label>

              {/* Image field */}
              {isImage ? (
                <div className="flex items-start gap-2">
                  <div className="w-16 h-16 flex-shrink-0 rounded overflow-hidden border border-gray-200 bg-gray-50">
                    <MediaPreview mediaId={Number(val)} />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="text-[10px] font-mono text-gray-400">ID: {val}</div>
                    <button
                      onClick={() => setMediaPickerField(key)}
                      className="px-2 py-0.5 text-[10px] font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                    >
                      🔄 Replace
                    </button>
                  </div>
                </div>

              /* Link field */
              ) : linkVal ? (
                <LinkFieldEditor
                  value={linkVal}
                  onChange={(newLink) => handleLinkChange(key, newLink)}
                />

              /* Long text */
              ) : val.length > 80 ? (
                <textarea
                  value={editedFields[key] ?? ''}
                  onChange={(e) => setEditedFields({ ...editedFields, [key]: e.target.value })}
                  rows={2}
                  className="w-full rounded border border-gray-200 px-2 py-1 text-[11px] outline-none focus:border-blue-400 resize-y"
                />

              /* Default text input */
              ) : (
                <input
                  type="text"
                  value={editedFields[key] ?? ''}
                  onChange={(e) => setEditedFields({ ...editedFields, [key]: e.target.value })}
                  className="w-full rounded border border-gray-200 px-2 py-1 text-[11px] outline-none focus:border-blue-400"
                />
              )}
            </div>
          );
        })}
      </div>

      {fieldEntries.length === 0 && (
        <p className="text-[11px] text-gray-400 italic">No editable fields found</p>
      )}

      {hasChanges && (
        <div className="flex gap-1.5 pt-1">
          <button
            onClick={() => onUpdateFields(editedFields)}
            className="px-3 py-1 text-[11px] font-medium text-white bg-blue-500 rounded hover:bg-blue-600 transition-colors"
          >
            Update Block
          </button>
          <button
            onClick={() => setEditedFields({ ...block.fields })}
            className="px-3 py-1 text-[11px] font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
          >
            Reset
          </button>
        </div>
      )}

      {mediaPickerField && (
        <MediaPicker
          isOpen={true}
          currentMediaId={Number(editedFields[mediaPickerField] ?? 0)}
          onSelect={(id) => handleMediaSelect(mediaPickerField, id)}
          onClose={() => setMediaPickerField(null)}
        />
      )}
    </div>
  );
}

/** Inline editor for ACF link fields (JSON with title + url) */
function LinkFieldEditor({
  value,
  onChange,
}: {
  value: LinkValue;
  onChange: (v: LinkValue) => void;
}) {
  return (
    <div className="rounded border border-blue-100 bg-blue-50/50 p-2 space-y-1.5">
      <div>
        <label className="block text-[9px] text-blue-500 font-medium mb-0.5">Link Text</label>
        <input
          type="text"
          value={value.title}
          onChange={(e) => onChange({ ...value, title: e.target.value })}
          className="w-full rounded border border-blue-200 px-2 py-1 text-[11px] outline-none focus:border-blue-400 bg-white"
          placeholder="Link text"
        />
      </div>
      <div>
        <label className="block text-[9px] text-blue-500 font-medium mb-0.5">URL</label>
        <input
          type="text"
          value={value.url}
          onChange={(e) => onChange({ ...value, url: e.target.value })}
          className="w-full rounded border border-blue-200 px-2 py-1 text-[11px] font-mono outline-none focus:border-blue-400 bg-white"
          placeholder="https://..."
        />
      </div>
      {value.url && (
        <a
          href={value.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:underline"
        >
          🔗 {value.url.length > 50 ? value.url.substring(0, 50) + '...' : value.url}
        </a>
      )}
    </div>
  );
}

/** Small "+" button between blocks */
function AddBlockButton({ onClick, isOpen }: { onClick: () => void; isOpen: boolean }) {
  return (
    <div className="flex justify-center py-0.5">
      <button
        onClick={onClick}
        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all ${
          isOpen
            ? 'bg-blue-500 text-white'
            : 'bg-gray-100 text-gray-400 hover:bg-blue-100 hover:text-blue-500'
        }`}
        title="Add block here"
      >
        {isOpen ? '×' : '+'}
      </button>
    </div>
  );
}

/** Dropdown menu to pick which ACF block type to add */
function AddBlockMenu({ onSelect, onClose }: { onSelect: (type: string) => void; onClose: () => void }) {
  const [search, setSearch] = useState('');

  const filtered = ACF_BLOCK_TYPES.filter((t) =>
    t.replace(/-/g, ' ').includes(search.toLowerCase()),
  );

  return (
    <div className="rounded-lg border border-blue-200 bg-white shadow-lg p-2 mb-1">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search block types..."
        className="w-full rounded border border-gray-200 px-2 py-1 text-xs mb-2 outline-none focus:border-blue-400"
        autoFocus
      />
      <div className="max-h-48 overflow-y-auto space-y-0.5">
        {filtered.map((type) => (
          <button
            key={type}
            onClick={() => onSelect(type)}
            className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-blue-50 transition-colors flex items-center gap-2"
          >
            <span>{BLOCK_ICONS[`acf/${type}`] || '🧩'}</span>
            <span className="text-gray-700 font-medium">
              {type.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </span>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-gray-400 px-2 py-1">No matching blocks</p>
        )}
      </div>
      <button
        onClick={onClose}
        className="w-full mt-1 px-2 py-1 text-[10px] text-gray-400 hover:text-gray-600 text-center"
      >
        Cancel
      </button>
    </div>
  );
}
