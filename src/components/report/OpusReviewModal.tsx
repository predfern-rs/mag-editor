import { useEffect, useState } from 'react';
import type { LockFailure, OpusModel, OpusReviewResponse, Brand } from '../../api/opus-review';
import { runOpusReview } from '../../api/opus-review';
import { DiffPreview } from '../editor/DiffPreview';
import { ReviewPreview } from '../editor/ReviewPreview';

type ModalStatus = 'idle' | 'running' | 'reviewing' | 'error';

interface OpusReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  brand: Brand;
  /** Content with all applied recs — the input Mr Opus reviews. */
  content: string;
  lockedLinks: Array<{ anchor: string; href: string }>;
  /** Called when the editor accepts Mr Opus's version. */
  onAccept: (reviewedContent: string) => void;
  /**
   * Called when the editor chooses to accept Mr Opus's output even though
   * some locked links got dropped, and wants the recs behind those links
   * flipped back to "needs-manual" for retry. If unset, the "re-flag" button
   * isn't shown.
   */
  onAcceptReflagDropped?: (
    reviewedContent: string,
    dropped: Array<{ anchor?: string; href?: string }>,
  ) => void;
  /** Called to record a review attempt for the local telemetry log. */
  onRecordReview?: (entry: {
    articleId: string;
    model: string;
    tokensIn: number;
    tokensOut: number;
    accepted: boolean;
    lockFailures: number;
  }) => void;
  articleId: string;
}

export function OpusReviewModal({
  isOpen,
  onClose,
  title,
  brand,
  content,
  lockedLinks,
  onAccept,
  onAcceptReflagDropped,
  onRecordReview,
  articleId,
}: OpusReviewModalProps) {
  const [status, setStatus] = useState<ModalStatus>('idle');
  const [model, setModel] = useState<OpusModel>('opus-4');
  const [result, setResult] = useState<OpusReviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acknowledgeLockFailures, setAcknowledgeLockFailures] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  if (!isOpen) return null;

  async function handleRun() {
    setStatus('running');
    setError(null);
    setAcknowledgeLockFailures(false);
    try {
      const res = await runOpusReview({ content, title, brand, lockedLinks, model });
      setResult(res);
      setStatus('reviewing');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }

  function handleClose() {
    if (status === 'running') return;
    setStatus('idle');
    setResult(null);
    setError(null);
    setAcknowledgeLockFailures(false);
    setShowDiff(false);
    setShowPreview(false);
    onClose();
  }

  function handleAccept() {
    if (!result) return;
    onRecordReview?.({
      articleId,
      model: result.modelUsed,
      tokensIn: result.usage.input_tokens,
      tokensOut: result.usage.output_tokens,
      accepted: true,
      lockFailures: result.lockFailures.length,
    });
    onAccept(result.reviewedContent);
    handleClose();
  }

  function handleAcceptReflagDropped() {
    if (!result || !onAcceptReflagDropped) return;
    const dropped: Array<{ anchor?: string; href?: string }> = [];
    for (const f of result.lockFailures) {
      if (f.type === 'anchor') dropped.push({ anchor: f.value });
      else if (f.type === 'href') dropped.push({ href: f.value });
    }
    onRecordReview?.({
      articleId,
      model: result.modelUsed,
      tokensIn: result.usage.input_tokens,
      tokensOut: result.usage.output_tokens,
      accepted: true,
      lockFailures: result.lockFailures.length,
    });
    onAcceptReflagDropped(result.reviewedContent, dropped);
    handleClose();
  }

  function handleReject() {
    if (result) {
      onRecordReview?.({
        articleId,
        model: result.modelUsed,
        tokensIn: result.usage.input_tokens,
        tokensOut: result.usage.output_tokens,
        accepted: false,
        lockFailures: result.lockFailures.length,
      });
    }
    setStatus('idle');
    setResult(null);
    setShowDiff(false);
    setShowPreview(false);
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl mx-4">
          <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-t-xl">
            <div>
              <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
                <span>✨</span> Mr Opus Review
              </h2>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Minimal-change editorial polish. Preserves every applied link.
              </p>
            </div>
            <button
              onClick={handleClose}
              disabled={status === 'running'}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ✕
            </button>
          </div>

          <div className="p-6">
            {status === 'idle' && (
              <IdleView
                model={model}
                onModelChange={setModel}
                lockedCount={lockedLinks.length}
                onRun={handleRun}
              />
            )}

            {status === 'running' && <RunningView model={model} />}

            {status === 'error' && (
              <ErrorView
                message={error ?? 'Unknown error'}
                onRetry={() => setStatus('idle')}
                onClose={handleClose}
              />
            )}

            {status === 'reviewing' && result && (
              <ReviewingView
                result={result}
                lockFailures={result.lockFailures}
                acknowledgeLockFailures={acknowledgeLockFailures}
                onAcknowledgeLockFailures={() => setAcknowledgeLockFailures(true)}
                onViewDiff={() => setShowDiff(true)}
                onViewPreview={() => setShowPreview(true)}
                onAccept={handleAccept}
                onAcceptReflagDropped={onAcceptReflagDropped ? handleAcceptReflagDropped : undefined}
                onReject={handleReject}
              />
            )}
          </div>
        </div>
      </div>

      {result && (
        <>
          <DiffPreview
            isOpen={showDiff}
            onClose={() => setShowDiff(false)}
            oldContent={content}
            newContent={result.reviewedContent}
            onConfirm={() => {
              setShowDiff(false);
              handleAccept();
            }}
          />
          <ReviewPreview
            isOpen={showPreview}
            onClose={() => setShowPreview(false)}
            newContent={result.reviewedContent}
            onConfirm={() => {
              setShowPreview(false);
              handleAccept();
            }}
          />
        </>
      )}
    </>
  );
}

