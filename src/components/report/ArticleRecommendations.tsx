import { useMemo, useState } from 'react';
import type { ArticleAudit, LinkRecommendation } from '../../lib/report-parser';
import type { PlacementOption } from '../../lib/smart-apply';
import { RecommendationCard } from './RecommendationCard';
import { ContentPreviewModal } from '../editor/ContentPreviewModal';
import { getArticleUrls, detectSiteFromWpUrl } from '../../lib/url-mapping';
import { getActiveSite } from '../../config';

type RecStatus = 'pending' | 'applied' | 'skipped';

interface ArticleRecommendationsProps {
  article: ArticleAudit;
  onApplyRecommendation: (rec: LinkRecommendation, index: number, keepText?: boolean) => void;
  onUndoRecommendation?: (index: number) => void;
  onPreviewChanges?: () => void;
  onTellMeWhere?: (rec: LinkRecommendation) => void;
  onFindPlacements?: (rec: LinkRecommendation) => PlacementOption[];
  onApplyAtPlacement?: (rec: LinkRecommendation, index: number, option: PlacementOption) => void;
  onSendInstruction?: (instruction: string) => void;
  recommendationStatuses: Record<number, RecStatus>;
  onUpdateRecStatus: (index: number, status: 'applied' | 'skipped') => void;
  renderedHtml?: string;
  wpPostId?: number;
}

interface SectionDef {
  key: string;
  title: string;
  headerColor: string;
  dotColor: string;
  actions: ('add' | 'keep' | 'remove')[];
}

const SECTIONS: SectionDef[] = [
  {
    key: 'add',
    title: 'Links to Add',
    headerColor: 'text-green-700',
    dotColor: 'bg-green-500',
    actions: ['add'],
  },
  {
    key: 'keep',
    title: 'Links to Keep',
    headerColor: 'text-gray-600',
    dotColor: 'bg-gray-400',
    actions: ['keep'],
  },
  {
    key: 'remove',
    title: 'Links to Remove',
    headerColor: 'text-red-700',
    dotColor: 'bg-red-500',
    actions: ['remove'],
  },
];

