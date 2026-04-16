import { useMemo, useState } from 'react';
import {
  findMatches,
  findLinks,
  replaceAll,
  replaceSingle,
  wrapTextInLink,
  updateLinkHref,
  updateLinkAnchorText,
  removeLink,
  buildLink,
} from '../../lib/find-replace';
import type { Match, LinkMatch } from '../../lib/find-replace';

type Mode = 'text' | 'add-link' | 'edit-links';

interface FindReplacePanelProps {
  content: string;
  onContentChange: (newContent: string) => void;
}

export function FindReplacePanel({ content, onContentChange }: FindReplacePanelProps) {
  const [mode, setMode] = useState<Mode>('add-link');

  return (
    <div className="space-y-3">
      {/* Mode tabs */}
      <div className="flex border-b border-gray-200">
        {([
          { id: 'add-link' as Mode, label: 'Add Link' },
          { id: 'edit-links' as Mode, label: 'Edit Links' },
          { id: 'text' as Mode, label: 'Text Replace' },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setMode(tab.id)}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
              mode === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {mode === 'add-link' && (
        <AddLinkMode content={content} onContentChange={onContentChange} />
      )}
      {mode === 'edit-links' && (
        <EditLinksMode content={content} onContentChange={onContentChange} />
      )}
      {mode === 'text' && (
        <TextReplaceMode content={content} onContentChange={onContentChange} />
      )}
    </div>
  );
}

/** Mode 1: Find text and wrap it in a link */
function AddLinkMode({ content, onContentChange }: FindReplacePanelProps) {
  const [findText, setFindText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [skipped, setSkipped] = useState<Set<number>>(new Set());

  const matches = useMemo(() => findMatches(content, findText), [content, findText]);
  const visible = matches.filter((_, i) => !skipped.has(i));

  function handleWrapInLink(match: Match) {
    if (!linkUrl) return;
    const newContent = wrapTextInLink(content, match, linkUrl);
    onContentChange(newContent);
    setSkipped(new Set());
  }

  function handleWrapAll() {
    if (!linkUrl || !findText) return;
    // Wrap all occurrences — process in reverse order to preserve indices
    let newContent = content;
    const sorted = [...matches].sort((a, b) => b.index - a.index);
    for (const match of sorted) {
      if (skipped.has(matches.indexOf(match))) continue;
      newContent = wrapTextInLink(newContent, match, linkUrl);
    }
    onContentChange(newContent);
    setFindText('');
    setLinkUrl('');
    setSkipped(new Set());
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">Find text and wrap it in a hyperlink.</p>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Find text</label>
        <input
          type="text"
          value={findText}
          onChange={(e) => { setFindText(e.target.value); setSkipped(new Set()); }}
          placeholder="e.g. waterproof jackets"
          className="w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Link URL</label>
        <input
          type="text"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="e.g. /magazine/waterproof-guide"
          className="w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {findText && linkUrl && (
        <div className="bg-blue-50 rounded p-2 text-xs">
          <span className="text-gray-500">Preview: </span>
          <code className="text-blue-700">{`<a href="${linkUrl}">${findText}</a>`}</code>
        </div>
      )}

      {findText && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {matches.length} match{matches.length !== 1 ? 'es' : ''} found
          </span>
          {matches.length > 0 && linkUrl && (
            <button
              onClick={handleWrapAll}
              className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-medium"
            >
              Link All
            </button>
          )}
        </div>
      )}

      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {visible.map((match) => {
          const idx = matches.indexOf(match);
          return (
            <MatchCard
              key={`${match.index}-${match.text}`}
              matchNum={idx + 1}
              blockType={match.blockType}
              contextBefore={match.context.before}
              matched={match.text}
              contextAfter={match.context.after}
              previewHtml={linkUrl ? `<a href="${linkUrl}">${match.text}</a>` : undefined}
              onAction={() => handleWrapInLink(match)}
              actionLabel="Add Link"
              onSkip={() => setSkipped((s) => new Set(s).add(idx))}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Mode 2: Browse and edit existing links */
function EditLinksMode({ content, onContentChange }: FindReplacePanelProps) {
  const [filterHref, setFilterHref] = useState('');
  const [filterText, setFilterText] = useState('');

  const allLinks = useMemo(() => findLinks(content), [content]);
  const filtered = useMemo(
    () =>
      findLinks(content, {
        href: filterHref || undefined,
        anchorText: filterText || undefined,
      }),
    [content, filterHref, filterText],
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Browse and edit existing links ({allLinks.length} total).
      </p>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Filter by URL</label>
          <input
            type="text"
            value={filterHref}
            onChange={(e) => setFilterHref(e.target.value)}
            placeholder="/magazine/..."
            className="w-full rounded border border-gray-300 px-2 py-1 text-xs outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Filter by text</label>
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="anchor text..."
            className="w-full rounded border border-gray-300 px-2 py-1 text-xs outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <span className="text-xs text-gray-500">
        {filtered.length} link{filtered.length !== 1 ? 's' : ''} shown
      </span>

      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {filtered.map((link) => (
          <LinkEditor
            key={`${link.index}-${link.href}`}
            link={link}
            content={content}
            onContentChange={onContentChange}
          />
        ))}
      </div>
    </div>
  );
}

/** Individual link editor card */
function LinkEditor({
  link,
  content,
  onContentChange,
}: {
  link: LinkMatch;
  content: string;
  onContentChange: (c: string) => void;
}) {
  const [editHref, setEditHref] = useState(link.href);
  const [editText, setEditText] = useState(link.anchorText);
  const [expanded, setExpanded] = useState(false);

  const hasChanges = editHref !== link.href || editText !== link.anchorText;

  function handleSave() {
    let newContent = content;
    if (editHref !== link.href) {
      newContent = updateLinkHref(newContent, link, editHref);
    }
    if (editText !== link.anchorText) {
      // Re-find the link after href change
      const updatedLinks = findLinks(newContent, { href: editHref });
      const updated = updatedLinks.find((l) => l.index === link.index);
      if (updated) {
        newContent = updateLinkAnchorText(newContent, updated, editText);
      }
    }
    onContentChange(newContent);
  }

  function handleRemoveLink() {
    const newContent = removeLink(content, link);
    onContentChange(newContent);
  }

  return (
    <div className="border border-gray-200 rounded-md p-2.5 text-xs">
      <div
        className="flex items-start justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="min-w-0 flex-1">
          <div className="font-medium text-gray-800 truncate">{link.anchorText}</div>
          <div className="text-blue-600 truncate text-[11px]">{link.href}</div>
          <div className="text-gray-400 text-[10px]">in {link.blockType}</div>
        </div>
        <span className="text-gray-400 ml-2 flex-shrink-0">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="mt-2 space-y-2 border-t border-gray-100 pt-2">
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">URL</label>
            <input
              type="text"
              value={editHref}
              onChange={(e) => setEditHref(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1 text-xs outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Anchor text</label>
            <input
              type="text"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1 text-xs outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex gap-1.5">
            {hasChanges && (
              <button
                onClick={handleSave}
                className="px-2.5 py-1 text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors text-[11px] font-medium"
              >
                Update Link
              </button>
            )}
            <button
              onClick={handleRemoveLink}
              className="px-2.5 py-1 text-red-600 bg-red-50 rounded hover:bg-red-100 transition-colors text-[11px]"
            >
              Remove Link
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Mode 3: Raw text find and replace (supports HTML in replacement) */
function TextReplaceMode({ content, onContentChange }: FindReplacePanelProps) {
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [skipped, setSkipped] = useState<Set<number>>(new Set());

  const matches = useMemo(() => findMatches(content, findText), [content, findText]);
  const visible = matches.filter((_, i) => !skipped.has(i));

  function handleReplaceOne(match: Match) {
    const newContent = replaceSingle(content, match, replaceText);
    onContentChange(newContent);
    setSkipped(new Set());
  }

  function handleReplaceAll() {
    const newContent = replaceAll(content, findText, replaceText);
    onContentChange(newContent);
    setFindText('');
    setReplaceText('');
    setSkipped(new Set());
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Find and replace raw text/HTML in the post content.
      </p>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Find</label>
        <textarea
          value={findText}
          onChange={(e) => { setFindText(e.target.value); setSkipped(new Set()); }}
          placeholder='e.g. waterproof jackets  or  <a href="/old">text</a>'
          rows={2}
          className="w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm font-mono outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-y"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Replace with</label>
        <textarea
          value={replaceText}
          onChange={(e) => setReplaceText(e.target.value)}
          placeholder='e.g. <a href="/magazine/waterproof-guide">waterproof jackets</a>'
          rows={2}
          className="w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm font-mono outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-y"
        />
      </div>

      {findText && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {matches.length} match{matches.length !== 1 ? 'es' : ''} found
          </span>
          {matches.length > 0 && replaceText && (
            <button
              onClick={handleReplaceAll}
              className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-medium"
            >
              Replace All
            </button>
          )}
        </div>
      )}

      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {visible.map((match) => {
          const idx = matches.indexOf(match);
          return (
            <MatchCard
              key={`${match.index}-${match.text}`}
              matchNum={idx + 1}
              blockType={match.blockType}
              contextBefore={match.context.before}
              matched={match.text}
              contextAfter={match.context.after}
              previewHtml={replaceText || undefined}
              onAction={() => handleReplaceOne(match)}
              actionLabel="Replace"
              onSkip={() => setSkipped((s) => new Set(s).add(idx))}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Reusable match card */
function MatchCard({
  matchNum,
  blockType,
  contextBefore,
  matched,
  contextAfter,
  previewHtml,
  onAction,
  actionLabel,
  onSkip,
}: {
  matchNum: number;
  blockType: string;
  contextBefore: string;
  matched: string;
  contextAfter: string;
  previewHtml?: string;
  onAction: () => void;
  actionLabel: string;
  onSkip: () => void;
}) {
  return (
    <div className="border border-gray-200 rounded-md p-2.5 text-xs">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-gray-500 font-medium">
          #{matchNum}
          {blockType !== 'unknown' && (
            <span className="ml-1 text-gray-400">in {blockType}</span>
          )}
        </span>
        <div className="flex gap-1.5">
          <button
            onClick={onSkip}
            className="px-2 py-0.5 text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
          >
            Skip
          </button>
          <button
            onClick={onAction}
            disabled={!previewHtml}
            className="px-2 py-0.5 text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors disabled:opacity-40"
          >
            {actionLabel}
          </button>
        </div>
      </div>

      <div className="font-mono bg-gray-50 rounded p-1.5 mb-1 break-all text-[11px] leading-relaxed">
        <span className="text-gray-400">{contextBefore}</span>
        <mark className="match-highlight font-semibold">{matched}</mark>
        <span className="text-gray-400">{contextAfter}</span>
      </div>

      {previewHtml && (
        <div className="font-mono bg-green-50 rounded p-1.5 break-all text-[11px] leading-relaxed">
          <span className="text-gray-400">{contextBefore}</span>
          <span className="text-green-700 font-semibold bg-green-100 px-0.5 rounded">
            {previewHtml}
          </span>
          <span className="text-gray-400">{contextAfter}</span>
        </div>
      )}
    </div>
  );
}
