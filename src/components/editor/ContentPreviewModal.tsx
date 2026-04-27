import { useMemo } from 'react';
import type { ArticleUrls } from '../../lib/url-mapping';
import { renderPreviewHtml } from '../../lib/preview-html';

interface ContentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  html: string;
  title: string;
  slug: string;
  /** Legacy single URL — used if articleUrls not provided */
  liveUrl?: string;
  /** Full URL set from url-mapping */
  articleUrls?: ArticleUrls;
}

export function ContentPreviewModal({
  isOpen,
  onClose,
  html,
  title,
  slug,
  liveUrl,
  articleUrls,
}: ContentPreviewModalProps) {
  const renderedHtml = useMemo(() => (isOpen ? renderPreviewHtml(html) : ''), [html, isOpen]);

  if (!isOpen) return null;

  const wpUrl = articleUrls?.wordpress || liveUrl;
  const netlifyUrl = articleUrls?.netlify;
  const prodUrl = articleUrls?.live || liveUrl;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 flex-shrink-0 bg-gray-50 rounded-t-xl">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <span className="text-lg">👁️</span>
              <div>
                <h2 className="text-sm font-bold text-gray-800 truncate">{title}</h2>
                <p className="text-[10px] text-gray-400 font-mono mt-0.5">/{slug}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4">
            {netlifyUrl && (
              <a
                href={netlifyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-teal-700 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors"
                title="View on Netlify (build preview)"
              >
                <span>⚡</span> Netlify
              </a>
            )}
            {prodUrl && (
              <a
                href={prodUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                title="View live page (production)"
              >
                <span>🌐</span> Live Site
              </a>
            )}
            {wpUrl && (
              <a
                href={wpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-orange-700 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors"
                title="View in WordPress admin"
              >
                <span>📝</span> WordPress
              </a>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-8 py-6">
            <div
              className="prose prose-sm max-w-none content-preview"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-2.5 border-t border-gray-100 flex-shrink-0 bg-gray-50 rounded-b-xl">
          <span className="text-[10px] text-gray-400">
            Rendered content from WordPress
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
