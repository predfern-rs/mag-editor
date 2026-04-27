import { useState } from 'react';
import type { CarouselRecommendation as CarouselRec } from '../../lib/report-parser';
import type { PlacementOption } from '../../lib/smart-apply';
import { PlacementPicker } from './PlacementPicker';

export type CarouselStatus = 'pending' | 'applied' | 'skipped';

interface CarouselRecommendationProps {
  carousel: CarouselRec;
  status: CarouselStatus;
  onApplyMove?: (placement: PlacementOption, subheading?: string) => void;
  onApplyRemove?: () => void;
  onUndo?: () => void;
  onSkip?: () => void;
  onFindPlacements?: () => PlacementOption[];
  onPreview?: () => void;
}

export function CarouselRecommendationCard({
  carousel,
  status,
  onApplyMove,
  onApplyRemove,
  onUndo,
  onSkip,
  onFindPlacements,
  onPreview,
}: CarouselRecommendationProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [placements, setPlacements] = useState<PlacementOption[]>([]);
  const [subheading, setSubheading] = useState('');

  // KEEP and NONE are display-only — render a small pill, no actions.
  if (carousel.action === 'keep') {
    return (
      <PassivePill
        tone="green"
        label="Carousel correctly placed"
        detail={positionLabel(carousel)}
      />
    );
  }
  if (carousel.action === 'none') {
    return (
      <PassivePill
        tone="gray"
        label="No carousel detected"
        detail="The report does not require a carousel for this article's funnel stage."
      />
    );
  }

  // Applied state shows a confirmation row with Preview + Undo.
  if (status === 'applied') {
    return (
      <div className="border-l-4 border-l-green-300 rounded-lg bg-green-50/70 border border-green-200 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-green-600">✓</span>
          <span className="text-xs font-medium text-green-700">
            {carousel.action === 'remove' ? 'Carousel removed' : 'Carousel moved'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {onPreview && (
            <button
              onClick={onPreview}
              className="text-[11px] font-medium text-blue-600 hover:text-blue-800"
              title="See where the carousel landed"
            >
              Preview changes
            </button>
          )}
          {onUndo && (
            <button
              onClick={onUndo}
              className="text-[11px] font-medium text-gray-500 hover:text-gray-700"
            >
              Undo
            </button>
          )}
        </div>
      </div>
    );
  }

  // Skipped state.
  if (status === 'skipped') {
    return (
      <PassivePill
        tone="gray"
        label={`Carousel ${actionLabel(carousel)} skipped`}
        detail="Re-open by reloading the article."
      />
    );
  }

  // MOVE_TO_BOTTOM: amber, with "Show suggestions" → PlacementPicker
  if (carousel.action === 'move_to_bottom') {
    return (
      <div className="border-l-4 border-l-amber-500 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">
                Move
              </span>
              <span className="text-xs font-semibold text-amber-900">
                Move carousel to the bottom of the article
              </span>
            </div>
            <p className="mt-1 text-[11px] text-amber-800/80 leading-relaxed">
              {positionDetail(carousel)}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => {
                if (!onFindPlacements) return;
                setPlacements(onFindPlacements());
                setPickerOpen(true);
              }}
              disabled={!onFindPlacements}
              className="px-2.5 py-1 text-[11px] font-medium text-amber-800 bg-amber-100 border border-amber-300 rounded-md hover:bg-amber-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Show suggestions
            </button>
            {onSkip && (
              <button
                onClick={onSkip}
                className="px-2 py-1 text-[11px] font-medium text-gray-500 hover:text-gray-700"
              >
                Skip
              </button>
            )}
          </div>
        </div>
        <div className="mt-3">
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-amber-700 mb-1">
            Optional subheading above carousel <span className="font-normal text-amber-600/70 normal-case">— renders as bold paragraph; leave blank to omit</span>
          </label>
          <input
            type="text"
            value={subheading}
            onChange={(e) => setSubheading(e.target.value)}
            placeholder="e.g. Meet the team, Get inspired, Our experts"
            className="w-full px-2.5 py-1.5 text-xs bg-white border border-amber-300 rounded-md focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30"
          />
        </div>
        {pickerOpen && (
          <PlacementPicker
            options={placements}
            onSelect={(opt) => {
              onApplyMove?.(opt, subheading.trim() || undefined);
              setPickerOpen(false);
            }}
            onCancel={() => setPickerOpen(false)}
          />
        )}
      </div>
    );
  }

  // REMOVE: red, single one-click button
  if (carousel.action === 'remove') {
    return (
      <div className="border-l-4 border-l-red-500 rounded-lg bg-red-50 border border-red-200 px-4 py-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wide bg-red-100 text-red-700 rounded px-1.5 py-0.5">
              Remove
            </span>
            <span className="text-xs font-semibold text-red-900">
              Remove carousel
            </span>
          </div>
          <p className="mt-1 text-[11px] text-red-800/80 leading-relaxed">
            {positionDetail(carousel)} The funnel-stage rule does not allow a carousel here.
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onApplyRemove}
            disabled={!onApplyRemove}
            className="px-2.5 py-1 text-[11px] font-medium text-red-700 bg-red-100 border border-red-300 rounded-md hover:bg-red-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Remove carousel
          </button>
          {onSkip && (
            <button
              onClick={onSkip}
              className="px-2 py-1 text-[11px] font-medium text-gray-500 hover:text-gray-700"
            >
              Skip
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}

function PassivePill({ tone, label, detail }: { tone: 'green' | 'gray'; label: string; detail?: string }) {
  const colors =
    tone === 'green'
      ? 'bg-green-50 border-green-200 text-green-800'
      : 'bg-gray-50 border-gray-200 text-gray-600';
  return (
    <div className={`rounded-lg border ${colors} px-3 py-2`}>
      <span className="text-xs font-medium">{label}</span>
      {detail && <span className="text-[11px] ml-2 opacity-70">{detail}</span>}
    </div>
  );
}

function positionLabel(carousel: CarouselRec): string | undefined {
  if (carousel.positionPct === undefined) return undefined;
  return `currently at ${carousel.positionPct}%${carousel.positionRegion ? ` (${carousel.positionRegion})` : ''}`;
}

function positionDetail(carousel: CarouselRec): string {
  const pos = positionLabel(carousel);
  return pos ? `Carousel ${pos}.` : 'Carousel position flagged by the report.';
}

function actionLabel(carousel: CarouselRec): string {
  if (carousel.action === 'move_to_bottom') return 'move';
  if (carousel.action === 'remove') return 'remove';
  return 'change';
}
