import { useState } from 'react';
import type { LinkRecommendation } from '../../lib/report-parser';
import type { PlacementOption } from '../../lib/smart-apply';
import { PlacementPicker } from './PlacementPicker';

type RecStatus = 'pending' | 'applied' | 'skipped' | 'needs-manual';

interface RecommendationCardProps {
  rec: LinkRecommendation;
  index: number;
  status: RecStatus;
  onApply: (keepText?: boolean) => void;
  onUndo?: () => void;
  onPreview?: () => void;
  onTellMeWhere?: () => void;
  onFindPlacements?: () => PlacementOption[];
  onApplyAtPlacement?: (option: PlacementOption) => void;
  onUpdateStatus: (status: 'applied' | 'skipped') => void;
  /**
   * KEEP recs only: the hinted section this link should live in, when the
   * link is not currently there. Rendering the relocate UI depends on this.
   */
  relocationTarget?: string | null;
  onFindRelocatePlacements?: () => PlacementOption[];
  onRelocateAtPlacement?: (option: PlacementOption, anchorOverride?: string) => void;
}

const ACTION_STYLES: Record<string, { border: string; borderApplied: string; badge: string; badgeText: string }> = {
  add: {
    border: 'border-l-green-500',
    borderApplied: 'border-l-green-300',
    badge: 'bg-green-100 text-green-700',
    badgeText: 'ADD',
  },
  keep: {
    border: 'border-l-gray-300',
    borderApplied: 'border-l-gray-200',
    badge: 'bg-gray-100 text-gray-600',
    badgeText: 'KEEP',
  },
  remove: {
    border: 'border-l-red-500',
    borderApplied: 'border-l-red-300',
    badge: 'bg-red-100 text-red-700',
    badgeText: 'REMOVE',
  },
};

