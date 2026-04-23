import { useState } from 'react';

interface SaveBarProps {
  hasChanges: boolean;
  isSaving: boolean;
  onSave: () => void;
  onReview?: () => void;
  onReviewChanges: () => void;
  onRevert?: () => Promise<void>;
  onDiscard?: () => void;
  lastSaved: Date | null;
  pendingCount?: number;
  onOpusReview?: () => void;
  opusReviewEnabled?: boolean;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function SaveBar({
  hasChanges,
  isSaving,
  onSave,
  onReview,
  onReviewChanges,
  onRevert,
  onDiscard,
  lastSaved,
  pendingCount,
  onOpusReview,
  opusReviewEnabled,
}: SaveBarProps) {
  const [isReverting, setIsReverting] = useState(false);
  const [revertMessage, setRevertMessage] = useState<string | null>(null);

  async function handleRevert() {
    if (!onRevert) return;
    if (!confirm('Revert to the previous version? This will restore the last saved content from WordPress revision history.')) return;

    setIsReverting(true);
    setRevertMessage(null);
    try {
      await onRevert();
      setRevertMessage('Reverted successfully');
      setTimeout(() => setRevertMessage(null), 3000);
    } catch (err) {
      setRevertMessage(err instanceof Error ? err.message : 'Revert failed');
      setTimeout(() => setRevertMessage(null), 5000);
    } finally {
      setIsReverting(false);
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-40">
      <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {hasChanges && (
            <span className="flex items-center gap-1.5 text-sm text-yellow-600">
              <span className="h-2 w-2 rounded-full bg-yellow-400" />
              {pendingCount ? `${pendingCount} edit${pendingCount > 1 ? 's' : ''} pending` : 'Unsaved changes'}
            </span>
          )}
          {onDiscard && hasChanges && (
            <button
              onClick={onDiscard}
              className="text-xs text-red-500 hover:text-red-700 transition-colors"
            >
              Discard all
            </button>
          )}
          {lastSaved && (
            <span className="text-xs text-gray-400">
              Last saved at {formatTime(lastSaved)}
            </span>
          )}
          {revertMessage && (
            <span className={`text-xs font-medium ${revertMessage.includes('success') ? 'text-green-600' : 'text-red-500'}`}>
              {revertMessage}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onRevert && (
            <button
              onClick={handleRevert}
              disabled={isReverting}
              className="px-3 py-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Revert to previous WordPress revision"
            >
              {isReverting ? '⏳ Reverting...' : '↩️ Revert Last Change'}
            </button>
          )}
          {onOpusReview && (
            <button
              onClick={onOpusReview}
              disabled={!opusReviewEnabled}
              className="px-3 py-2 text-xs font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 rounded-md hover:from-purple-700 hover:to-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title={opusReviewEnabled ? 'Minimal-change editorial polish preserving all locked links' : 'Apply at least one recommendation to enable'}
            >
              ✨ Mr Opus Review
            </button>
          )}
          {onReview && (
            <button
              onClick={onReview}
              disabled={!hasChanges}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              👁️ Review
            </button>
          )}
          <button
            onClick={onReviewChanges}
            disabled={!hasChanges}
            className="px-3 py-2 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Review Diff
          </button>
          <button
            onClick={onSave}
            disabled={!hasChanges || isSaving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isSaving && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            )}
            {isSaving ? 'Saving...' : 'Save to WordPress'}
          </button>
        </div>
      </div>
    </div>
  );
}
