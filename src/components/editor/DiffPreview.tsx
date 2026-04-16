import { useMemo } from 'react';
import { computeDiff } from '../../lib/diff';

interface DiffPreviewProps {
  oldContent: string;
  newContent: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DiffPreview({
  oldContent,
  newContent,
  isOpen,
  onClose,
  onConfirm,
}: DiffPreviewProps) {
  const diffLines = useMemo(
    () => (isOpen ? computeDiff(oldContent, newContent) : []),
    [oldContent, newContent, isOpen],
  );

  if (!isOpen) return null;

  const addedCount = diffLines.filter((l) => l.type === 'added').length;
  const removedCount = diffLines.filter((l) => l.type === 'removed').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[85vh] flex flex-col mx-4">
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-gray-50 rounded-t-xl">
          <div>
            <h2 className="text-base font-bold text-gray-800">Review Diff (Raw HTML)</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              <span className="text-green-600 font-medium">+{addedCount} added</span>
              {' / '}
              <span className="text-red-600 font-medium">-{removedCount} removed</span>
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors">✕</button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <div className="font-mono text-xs leading-relaxed">
            {diffLines.map((line, i) => (
              <div
                key={i}
                className={`px-3 py-0.5 ${
                  line.type === 'added'
                    ? 'bg-green-50 text-green-800'
                    : line.type === 'removed'
                      ? 'bg-red-50 text-red-800 line-through'
                      : ''
                }`}
              >
                <span className="inline-block w-6 text-gray-400 select-none mr-2">
                  {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                </span>
                {line.text || '\u00A0'}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">Apply Changes</button>
        </div>
      </div>
    </div>
  );
}