// ──────────────── Subviews ────────────────

function IdleView(props: {
  model: OpusModel;
  onModelChange: (m: OpusModel) => void;
  lockedCount: number;
  onRun: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 leading-relaxed">
        Mr Opus will re-read the article with all applied links in place, then make the
        smallest set of edits needed to smooth flow around newly inserted sentences.
        Every locked anchor text, href, and ACF block is validated on the way back.
      </p>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Model</label>
        <div className="flex gap-2">
          <ModelOption
            label="Opus 4.6"
            hint="Highest quality. Default."
            active={props.model === 'opus-4'}
            onClick={() => props.onModelChange('opus-4')}
          />
          <ModelOption
            label="Sonnet 4.5"
            hint="Faster, cheaper."
            active={props.model === 'sonnet-4.5'}
            onClick={() => props.onModelChange('sonnet-4.5')}
          />
        </div>
      </div>

      <div className="text-[11px] text-gray-500 leading-relaxed bg-gray-50 border border-gray-200 rounded-md p-3">
        <div>Locked links: <span className="font-semibold text-gray-700">{props.lockedCount}</span></div>
        <div className="mt-1">Rough cost per article: ~$0.03–0.15 (Opus) or ~$0.01–0.04 (Sonnet). Verify on first few runs.</div>
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={props.onRun}
          className="px-4 py-2 text-sm font-semibold text-white bg-purple-600 rounded-md hover:bg-purple-700 transition-colors"
        >
          Run Mr Opus Review
        </button>
      </div>
    </div>
  );
}

function RunningView({ model }: { model: OpusModel }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const modelLabel = model === 'opus-4' ? 'Claude Opus 4.6' : 'Claude Sonnet 4.5';
  const expected = model === 'opus-4' ? '60\u2013300 seconds' : '15\u201390 seconds';
  const timeoutSeconds = model === 'opus-4' ? 420 : 180;

  return (
    <div className="flex flex-col items-center py-8 text-center gap-3">
      <div className="w-10 h-10 rounded-full border-2 border-purple-200 border-t-purple-600 animate-spin" />
      <p className="text-sm font-medium text-gray-700">Mr Opus is reading…</p>
      <p className="text-xs text-gray-400">
        Using {modelLabel} via OpenRouter. Typical: {expected}.
      </p>
      <p className="text-[11px] text-gray-400 font-mono">
        {elapsed}s elapsed · times out at {timeoutSeconds}s
      </p>
    </div>
  );
}

