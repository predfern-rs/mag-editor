import { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuditReport, LinkRecommendation } from '../lib/report-parser';
import { ReportUpload } from '../components/report/ReportUpload';
import { ReportSummary } from '../components/report/ReportSummary';
import { ReportArticleList } from '../components/report/ReportArticleList';
import { ArticleRecommendations } from '../components/report/ArticleRecommendations';
import { AiChatEditor } from '../components/editor/AiChatEditor';
import { SaveBar } from '../components/editor/SaveBar';
import { DiffPreview } from '../components/editor/DiffPreview';
import { ReviewPreview } from '../components/editor/ReviewPreview';
import { useUpdatePostContent } from '../hooks/usePostContent';
import { listPosts } from '../api/posts';
import { getPostContent, revertToLastRevision } from '../api/content';
import { applyRecommendation, findPlacementOptions, applyAtPlacement } from '../lib/smart-apply';
import type { PlacementOption } from '../lib/smart-apply';
import { OpusReviewModal } from '../components/report/OpusReviewModal';
import { detectSiteFromWpUrl } from '../lib/url-mapping';
import { getActiveSite } from '../config';
import type { Brand } from '../api/opus-review';

type ArticleStatus = 'not-started' | 'in-progress' | 'done';
type RecStatus = 'pending' | 'applied' | 'skipped' | 'needs-manual';

const LS_KEY_STATUSES = 'mag-editor-report-statuses';
const LS_KEY_REC = 'mag-editor-rec-statuses';
const LS_KEY_REPORT = 'mag-editor-saved-report';
const LS_KEY_SELECTED = 'mag-editor-selected-article';

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch { /* ignore */ }
  return fallback;
}

function saveToStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* ignore */ }
}

interface ReportModePageProps {
  onSwitchToEditor: (postSlug: string) => void;
}

