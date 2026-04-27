import { useMemo, useEffect, useRef } from 'react';
import type { LinkRecommendation } from '../../lib/report-parser';
import { renderPreviewHtml } from '../../lib/preview-html';

interface ReviewPreviewProps {
  newContent: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** When set, the preview scrolls to and highlights the change from this recommendation */
  scrollToRec?: LinkRecommendation | null;
}

export function ReviewPreview({
  newContent,
  isOpen,
  onClose,
  onConfirm,
  scrollToRec,
}: ReviewPreviewProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const cleanHtml = useMemo(
    () => (isOpen ? renderPreviewHtml(newContent) : ''),
    [newContent, isOpen],
  );

  // Auto-scroll to the changed area when the preview opens
  useEffect(() => {
    if (!isOpen || !scrollToRec || !contentRef.current) return;

    // Small delay to let the DOM render
    const timer = setTimeout(() => {
      const container = contentRef.current;
      if (!container) return;

      let target: Element | null = null;

      if (scrollToRec.action === 'add') {
        // For ADD: find the newly inserted link by its target URL
        const url = scrollToRec.targetUrl;
        const links = container.querySelectorAll('a');
        for (const link of links) {
          const href = link.getAttribute('href') ?? '';
          if (href === url || href === url + '/' || href + '/' === url) {
            target = link;
            break;
          }
        }
        // Fallback: search for anchor text
        if (!target && scrollToRec.anchor) {
          const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
          let node: Text | null;
          while ((node = walker.nextNode() as Text | null)) {
            if (node.textContent?.includes(scrollToRec.anchor)) {
              target = node.parentElement;
              break;
            }
          }
        }
      } else if (scrollToRec.action === 'remove') {
        // For REMOVE: the link is gone, so search for surrounding text.
        // Find text near where the link was by looking for the anchor text
        // (which may still exist if keepText was true) or nearby context.
        // Best heuristic: search for the recommendation's anchor text in visible content
        if (scrollToRec.anchor) {
          const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
          let node: Text | null;
          while ((node = walker.nextNode() as Text | null)) {
            if (node.textContent?.includes(scrollToRec.anchor)) {
              target = node.parentElement;
              break;
            }
          }
        }
      }

      if (target) {
        // Highlight the element
        const el = target as HTMLElement;
        el.style.transition = 'background-color 0.3s';
        el.style.backgroundColor = '#fef08a'; // yellow highlight
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Fade out highlight after 2 seconds
        setTimeout(() => {
          el.style.backgroundColor = '';
        }, 2500);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [isOpen, scrollToRec]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-gray-50 rounded-t-xl">
          <div>
            <h2 className="text-base font-bold text-gray-800">Review — Article Preview</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              This is how the article will look after your changes
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors">✕</button>
        </div>

        {/* Rendered content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-8 py-6">
            <div
              ref={contentRef}
              className="prose prose-sm max-w-none content-preview"
              dangerouslySetInnerHTML={{ __html: cleanHtml }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            Back to Editing
          </button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
            Save to WordPress
          </button>
        </div>
      </div>
    </div>
  );
}