function ErrorView(props: { message: string; onRetry: () => void; onClose: () => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-md bg-red-50 border border-red-200 p-3">
        <div className="text-xs font-semibold text-red-700 mb-1">Review failed</div>
        <p className="text-xs text-red-600 break-words">{props.message}</p>
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={props.onClose}
          className="px-3 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Close
        </button>
        <button
          onClick={props.onRetry}
          className="px-3 py-2 text-xs font-semibold text-white bg-purple-600 rounded-md hover:bg-purple-700"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

function ReviewingView(props: {
  result: OpusReviewResponse;
  lockFailures: LockFailure[];
  acknowledgeLockFailures: boolean;
  onAcknowledgeLockFailures: () => void;
  onViewDiff: () => void;
  onViewPreview: () => void;
  onAccept: () => void;
  onAcceptReflagDropped?: () => void;
  onReject: () => void;
}) {
  const hasFailures = props.lockFailures.length > 0;
  const canAccept = !hasFailures || props.acknowledgeLockFailures;

  // Dropped "links" = anchor and href failures (one broken link often emits both).
  const droppedLinkFailures = props.lockFailures.filter(
    (f) => f.type === 'anchor' || f.type === 'href',
  ).length;
  const hasAcfFailures = props.lockFailures.some((f) => f.type === 'acf');
  const hasHeadingFailures = props.lockFailures.some((f) => f.type === 'heading');
  const noop =
    props.result.segmentsReviewed === 0 ||
    props.result.changeSummary.toLowerCase().includes('no changes needed');

  return (
    <div className="space-y-4">
      <div className={`rounded-md border p-3 ${noop ? 'bg-gray-50 border-gray-200' : 'bg-green-50 border-green-200'}`}>
        <div className={`text-[11px] font-semibold uppercase tracking-wide mb-1 ${noop ? 'text-gray-500' : 'text-green-700'}`}>
          Mr Opus says
        </div>
        <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
          {props.result.changeSummary || 'No summary returned.'}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
        <span>Model: <span className="font-mono">{props.result.modelUsed}</span></span>
        <span>·</span>
        <span>
          Segments reviewed: <span className="font-semibold text-gray-700">{props.result.segmentsReviewed}</span>
        </span>
        <span>·</span>
        <span>
          Tokens: {props.result.usage.input_tokens} in / {props.result.usage.output_tokens} out
        </span>
      </div>

      {hasFailures && (
        <div className="rounded-md bg-red-50 border border-red-300 p-3">
          <div className="text-xs font-semibold text-red-700 mb-1">
            ⚠ {props.lockFailures.length} lock check{props.lockFailures.length === 1 ? '' : 's'} failed
          </div>
          <ul className="text-[11px] text-red-700 space-y-0.5 max-h-32 overflow-y-auto mt-1">
            {props.lockFailures.map((f, i) => (
              <li key={i}>
                <span className="font-mono uppercase">[{f.type}]</span> {f.value.length > 80 ? `${f.value.substring(0, 80)}…` : f.value}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-red-600 mt-2 leading-relaxed">
            Accepting anyway will save content that drops{' '}
            {[
              droppedLinkFailures > 0 ? 'one or more links' : null,
              hasAcfFailures ? 'one or more ACF blocks' : null,
              hasHeadingFailures ? 'one or more section headings' : null,
            ]
              .filter(Boolean)
              .join(' and ')}
            . {hasHeadingFailures
              ? 'Heading drops are usually structural mistakes (e.g. a "Related Reading" subheading deleted because the list shrank). Reject is almost always the right move.'
              : 'Usually the right move is Reject, or use "Accept & re-flag dropped" to save the polish and retry the dropped links manually.'}
          </p>
          {!props.acknowledgeLockFailures && (
            <button
              onClick={props.onAcknowledgeLockFailures}
              className="mt-2 text-[11px] text-red-700 underline hover:text-red-900"
            >
              I understand — let me accept anyway
            </button>
          )}
        </div>
      )}

      <div className="flex justify-between items-center flex-wrap gap-2">
        <div className="flex gap-2">
          <button
            onClick={props.onViewPreview}
            className="px-3 py-2 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100"
            title="See the reviewed article rendered"
          >
            👁️ Preview
          </button>
          <button
            onClick={props.onViewDiff}
            className="px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100"
            title="See raw HTML diff"
          >
            Diff
          </button>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button
            onClick={props.onReject}
            className="px-3 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Reject
          </button>
          {hasFailures && droppedLinkFailures > 0 && props.onAcceptReflagDropped && (
            <button
              onClick={props.onAcceptReflagDropped}
              className="px-3 py-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-300 rounded-md hover:bg-amber-100"
              title="Save Mr Opus's edits; flip the recs behind dropped links back to needs-manual so you can retry them individually."
            >
              Accept & re-flag dropped
            </button>
          )}
          <button
            onClick={props.onAccept}
            disabled={!canAccept}
            className="px-4 py-2 text-xs font-semibold text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}

function ModelOption(props: { label: string; hint: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      className={`flex-1 px-3 py-2 text-left rounded-md border transition-colors ${
        props.active
          ? 'border-purple-500 bg-purple-50'
          : 'border-gray-200 bg-white hover:bg-gray-50'
      }`}
    >
      <div className="text-xs font-semibold text-gray-800">{props.label}</div>
      <div className="text-[10px] text-gray-500">{props.hint}</div>
    </button>
  );
}