export function ReportModePage({ onSwitchToEditor: _onSwitchToEditor }: ReportModePageProps) {
  const queryClient = useQueryClient();
  // ── Core state ──────────────────────────────────────────────────────
  const [report, setReport] = useState<AuditReport | null>(() =>
    loadFromStorage(LS_KEY_REPORT, null),
  );
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(() =>
    loadFromStorage(LS_KEY_SELECTED, null),
  );
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);

  // Persist report and selected article
  useEffect(() => { saveToStorage(LS_KEY_REPORT, report); }, [report]);
  useEffect(() => { saveToStorage(LS_KEY_SELECTED, selectedArticleId); }, [selectedArticleId]);

  const [articleStatuses, setArticleStatuses] = useState<Record<string, ArticleStatus>>(() =>
    loadFromStorage(LS_KEY_STATUSES, {}),
  );
  const [recStatuses, setRecStatuses] = useState<Record<string, Record<number, RecStatus>>>(() =>
    loadFromStorage(LS_KEY_REC, {}),
  );

  // Persist to localStorage
  useEffect(() => { saveToStorage(LS_KEY_STATUSES, articleStatuses); }, [articleStatuses]);
  useEffect(() => { saveToStorage(LS_KEY_REC, recStatuses); }, [recStatuses]);

  // ── Selected article ────────────────────────────────────────────────
  const selectedArticle = useMemo(
    () => report?.articles.find((a) => a.id === selectedArticleId) ?? null,
    [report, selectedArticleId],
  );

  // Extract slug from article URL (last path segment)
  const selectedSlug = useMemo(() => {
    if (!selectedArticle) return null;
    try {
      const pathname = new URL(selectedArticle.url).pathname;
      const segments = pathname.split('/').filter(Boolean);
      return segments[segments.length - 1] ?? null;
    } catch {
      // Try direct extraction if not a full URL
      const parts = selectedArticle.url.split('/').filter(Boolean);
      return parts[parts.length - 1] ?? null;
    }
  }, [selectedArticle]);

  // ── Fetch WP post by slug ──────────────────────────────────────────
  const { data: wpPosts } = useQuery({
    queryKey: ['posts-by-slug', selectedSlug],
    queryFn: () => listPosts({ slug: selectedSlug!, per_page: 1 }),
    enabled: !!selectedSlug,
  });

  const wpPostId = wpPosts?.[0]?.id ?? 0;

  const { data: contentData, isLoading: contentLoading } = useQuery({
    queryKey: ['post-content', wpPostId],
    queryFn: () => getPostContent(wpPostId),
    enabled: wpPostId > 0,
  });

  const updateContent = useUpdatePostContent(wpPostId);

  // ── Editor state ───────────────────────────────────────────────────
  const [editedContent, setEditedContent] = useState<string | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [aiInstruction, setAiInstruction] = useState<string | null>(null);
  // Track the last applied rec so the preview can scroll to it
  const [lastAppliedRec, setLastAppliedRec] = useState<LinkRecommendation | null>(null);
  // Track which recommendation indices have been applied + their keepText setting
  const [appliedIndices, setAppliedIndices] = useState<Map<number, boolean>>(new Map());
  // Summary banner shown after "Apply all fixes" (e.g. "Applied 7 of 9. 2 need manual placement.")
  const [applyAllSummary, setApplyAllSummary] = useState<string | null>(null);
  // Mr Opus Review modal
  const [opusModalOpen, setOpusModalOpen] = useState(false);

  const originalContent = contentData?.content.raw ?? '';
  const postTitle = contentData?.title.raw ?? selectedArticle?.title ?? '';

  // currentContent is the live working copy. Every action (single Apply,
  // PlacementPicker, Apply-all, AI chat, Mr Opus review) sets editedContent
  // directly, so nothing ever gets clobbered by a replay. When editedContent
  // is null we're pristine and currentContent falls back to originalContent.
  const currentContent = editedContent ?? originalContent;
  const hasChanges = currentContent !== originalContent;

  // Reset editor state when article changes
  useEffect(() => {
    setEditedContent(null);
    setDiffOpen(false);
    setReviewOpen(false);
    setAiInstruction(null);
    setAppliedIndices(new Map());
    setApplyAllSummary(null);
    setOpusModalOpen(false);
  }, [selectedArticleId]);

  // Lock list for Mr Opus: any ADD/KEEP rec whose anchor + href are BOTH
  // present in the current content. Derived from content (not appliedIndices)
  // so manual PlacementPicker insertions and AI-chat edits are reviewed the
  // same way as Apply-all output. REMOVE recs don't add locks.
  const opusLockedLinks = useMemo(() => {
    if (!selectedArticle) return [];
    const locks: Array<{ anchor: string; href: string }> = [];
    selectedArticle.recommendations.forEach((rec) => {
      if (rec.action !== 'add' && rec.action !== 'keep') return;
      if (!rec.anchor || !rec.targetUrl) return;
      if (currentContent.includes(rec.anchor) && currentContent.includes(rec.targetUrl)) {
        locks.push({ anchor: rec.anchor, href: rec.targetUrl });
      }
    });
    return locks;
  }, [selectedArticle, currentContent]);

  const opusBrand: Brand = useMemo(() => {
    if (selectedArticle) {
      const detected = detectSiteFromWpUrl(selectedArticle.url);
      if (detected) {
        if (detected.siteId === 'dope') return 'dope';
        if (detected.siteId === 'montec') return 'montec';
        if (detected.siteId === 'ridestore') return 'ridestore';
      }
    }
    const active = getActiveSite().id;
    if (active === 'dope') return 'dope';
    if (active === 'montec') return 'montec';
    return 'ridestore';
  }, [selectedArticle]);

  // Enable Mr Opus whenever the article has been modified. The review does
  // two jobs: protect locked links (anchor+href) AND clean up truncation
  // artefacts from removes (e.g. "Look out for rides at" left dangling).
  // Gating on locks alone hides the button exactly when cleanup is needed.
  const opusReviewEnabled = hasChanges && !!selectedArticle;

  // ── Handlers ───────────────────────────────────────────────────────
  function handleSelectArticle(id: string) {
    setSelectedArticleId(id);
    setArticleStatuses((prev) => {
      const current = prev[id] ?? 'not-started';
      if (current === 'not-started') {
        return { ...prev, [id]: 'in-progress' };
      }
      return prev;
    });
  }

  function handleContentChange(newContent: string) {
    setEditedContent(newContent);
  }

  function handleSave() {
    const contentToSave = currentContent;
    if (contentToSave === originalContent) return;

    updateContent.mutate(contentToSave, {
      onSuccess: () => {
        setEditedContent(null);
        setAppliedIndices(new Map());
        setLastSaved(new Date());
        setDiffOpen(false);
        setReviewOpen(false);
      },
    });
  }

  async function handleRevert() {
    await revertToLastRevision(wpPostId);
    setEditedContent(null);
    setAppliedIndices(new Map());
    await queryClient.invalidateQueries({ queryKey: ['post-content', wpPostId] });
  }

  const handleApplyRecommendation = useCallback(
    (rec: LinkRecommendation, recIndex: number, keepText?: boolean) => {
      // Test if this recommendation can be applied
      const result = applyRecommendation(rec, currentContent, keepText);

      if (result.success) {
        setEditedContent(result.modifiedContent);
        setAppliedIndices((prev) => new Map(prev).set(recIndex, keepText ?? false));
        setLastAppliedRec(rec);

        // Mark in the status tracker
        if (selectedArticleId) {
          handleUpdateRecStatus(selectedArticleId, recIndex, 'applied');
        }
        setAiInstruction(null);
      } else {
        // Couldn't do it automatically — fall back to AI chat
        let instruction = '';
        if (rec.action === 'add') {
          if (rec.suggestedSentence) {
            const contextHint = rec.reason.match(/\(([^)]+)\)/)?.[1] || '';
            instruction = `Add this sentence near the ${contextHint ? contextHint + ' part' : 'relevant section'} of the article: "${rec.suggestedSentence}"`;
          } else {
            instruction = `Make "${rec.anchor}" a link to ${rec.targetUrl}`;
          }
        } else if (rec.action === 'remove') {
          instruction = `Remove the link to ${rec.targetUrl}`;
        }
        setAiInstruction(instruction);
      }
    },
    [currentContent, selectedArticleId, handleUpdateRecStatus],
  );

  // Apply every pending ADD/REMOVE rec in order. Recs that can't be placed
  // automatically are flagged as needs-manual instead of opening the AI chat
  // (so the editor can deal with them after the batch completes).
  const handleApplyAll = useCallback(() => {
    if (!selectedArticle || !selectedArticleId) return;

    let runningContent = currentContent;
    const newAppliedIndices = new Map(appliedIndices);
    const articleStatuses = { ...(recStatuses[selectedArticleId] ?? {}) };
    let applied = 0;
    let needsManual = 0;
    let skipped = 0;

    selectedArticle.recommendations.forEach((rec, idx) => {
      if (rec.action === 'keep') return;
      const existing = articleStatuses[idx];
      if (existing === 'applied' || existing === 'skipped' || existing === 'needs-manual') return;

      const keepText = false;
      const result = applyRecommendation(rec, runningContent, keepText);
      if (result.success) {
        runningContent = result.modifiedContent;
        newAppliedIndices.set(idx, keepText);
        articleStatuses[idx] = 'applied';
        applied += 1;
      } else {
        articleStatuses[idx] = 'needs-manual';
        needsManual += 1;
      }
    });

    // Count pre-existing skips for context in the summary.
    Object.values(articleStatuses).forEach((s) => {
      if (s === 'skipped') skipped += 1;
    });

    setEditedContent(runningContent);
    setAppliedIndices(newAppliedIndices);
    setRecStatuses((prev) => ({ ...prev, [selectedArticleId]: articleStatuses }));

    const total = applied + needsManual;
    const parts: string[] = [];
    parts.push(`Applied ${applied} of ${total} pending.`);
    if (needsManual > 0) parts.push(`${needsManual} need${needsManual === 1 ? 's' : ''} manual placement.`);
    if (skipped > 0) parts.push(`${skipped} previously skipped.`);
    setApplyAllSummary(parts.join(' '));
  }, [selectedArticle, selectedArticleId, currentContent, appliedIndices, recStatuses]);

  // Mark a recommendation as pending again so Apply-all will re-process it.
  // Does NOT revert the text change — use the Revert button for a full rollback.
  // Intentional: trying to reverse a single rec would often collide with
  // manual placements or Mr Opus edits layered on top.
  const handleUndoRecommendation = useCallback(
    (recIndex: number) => {
      setAppliedIndices((prev) => {
        const next = new Map(prev);
        next.delete(recIndex);
        return next;
      });
      if (selectedArticleId) {
        setRecStatuses((prev) => {
          const articleRecs = { ...(prev[selectedArticleId] ?? {}) };
          delete articleRecs[recIndex];
          return { ...prev, [selectedArticleId]: articleRecs };
        });
      }
    },
    [selectedArticleId],
  );

  const handleTellMeWhere = useCallback((rec: LinkRecommendation) => {
    const template = `Insert this sentence into the article:\n\n"${rec.suggestedSentence}"\n\nPlace it [ABOVE / BELOW / REPLACING] this text from the article:\n[PASTE THE EXACT SENTENCE OR HEADING FROM THE ARTICLE HERE]`;
    setAiInstruction(template);
  }, []);

  const handleFindPlacements = useCallback(
    (rec: LinkRecommendation): PlacementOption[] => {
      return findPlacementOptions(rec, currentContent);
    },
    [currentContent],
  );

  const handleApplyAtPlacement = useCallback(
    (rec: LinkRecommendation, recIndex: number, option: PlacementOption) => {
      const result = applyAtPlacement(rec, currentContent, option);
      if (result.success) {
        setEditedContent(result.modifiedContent);
        setLastAppliedRec(rec);
        if (selectedArticleId) {
          handleUpdateRecStatus(selectedArticleId, recIndex, 'applied');
        }
      }
    },
    [currentContent, selectedArticleId, handleUpdateRecStatus],
  );

  function handleUpdateRecStatus(articleId: string, index: number, status: 'applied' | 'skipped') {
    setRecStatuses((prev) => ({
      ...prev,
      [articleId]: {
        ...(prev[articleId] ?? {}),
        [index]: status,
      },
    }));
  }

  function handleMarkDone(articleId: string) {
    setArticleStatuses((prev) => ({
      ...prev,
      [articleId]: prev[articleId] === 'done' ? 'in-progress' : 'done',
    }));
  }

  // ── Upload screen ──────────────────────────────────────────────────
  if (!report) {
    return (
      <div className="min-h-screen bg-[#f0f2f8] p-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-800">Content Audit Report</h1>
            <p className="text-sm text-gray-400 mt-1">
              Upload your HTML audit report to start working through recommendations
            </p>
          </div>
          <ReportUpload onReportLoaded={setReport} />
        </div>
      </div>
    );
  }

  // ── Main report layout ─────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col bg-[#f0f2f8]">
      {/* Header bar */}
      <header className="bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between flex-shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">R</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-800 tracking-wide">
              {report.title}
            </h1>
            <span className="text-[10px] text-gray-400">
              {report.articles.length} articles &middot; Content Audit Report
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (!confirm('Upload a new report? This will clear all current progress.')) return;
              setReport(null);
              setSelectedArticleId(null);
              setArticleStatuses({});
              setRecStatuses({});
              saveToStorage(LS_KEY_REPORT, null);
              saveToStorage(LS_KEY_SELECTED, null);
              saveToStorage(LS_KEY_STATUSES, {});
              saveToStorage(LS_KEY_REC, {});
            }}
            className="px-3 py-1.5 text-xs font-medium text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Upload new report
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <div className="w-80 flex-shrink-0 flex flex-col bg-white border-r border-gray-200 shadow-sm overflow-hidden">
          {/* Summary - collapsible */}
          <div className="flex-shrink-0 border-b border-gray-100">
            <button
              onClick={() => setSummaryCollapsed(!summaryCollapsed)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-50 transition-colors"
            >
              <span>Summary</span>
              <svg
                className={`w-3.5 h-3.5 transition-transform ${summaryCollapsed ? '' : 'rotate-180'}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {!summaryCollapsed && (
              <div className="px-3 pb-3">
                <ReportSummary report={report} />
              </div>
            )}
          </div>

          {/* Article list */}
          <div className="flex-1 overflow-hidden">
            <ReportArticleList
              articles={report.articles}
              selectedArticleId={selectedArticleId}
              onSelectArticle={handleSelectArticle}
              articleStatuses={articleStatuses}
            />
          </div>
        </div>

        {/* Main area */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {selectedArticle ? (
            <>
              {/* Top: Article info + Mark done button */}
              <div className="flex-shrink-0 px-5 pt-4 pb-2 flex items-center justify-between">
                <div className="text-xs text-gray-400">
                  {wpPostId > 0
                    ? `WP Post #${wpPostId}`
                    : selectedSlug
                      ? 'Looking up post...'
                      : 'No slug found'}
                </div>
                <button
                  onClick={() => handleMarkDone(selectedArticle.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    articleStatuses[selectedArticle.id] === 'done'
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {articleStatuses[selectedArticle.id] === 'done' ? 'Marked Done' : 'Mark Done'}
                </button>
              </div>

              {/* Content area: recommendations + editor */}
              <div className="flex-1 overflow-y-auto px-5 pb-20">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                  {/* Left: Recommendations */}
                  <div>
                    <ArticleRecommendations
                      article={selectedArticle}
                      onApplyRecommendation={handleApplyRecommendation}
                      onApplyAll={handleApplyAll}
                      applyAllSummary={applyAllSummary}
                      onDismissApplyAllSummary={() => setApplyAllSummary(null)}
                      onUndoRecommendation={handleUndoRecommendation}
                      onPreviewChanges={() => setReviewOpen(true)}
                      onTellMeWhere={handleTellMeWhere}
                      onFindPlacements={handleFindPlacements}
                      onApplyAtPlacement={handleApplyAtPlacement}
                      onSendInstruction={setAiInstruction}
                      recommendationStatuses={recStatuses[selectedArticle.id] ?? {}}
                      onUpdateRecStatus={(index, status) =>
                        handleUpdateRecStatus(selectedArticle.id, index, status)
                      }
                      renderedHtml={contentData?.content.rendered}
                      wpPostId={wpPostId}
                    />
                  </div>

                  {/* Right: AI Editor */}
                  <div className="sticky top-0">
                    {contentLoading ? (
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
                        <div className="w-8 h-8 mx-auto mb-3 rounded-full border-2 border-blue-200 border-t-blue-500 animate-spin" />
                        <p className="text-sm text-gray-400">Loading content...</p>
                      </div>
                    ) : wpPostId > 0 ? (
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-gray-500">AI Editor</span>
                            {hasChanges && (
                              <span className="text-[10px] text-amber-600 font-medium">
                                ({appliedIndices.size} edit{appliedIndices.size !== 1 ? 's' : ''} pending)
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {hasChanges && (
                              <button
                                onClick={() => {
                                  setEditedContent(null);
                                  setAppliedIndices(new Map());
                                  if (selectedArticleId) {
                                    setRecStatuses((prev) => {
                                      const copy = { ...prev };
                                      delete copy[selectedArticleId];
                                      return copy;
                                    });
                                  }
                                }}
                                className="text-[10px] font-medium text-red-500 hover:text-red-700 transition-colors"
                              >
                                Reset to original
                              </button>
                            )}
                            <span className="text-[10px] text-gray-400">
                              {(currentContent.length / 1000).toFixed(1)}k chars
                            </span>
                          </div>
                        </div>
                        <AiChatEditorWithInstruction
                          key={selectedArticleId}
                          content={currentContent}
                          postTitle={postTitle}
                          onContentChange={handleContentChange}
                          onShowReview={() => setReviewOpen(true)}
                          onShowDiff={() => setDiffOpen(true)}
                          onRevert={async () => {
                            await revertToLastRevision(wpPostId);
                            setEditedContent(null);
                            await queryClient.invalidateQueries({ queryKey: ['post-content', wpPostId] });
                          }}
                          instruction={aiInstruction}
                          onInstructionConsumed={() => setAiInstruction(null)}
                        />
                      </div>
                    ) : (
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
                        <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-amber-50 flex items-center justify-center text-xl">
                          !
                        </div>
                        <p className="text-sm font-medium text-gray-700">Post not found</p>
                        <p className="text-xs text-gray-400 mt-1">
                          Could not find a WordPress post matching slug &quot;{selectedSlug}&quot;
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white shadow-md flex items-center justify-center">
                  <svg className="w-7 h-7 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                </div>
                <p className="text-base font-semibold text-gray-600">Select an article</p>
                <p className="text-sm text-gray-400 mt-1">
                  Choose an article from the sidebar to view its recommendations
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Diff & Save */}
      <ReviewPreview
        newContent={currentContent}
        isOpen={reviewOpen}
        onClose={() => { setReviewOpen(false); setLastAppliedRec(null); }}
        onConfirm={handleSave}
        scrollToRec={lastAppliedRec}
      />

      <DiffPreview
        oldContent={originalContent}
        newContent={currentContent}
        isOpen={diffOpen}
        onClose={() => setDiffOpen(false)}
        onConfirm={handleSave}
      />

      {hasChanges && (
        <SaveBar
          hasChanges={hasChanges}
          isSaving={updateContent.isPending}
          onSave={handleSave}
          onReview={() => setReviewOpen(true)}
          onReviewChanges={() => setDiffOpen(true)}
          onOpusReview={() => setOpusModalOpen(true)}
          opusReviewEnabled={opusReviewEnabled}
          onRevert={handleRevert}
          onDiscard={() => {
            setEditedContent(null);
            setAppliedIndices(new Map());
            // Reset applied statuses for this article back to pending
            if (selectedArticleId) {
              setRecStatuses((prev) => {
                const copy = { ...prev };
                delete copy[selectedArticleId];
                return copy;
              });
            }
          }}
          lastSaved={lastSaved}
          pendingCount={
            selectedArticleId
              ? Object.values(recStatuses[selectedArticleId] ?? {}).filter((s) => s === 'applied').length
              : undefined
          }
        />
      )}

      {selectedArticle && (
        <OpusReviewModal
          isOpen={opusModalOpen}
          onClose={() => setOpusModalOpen(false)}
          title={postTitle}
          brand={opusBrand}
          content={currentContent}
          lockedLinks={opusLockedLinks}
          articleId={selectedArticle.id}
          onAccept={(reviewed) => {
            setEditedContent(reviewed);
          }}
          onAcceptReflagDropped={(reviewed, dropped) => {
            setEditedContent(reviewed);
            if (!selectedArticleId) return;
            // Find rec indices whose anchor or targetUrl matches any dropped item.
            const dropAnchors = new Set(dropped.map((d) => d.anchor).filter(Boolean));
            const dropHrefs = new Set(dropped.map((d) => d.href).filter(Boolean));
            const newApplied = new Map(appliedIndices);
            setRecStatuses((prev) => {
              const articleRecs = { ...(prev[selectedArticleId] ?? {}) };
              selectedArticle.recommendations.forEach((rec, i) => {
                if (!newApplied.has(i)) return;
                if (rec.action !== 'add') return;
                const matched =
                  (rec.anchor && dropAnchors.has(rec.anchor)) ||
                  (rec.targetUrl && dropHrefs.has(rec.targetUrl));
                if (matched) {
                  articleRecs[i] = 'needs-manual';
                  newApplied.delete(i);
                }
              });
              return { ...prev, [selectedArticleId]: articleRecs };
            });
            setAppliedIndices(newApplied);
          }}
          onRecordReview={(entry) => {
            try {
              const raw = localStorage.getItem('mag-editor-opus-history');
              const log = raw ? (JSON.parse(raw) as unknown[]) : [];
              log.push({ ...entry, timestamp: new Date().toISOString() });
              localStorage.setItem('mag-editor-opus-history', JSON.stringify(log.slice(-200)));
            } catch {
              /* ignore */
            }
          }}
        />
      )}
    </div>
  );
}

// ── Wrapper to auto-fill instruction into AiChatEditor ─────────────

interface AiChatEditorWithInstructionProps {
  content: string;
  postTitle: string;
  onContentChange: (c: string) => void;
  onShowReview?: () => void;
  onShowDiff: () => void;
  onRevert?: () => Promise<void>;
  instruction: string | null;
  onInstructionConsumed: () => void;
}

function AiChatEditorWithInstruction({
  content,
  postTitle,
  onContentChange,
  onShowReview,
  onShowDiff,
  onRevert,
  instruction,
  onInstructionConsumed,
}: AiChatEditorWithInstructionProps) {
  // We render the real AiChatEditor and use a ref-based approach to
  // pre-fill. Since AiChatEditor manages its own input state, we
  // communicate via a wrapper with a custom input pre-fill mechanism.
  //
  // For now, we show the instruction as a "queued" banner above the editor
  // so the user can review and send it.

  const [queued, setQueued] = useState<string | null>(null);

  useEffect(() => {
    if (instruction) {
      setQueued(instruction);
      onInstructionConsumed();
    }
  }, [instruction, onInstructionConsumed]);

  const isTemplate = queued?.includes('\n') ?? false;

  return (
    <div className="flex flex-col">
      {queued && !isTemplate && (
        <div className="px-4 py-2 bg-blue-50 border-b border-blue-200 flex items-center gap-2">
          <span className="text-xs text-blue-700 flex-1 line-clamp-2">{queued}</span>
          <button
            onClick={() => {
              void navigator.clipboard.writeText(queued);
              setQueued(null);
            }}
            className="px-2 py-1 text-[10px] font-medium text-blue-600 bg-blue-100 rounded hover:bg-blue-200 transition-colors flex-shrink-0"
          >
            Copy
          </button>
          <button
            onClick={() => setQueued(null)}
            className="text-blue-400 hover:text-blue-600 flex-shrink-0"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}
      {queued && isTemplate && (
        <div className="px-4 py-3 bg-blue-50 border-b border-blue-200">
          <div className="text-[10px] font-semibold text-blue-600 mb-1.5 uppercase tracking-wide">
            Edit the template below, then send to AI
          </div>
          <textarea
            value={queued}
            onChange={(e) => setQueued(e.target.value)}
            rows={8}
            className="w-full text-xs text-blue-800 bg-white border border-blue-200 rounded-md px-3 py-2 resize-y outline-none focus:border-blue-400 font-mono leading-relaxed"
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => {
                void navigator.clipboard.writeText(queued);
                setQueued(null);
              }}
              className="px-3 py-1.5 text-[11px] font-medium text-blue-600 bg-blue-100 rounded-md hover:bg-blue-200 transition-colors"
            >
              Copy & Close
            </button>
            <button
              onClick={() => setQueued(null)}
              className="px-3 py-1.5 text-[11px] font-medium text-gray-500 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      <AiChatEditor
        content={content}
        postTitle={postTitle}
        onContentChange={onContentChange}
        onShowReview={onShowReview}
        onShowDiff={onShowDiff}
        onRevert={onRevert}
      />
    </div>
  );
}
