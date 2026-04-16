import { useState, useMemo } from 'react';
import type { ArticleAudit } from '../../lib/report-parser';

type ArticleStatus = 'not-started' | 'in-progress' | 'done';

interface ReportArticleListProps {
  articles: ArticleAudit[];
  selectedArticleId: string | null;
  onSelectArticle: (id: string) => void;
  articleStatuses: Record<string, ArticleStatus>;
}

const FUNNEL_FILTERS = ['All', 'TOF', 'MOF', 'BOF'] as const;
const STATUS_FILTERS = ['All', 'Not Started', 'In Progress', 'Done'] as const;

type FunnelFilter = (typeof FUNNEL_FILTERS)[number];
type StatusFilter = (typeof STATUS_FILTERS)[number];

export function ReportArticleList({
  articles,
  selectedArticleId,
  onSelectArticle,
  articleStatuses,
}: ReportArticleListProps) {
  const [search, setSearch] = useState('');
  const [clusterFilter, setClusterFilter] = useState('All');
  const [funnelFilter, setFunnelFilter] = useState<FunnelFilter>('All');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');

  const clusters = useMemo(() => {
    const set = new Set(articles.map((a) => a.cluster).filter(Boolean));
    return ['All', ...Array.from(set).sort()];
  }, [articles]);

  const filtered = useMemo(() => {
    return articles.filter((a) => {
      if (search && !a.title.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      if (clusterFilter !== 'All' && a.cluster !== clusterFilter) return false;
      if (funnelFilter !== 'All') {
        const stage = a.funnelStage.toUpperCase();
        if (!stage.includes(funnelFilter)) return false;
      }
      if (statusFilter !== 'All') {
        const status = articleStatuses[a.id] ?? 'not-started';
        const map: Record<StatusFilter, ArticleStatus | null> = {
          All: null,
          'Not Started': 'not-started',
          'In Progress': 'in-progress',
          Done: 'done',
        };
        if (map[statusFilter] && status !== map[statusFilter]) return false;
      }
      return true;
    });
  }, [articles, search, clusterFilter, funnelFilter, statusFilter, articleStatuses]);

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="p-3 space-y-2 border-b border-gray-100 flex-shrink-0">
        {/* Search */}
        <input
          type="text"
          placeholder="Search articles..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
        />

        {/* Filter row */}
        <div className="flex gap-1.5">
          <select
            value={clusterFilter}
            onChange={(e) => setClusterFilter(e.target.value)}
            className="flex-1 min-w-0 rounded-md border border-gray-200 px-2 py-1 text-[10px] text-gray-600 outline-none focus:border-blue-400"
          >
            {clusters.map((c) => (
              <option key={c} value={c}>
                {c === 'All' ? 'All Clusters' : c}
              </option>
            ))}
          </select>

          <select
            value={funnelFilter}
            onChange={(e) => setFunnelFilter(e.target.value as FunnelFilter)}
            className="w-16 rounded-md border border-gray-200 px-1.5 py-1 text-[10px] text-gray-600 outline-none focus:border-blue-400"
          >
            {FUNNEL_FILTERS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="w-24 rounded-md border border-gray-200 px-1.5 py-1 text-[10px] text-gray-600 outline-none focus:border-blue-400"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="text-[10px] text-gray-400">
          {filtered.length} of {articles.length} articles
        </div>
      </div>

      {/* Article list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map((article, index) => {
          const isSelected = article.id === selectedArticleId;
          const status = articleStatuses[article.id] ?? 'not-started';
          const addCount = article.recommendations.filter((r) => r.action === 'add').length;
          const removeCount = article.recommendations.filter((r) => r.action === 'remove').length;
          const isEven = index % 2 === 0;

          return (
            <button
              key={article.id}
              onClick={() => onSelectArticle(article.id)}
              className={`w-full text-left px-3 py-3 transition-colors ${
                isSelected
                  ? 'bg-blue-50 border-l-3 border-l-blue-500 shadow-sm'
                  : status === 'done'
                    ? 'bg-green-50/40 border-l-3 border-l-green-300 hover:bg-green-50'
                    : isEven
                      ? 'bg-white border-l-3 border-l-transparent hover:bg-gray-50'
                      : 'bg-gray-50/50 border-l-3 border-l-transparent hover:bg-gray-100/70'
              }`}
            >
              {/* Title */}
              <div className={`text-[13px] font-medium leading-snug line-clamp-2 ${
                status === 'done' ? 'text-gray-400' : 'text-gray-800'
              }`}>
                {article.title}
              </div>

              {/* Badges row */}
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <FunnelBadge stage={article.funnelStage} />
                <RoleBadge role={article.role} />
                {addCount > 0 && (
                  <span className="text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                    +{addCount}
                  </span>
                )}
                {removeCount > 0 && (
                  <span className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">
                    -{removeCount}
                  </span>
                )}
                <span className="ml-auto">
                  <StatusDot status={status} />
                </span>
              </div>
            </button>
          );
        })}

        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-gray-400">
            No articles match filters
          </div>
        )}
      </div>
    </div>
  );
}

function FunnelBadge({ stage }: { stage: string }) {
  const upper = stage.toUpperCase();
  let colorClasses = 'bg-gray-100 text-gray-500';
  if (upper.includes('TOF')) colorClasses = 'bg-blue-100 text-blue-600';
  else if (upper.includes('MOF')) colorClasses = 'bg-yellow-100 text-yellow-700';
  else if (upper.includes('BOF')) colorClasses = 'bg-green-100 text-green-600';
  else if (upper.includes('CONV')) colorClasses = 'bg-purple-100 text-purple-600';

  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-semibold ${colorClasses}`}>
      {stage || 'N/A'}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const isPillar = role.toLowerCase().includes('pillar');
  return (
    <span
      className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-semibold ${
        isPillar
          ? 'bg-indigo-100 text-indigo-600'
          : 'bg-gray-100 text-gray-500'
      }`}
    >
      {role || 'N/A'}
    </span>
  );
}

function StatusDot({ status }: { status: 'not-started' | 'in-progress' | 'done' }) {
  switch (status) {
    case 'done':
      return (
        <span className="inline-flex w-3.5 h-3.5 rounded-full bg-green-500 items-center justify-center" title="Done">
          <svg className="w-2 h-2 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M2 6l3 3 5-5" />
          </svg>
        </span>
      );
    case 'in-progress':
      return (
        <span className="inline-flex w-3.5 h-3.5 rounded-full border-2 border-yellow-400 bg-yellow-400/30" title="In progress">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 m-auto" />
        </span>
      );
    default:
      return (
        <span className="inline-flex w-3.5 h-3.5 rounded-full border-2 border-gray-300" title="Not started" />
      );
  }
}