export function RecommendationCard({
  rec,
  index: _index,
  status,
  onApply,
  onUndo,
  onPreview,
  onTellMeWhere,
  onFindPlacements,
  onApplyAtPlacement,
  onUpdateStatus,
  relocationTarget,
  onFindRelocatePlacements,
  onRelocateAtPlacement,
}: RecommendationCardProps) {
  const style = ACTION_STYLES[rec.action] ?? ACTION_STYLES.keep;

  if (status === 'applied') {
    return (
      <div className={`border-l-4 ${style.borderApplied} rounded-lg bg-green-50/50 border border-green-200 p-3 transition-all`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-green-600">✓</span>
            <span className="text-xs font-medium text-green-700">
              {rec.action === 'add' ? 'Link added' : 'Link removed'}
            </span>
            {rec.anchor && (
              <span className="text-xs text-green-600/70">"{rec.anchor}"</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {onPreview && (
              <button
                onClick={onPreview}
                className="px-2 py-1 text-[11px] font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors"
              >
                👁️ Preview
              </button>
            )}
            {onUndo && (
              <button
                onClick={onUndo}
                className="px-2 py-1 text-[11px] font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded hover:bg-amber-100 transition-colors"
              >
                ↩ Undo
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (status === 'needs-manual') {
    return (
      <div className="border-l-4 border-l-amber-400 rounded-lg bg-amber-50 border border-amber-200 p-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-amber-600">⚠</span>
            <span className="text-xs font-medium text-amber-700">Needs manual placement</span>
            {rec.anchor && (
              <span className="text-xs text-amber-600/80 truncate">"{rec.anchor}"</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {onTellMeWhere && (
              <button
                onClick={onTellMeWhere}
                className="px-2 py-1 text-[11px] font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors"
              >
                Tell me where
              </button>
            )}
            <button
              onClick={() => onApply()}
              className="px-2 py-1 text-[11px] font-medium text-green-600 bg-green-50 border border-green-200 rounded hover:bg-green-100 transition-colors"
            >
              Retry apply
            </button>
            <button
              onClick={() => onUpdateStatus('skipped')}
              className="text-[10px] text-gray-500 hover:underline"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'skipped') {
    return (
      <div className="border-l-4 border-l-gray-200 rounded-lg bg-gray-50 border border-gray-200 p-3 opacity-60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-gray-400">—</span>
            <span className="text-xs text-gray-400 line-through">
              {rec.anchor || rec.targetUrl}
            </span>
            <span className="text-[10px] text-gray-400">Skipped</span>
          </div>
          <button
            onClick={() => onUpdateStatus('applied')}
            className="text-[10px] text-blue-500 hover:underline"
          >
            Restore
          </button>
        </div>
      </div>
    );
  }

  // Pending state — full card
  return (
    <div className={`border-l-4 ${style.border} rounded-lg bg-white border border-gray-100 shadow-sm p-4`}>
      {/* Header */}
      <div className="flex items-start gap-2 flex-wrap">
        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${style.badge}`}>
          {style.badgeText}
        </span>
        {rec.anchor && (
          <span className="text-sm font-semibold text-gray-800">{rec.anchor}</span>
        )}
        {rec.targetUrl && (
          <>
            {rec.anchor && <span className="text-gray-400 text-sm">&rarr;</span>}
            <a
              href={rec.targetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline truncate max-w-xs"
              title={rec.targetUrl}
            >
              {rec.targetUrl}
            </a>
          </>
        )}
      </div>

      {/* Reason */}
      {rec.reason && (
        <p className="mt-2 text-xs text-gray-500 leading-relaxed">{rec.reason}</p>
      )}

      {/* Suggested sentence */}
      {rec.action === 'add' && rec.suggestedSentence && (
        <div className="mt-3 rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
          <div className="text-[10px] font-semibold text-amber-600 mb-1">Suggested sentence</div>
          <p className="text-xs text-gray-700 leading-relaxed">{rec.suggestedSentence}</p>
        </div>
      )}

      {/* Actions (not for KEEP) */}
      {rec.action !== 'keep' && (
        <RemoveOrApplyActions
          rec={rec}
          onApply={onApply}
          onTellMeWhere={onTellMeWhere}
          onFindPlacements={onFindPlacements}
          onApplyAtPlacement={onApplyAtPlacement}
          onUpdateStatus={onUpdateStatus}
        />
      )}

      {/* KEEP-only: relocate action when the audit hint says this link
          should sit in a different section than where it currently lives. */}
      {rec.action === 'keep' && relocationTarget && onFindRelocatePlacements && onRelocateAtPlacement && (
        <RelocateActions
          targetSection={relocationTarget}
          defaultAnchor={rec.anchor}
          onFindPlacements={onFindRelocatePlacements}
          onRelocateAtPlacement={onRelocateAtPlacement}
        />
      )}
    </div>
  );
}

/** Action buttons — with "keep text" toggle for REMOVE actions */
function RemoveOrApplyActions({
  rec,
  onApply,
  onTellMeWhere,
  onFindPlacements,
  onApplyAtPlacement,
  onUpdateStatus,
}: {
  rec: LinkRecommendation;
  onApply: (keepText?: boolean) => void;
  onTellMeWhere?: () => void;
  onFindPlacements?: () => PlacementOption[];
  onApplyAtPlacement?: (option: PlacementOption) => void;
  onUpdateStatus: (status: 'applied' | 'skipped') => void;
}) {
  const [keepText, setKeepText] = useState(false);
  const [placements, setPlacements] = useState<PlacementOption[] | null>(null);

  const handleShowPlaces = () => {
    if (onFindPlacements) {
      const options = onFindPlacements();
      setPlacements(options);
    }
  };

  return (
    <div className="mt-3 space-y-2">
      {rec.action === 'remove' && (
        <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
          <input
            type="checkbox"
            checked={keepText}
            onChange={(e) => setKeepText(e.target.checked)}
            className="rounded border-gray-300"
          />
          Keep text, only remove the link
        </label>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => onApply(keepText)}
          className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
        >
          {rec.action === 'remove' ? (keepText ? 'Remove Link' : 'Remove Link & Text') : 'Apply'}
        </button>
        {rec.action === 'add' && rec.suggestedSentence && onFindPlacements && (
          <button
            onClick={handleShowPlaces}
            className="px-3 py-1.5 text-xs font-medium text-indigo-600 bg-white border border-indigo-300 rounded-md hover:bg-indigo-50 transition-colors"
          >
            Show places
          </button>
        )}
        {rec.action === 'add' && rec.suggestedSentence && onTellMeWhere && (
          <button
            onClick={onTellMeWhere}
            className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-white border border-blue-300 rounded-md hover:bg-blue-50 transition-colors"
          >
            Tell me where
          </button>
        )}
        <button
          onClick={() => onUpdateStatus('skipped')}
          className="px-3 py-1.5 text-xs font-medium text-gray-500 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
        >
          Skip
        </button>
      </div>

      {placements !== null && onApplyAtPlacement && (
        <PlacementPicker
          options={placements}
          onSelect={(opt) => {
            onApplyAtPlacement(opt);
            setPlacements(null);
          }}
          onCancel={() => setPlacements(null)}
        />
      )}
    </div>
  );
}

/** KEEP-only action row: badge + editable anchor + "Show placements" for link relocation. */
function RelocateActions({
  targetSection,
  defaultAnchor,
  onFindPlacements,
  onRelocateAtPlacement,
}: {
  targetSection: string;
  defaultAnchor: string;
  onFindPlacements: () => PlacementOption[];
  onRelocateAtPlacement: (option: PlacementOption, anchorOverride?: string) => void;
}) {
  const [placements, setPlacements] = useState<PlacementOption[] | null>(null);
  const [editedAnchor, setEditedAnchor] = useState(defaultAnchor);

  const handleShowPlaces = () => {
    const options = onFindPlacements();
    setPlacements(options);
  };

  const effectiveAnchor = editedAnchor.trim() || defaultAnchor;

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 border border-indigo-200 px-2 py-1 text-[11px] font-medium text-indigo-700">
          📍 Suggested move to "{targetSection}"
        </span>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-[11px] font-medium text-gray-500 whitespace-nowrap">
          Anchor text:
        </label>
        <input
          type="text"
          value={editedAnchor}
          onChange={(e) => setEditedAnchor(e.target.value)}
          className="flex-1 min-w-0 px-2 py-1 text-xs text-gray-800 border border-gray-300 rounded-md focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
          placeholder={defaultAnchor}
        />
        {editedAnchor !== defaultAnchor && (
          <button
            onClick={() => setEditedAnchor(defaultAnchor)}
            className="text-[11px] text-gray-400 hover:text-gray-600"
            title="Restore original anchor text"
          >
            reset
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleShowPlaces}
          disabled={effectiveAnchor.length === 0}
          className="px-3 py-1.5 text-xs font-medium text-indigo-600 bg-white border border-indigo-300 rounded-md hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Show placements
        </button>
      </div>

      {placements !== null && (
        placements.length === 0 ? (
          <div className="text-xs text-gray-500 italic">
            No placement options found in "{targetSection}" — the section may
            be empty or the heading couldn't be matched.
            <button
              onClick={() => setPlacements(null)}
              className="ml-2 text-indigo-600 hover:underline"
            >
              Dismiss
            </button>
          </div>
        ) : (
          <PlacementPicker
            options={placements}
            onSelect={(opt) => {
              onRelocateAtPlacement(opt, effectiveAnchor);
              setPlacements(null);
            }}
            onCancel={() => setPlacements(null)}
          />
        )
      )}
    </div>
  );
}