export function ArticleRecommendations({
  article,
  onApplyRecommendation,
  onUndoRecommendation,
  onPreviewChanges,
  onTellMeWhere,
  onFindPlacements,
  onApplyAtPlacement,
  onSendInstruction,
  recommendationStatuses,
  onUpdateRecStatus,
  renderedHtml,
  wpPostId,
}: ArticleRecommendationsProps) {
  const [previewOpen, setPreviewOpen] = useState(false);

  // Extract slug from URL
  const slug = article.url.replace(/\/$/, '').split('/').pop() || article.id;
  const grouped = useMemo(() => {
    const result: Record<string, { rec: LinkRecommendation; originalIndex: number }[]> = {
      add: [],
      keep: [],
      remove: [],
    };
    article.recommendations.forEach((rec, i) => {
      const bucket = result[rec.action];
      if (bucket) bucket.push({ rec, originalIndex: i });
    });
    return result;
  }, [article.recommendations]);

  return (
    <div className="space-y-5">
      {/* Article header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-lg font-bold text-gray-800 leading-snug">
          {article.title}
        </h2>

        <div className="flex items-center gap-3 mt-2">
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:underline"
          >
            {article.url}
          </a>
          <button
            onClick={() => setPreviewOpen(true)}
            disabled={!renderedHtml}
            className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
          >
            👁️ Preview Article
          </button>
        </div>

        {/* Quick actions */}
        {onSendInstruction && (
          <div className="flex items-center gap-2 mt-3">
            <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Shortcode:</span>
            <button
              onClick={() => onSendInstruction(
                `Add a global carousel shortcode to this article. Insert the following block:\n\n<!-- wp:shortcode -->\n[global_carousel_people_list id="1"]\n<!-- /wp:shortcode -->\n\nPlace it [ABOVE / BELOW] this text from the article:\n[PASTE THE EXACT HEADING OR SENTENCE FROM THE ARTICLE WHERE YOU WANT IT]`
              )}
              className="px-2.5 py-1 text-[11px] font-medium text-purple-600 bg-purple-50 border border-purple-200 rounded-md hover:bg-purple-100 transition-colors"
            >
              + Add Carousel
            </button>
            <button
              onClick={() => onSendInstruction(
                `Remove the global carousel shortcode from this article. Find and remove the entire block:\n\n<!-- wp:shortcode -->\n[global_carousel_people_list id="1"]\n<!-- /wp:shortcode -->\n\nRemove it completely including the wp:shortcode block comments.`
              )}
              className="px-2.5 py-1 text-[11px] font-medium text-red-500 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors"
            >
              - Remove Carousel
            </button>
          </div>
        )}

        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {article.funnelStage && (
            <Badge label={article.funnelStage} variant="blue" />
          )}
          {article.context && (
            <Badge label={article.context} variant="purple" />
          )}
          {article.role && (
            <Badge
              label={article.role}
              variant={article.role.toLowerCase().includes('pillar') ? 'indigo' : 'gray'}
            />
          )}
          {article.cluster && (
            <Badge label={article.cluster} variant="teal" />
          )}
        </div>

        {/* Reasoning */}
        {article.reasoning && (
          <div className="mt-4 border-l-4 border-blue-300 bg-blue-50 rounded-r-lg px-4 py-3">
            <div className="text-[10px] font-semibold text-blue-600 mb-1 uppercase tracking-wide">
              Editorial Reasoning
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">
              {article.reasoning}
            </p>
          </div>
        )}
      </div>

      {/* Recommendation sections */}
      {SECTIONS.map((section) => {
        const items = grouped[section.key];
        if (!items || items.length === 0) return null;

        return (
          <div key={section.key}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`w-2 h-2 rounded-full ${section.dotColor}`} />
              <h3 className={`text-sm font-bold ${section.headerColor}`}>
                {section.title}
              </h3>
              <span className="text-xs text-gray-400">({items.length})</span>
            </div>

            <div className="space-y-2">
              {items.map(({ rec, originalIndex }) => (
                <RecommendationCard
                  key={originalIndex}
                  rec={rec}
                  index={originalIndex}
                  status={recommendationStatuses[originalIndex] ?? 'pending'}
                  onApply={(keepText) => onApplyRecommendation(rec, originalIndex, keepText)}
                  onUndo={onUndoRecommendation ? () => onUndoRecommendation(originalIndex) : undefined}
                  onPreview={onPreviewChanges}
                  onTellMeWhere={onTellMeWhere ? () => onTellMeWhere(rec) : undefined}
                  onFindPlacements={onFindPlacements ? () => onFindPlacements(rec) : undefined}
                  onApplyAtPlacement={onApplyAtPlacement ? (opt) => onApplyAtPlacement(rec, originalIndex, opt) : undefined}
                  onUpdateStatus={(s) => onUpdateRecStatus(originalIndex, s)}
                />
              ))}
            </div>
          </div>
        );
      })}

      <ContentPreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        html={renderedHtml || '<p class="text-gray-400">Loading article content...</p>'}
        title={article.title}
        slug={slug}
        articleUrls={(() => {
          const detected = detectSiteFromWpUrl(article.url);
          const siteId = detected?.siteId || getActiveSite().id;
          const lang = detected?.lang || 'en';
          return getArticleUrls(siteId, lang, slug, article.url, wpPostId);
        })()}
      />
    </div>
  );
}

type BadgeVariant = 'blue' | 'green' | 'purple' | 'indigo' | 'teal' | 'gray' | 'yellow' | 'red';

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-green-100 text-green-700',
  purple: 'bg-purple-100 text-purple-700',
  indigo: 'bg-indigo-100 text-indigo-700',
  teal: 'bg-teal-100 text-teal-700',
  gray: 'bg-gray-100 text-gray-600',
  yellow: 'bg-yellow-100 text-yellow-700',
  red: 'bg-red-100 text-red-700',
};

function Badge({ label, variant }: { label: string; variant: BadgeVariant }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${VARIANT_CLASSES[variant]}`}>
      {label}
    </span>
  );
}
