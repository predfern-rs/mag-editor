import { buildOpusReviewPrompt } from '../lib/opus-prompt';
import {
  extractReviewSegments,
  stitchReviewedSegments,
  type ReviewSegment,
} from '../lib/opus-segments';
import { findCleanupTargets } from '../lib/opus-cleanup';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export type OpusModel = 'opus-4' | 'sonnet-4.5';

const MODEL_ROUTES: Record<OpusModel, string> = {
  'opus-4': 'anthropic/claude-opus-4',
  'sonnet-4.5': 'anthropic/claude-sonnet-4.5',
};

export type Brand = 'ridestore' | 'dope' | 'montec';

export interface OpusReviewRequest {
  /** Raw Gutenberg-block content after applying recommendations. */
  content: string;
  title: string;
  brand: Brand;
  /** Links the editor expects to still appear verbatim in the output. */
  lockedLinks: Array<{ anchor: string; href: string }>;
  model?: OpusModel;
}

export type LockFailure =
  | { type: 'anchor'; value: string }
  | { type: 'href'; value: string }
  | { type: 'acf'; value: string }
  | { type: 'heading'; value: string }
  | { type: 'label'; value: string };

export interface OpusReviewResponse {
  /** Full article content with reviewed segments stitched back in. */
  reviewedContent: string;
  changeSummary: string;
  modelUsed: string;
  lockFailures: LockFailure[];
  usage: { input_tokens: number; output_tokens: number };
  /** How many segments Mr Opus actually reviewed. Zero means nothing was in scope. */
  segmentsReviewed: number;
}

function getApiKey(): string {
  const key = import.meta.env.VITE_OPENROUTER_API_KEY as string;
  if (!key) throw new Error('Missing VITE_OPENROUTER_API_KEY in .env');
  return key;
}

export async function runOpusReview(req: OpusReviewRequest): Promise<OpusReviewResponse> {
  const model: OpusModel = req.model ?? 'opus-4';
  const route = MODEL_ROUTES[model];

  const cleanupTargets = findCleanupTargets(req.content);
  const segments = extractReviewSegments(req.content, req.lockedLinks, 1, cleanupTargets);
  if (segments.length === 0) {
    // Nothing to review — locked links aren't in editable blocks, no cleanup
    // targets either.  Return the article unchanged.
    return {
      reviewedContent: req.content,
      changeSummary: 'No editable segments contain locked links or cleanup targets — nothing to review.',
      modelUsed: route,
      lockFailures: [],
      usage: { input_tokens: 0, output_tokens: 0 },
      segmentsReviewed: 0,
    };
  }

  const { system, user } = buildOpusReviewPrompt({
    title: req.title,
    brand: req.brand,
    segments,
  });

  const controller = new AbortController();
  const timeoutMs = model === 'opus-4' ? 420_000 : 180_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let raw: string;
  let usage = { input_tokens: 0, output_tokens: 0 };
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'MAG Mr Opus Review',
      },
      body: JSON.stringify({
        model: route,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: 16000,
        temperature: 0,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      throw new Error(err.error ? JSON.stringify(err.error) : `OpenRouter error: ${res.status}`);
    }

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    raw = data.choices[0]?.message?.content ?? '';
    usage = {
      input_tokens: data.usage?.prompt_tokens ?? 0,
      output_tokens: data.usage?.completion_tokens ?? 0,
    };
  } finally {
    clearTimeout(timeout);
  }

  if (!raw.trim()) {
    throw new Error('Mr Opus returned an empty response');
  }

  const reviewedById = extractReviewedSegments(raw);
  const changeSummary = extractTagged(raw, 'CHANGE_SUMMARY') ?? '';

  if (Object.keys(reviewedById).length === 0) {
    throw new Error(
      'Mr Opus did not return any <REVIEWED_SEGMENT> blocks. Raw response (truncated): ' +
        raw.substring(0, 400),
    );
  }

  const reviewedContent = stitchReviewedSegments(req.content, segments, reviewedById);
  const lockFailures = validateLocks(req.content, reviewedContent, req.lockedLinks);

  return {
    reviewedContent,
    changeSummary,
    modelUsed: route,
    lockFailures,
    usage,
    segmentsReviewed: Object.keys(reviewedById).length,
  };
}

/**
 * Extract all <REVIEWED_SEGMENT id="…">…</REVIEWED_SEGMENT> blocks from the
 * raw model response, keyed by id.
 */
export function extractReviewedSegments(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<REVIEWED_SEGMENT\s+id="([^"]+)"\s*>([\s\S]*?)<\/REVIEWED_SEGMENT>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    out[m[1]!] = m[2]!.trim();
  }
  return out;
}

/**
 * Check every lock: anchor text, href, and ACF block byte-equality.
 * Returns an empty array on success.
 */
export function validateLocks(
  originalContent: string,
  reviewedContent: string,
  lockedLinks: OpusReviewRequest['lockedLinks'],
): LockFailure[] {
  const failures: LockFailure[] = [];

  for (const link of lockedLinks) {
    if (link.anchor && !reviewedContent.includes(link.anchor)) {
      failures.push({ type: 'anchor', value: link.anchor });
    }
    if (link.href && !reviewedContent.includes(link.href)) {
      failures.push({ type: 'href', value: link.href });
    }
  }

  const originalAcf = extractAcfBlocks(originalContent);
  const reviewedAcf = extractAcfBlocks(reviewedContent);
  for (const block of originalAcf) {
    if (!reviewedAcf.includes(block)) {
      failures.push({ type: 'acf', value: firstLine(block) });
    }
  }

  const originalHeadings = extractHeadingBlocks(originalContent);
  const reviewedHeadings = extractHeadingBlocks(reviewedContent);
  for (const block of originalHeadings) {
    if (!reviewedHeadings.includes(block)) {
      failures.push({ type: 'heading', value: headingTitle(block) });
    }
  }

  const originalLabels = extractBoldLabelParagraphs(originalContent);
  const reviewedLabels = extractBoldLabelParagraphs(reviewedContent);
  for (const block of originalLabels) {
    if (!reviewedLabels.includes(block)) {
      failures.push({ type: 'label', value: labelTitle(block) });
    }
  }

  return failures;
}

/**
 * Extract every <!-- wp:heading -->…<!-- /wp:heading --> block from content.
 * Headings define article structure and Mr Opus must never alter them.
 */
export function extractHeadingBlocks(content: string): string[] {
  const blocks: string[] = [];
  const re = /<!--\s*wp:heading[^>]*-->[\s\S]*?<!--\s*\/wp:heading\s*-->/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    blocks.push(m[0]);
  }
  return blocks;
}

function headingTitle(block: string): string {
  const m = block.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
  if (!m) return firstLine(block);
  return m[1]!.replace(/<[^>]+>/g, '').trim();
}

/**
 * Find "bold-only label" paragraphs — `<!-- wp:paragraph -->` blocks whose
 * prose is essentially just a <strong>/<b>/<em> tag acting as a section
 * label (e.g. `<strong>Related Reading:</strong>`). In a lot of older
 * content these stand in for real <h*> headings and Mr Opus has been
 * deleting them when the content under them shrinks.
 */
export function extractBoldLabelParagraphs(content: string): string[] {
  const blocks: string[] = [];
  const re = /<!--\s*wp:paragraph[^>]*-->[\s\S]*?<!--\s*\/wp:paragraph\s*-->/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const block = m[0];
    if (isBoldLabelParagraph(block)) blocks.push(block);
  }
  return blocks;
}

function isBoldLabelParagraph(block: string): boolean {
  const pInner = block.match(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/i);
  if (!pInner) return false;
  const innerHtml = pInner[1]!;

  const plain = innerHtml
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Short text — labels are typically 1-6 words, not paragraphs.
  if (plain.length === 0 || plain.length > 80) return false;

  // The visible content is structurally just one emphasis tag
  // (<strong>, <b>, or <em>) optionally followed by punctuation / nbsp.
  const clean = innerHtml.replace(/&nbsp;/g, ' ').trim();
  return /^<(strong|b|em)>[\s\S]+<\/\1>[\s:.,]*$/i.test(clean);
}

function labelTitle(block: string): string {
  const m = block.match(/<(strong|b|em)>([\s\S]*?)<\/\1>/i);
  if (!m) return firstLine(block);
  return m[2]!.replace(/<[^>]+>/g, '').trim();
}

function extractTagged(raw: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
  const m = raw.match(re);
  return m ? m[1]!.trim() : null;
}

/**
 * Extract ACF block markup from content.
 * Handles both self-closing (`<!-- wp:acf/... /-->`) and paired
 * (`<!-- wp:acf/... -->...<!-- /wp:acf/... -->`) forms.
 */
export function extractAcfBlocks(content: string): string[] {
  const blocks: string[] = [];

  const selfClosing = /<!--\s*wp:acf\/[^\s]+[^>]*\/-->/g;
  let m: RegExpExecArray | null;
  while ((m = selfClosing.exec(content)) !== null) {
    blocks.push(m[0]);
  }

  const paired = /<!--\s*wp:acf\/([\S]+?)\s[^>]*-->[\s\S]*?<!--\s*\/wp:acf\/\1\s*-->/g;
  while ((m = paired.exec(content)) !== null) {
    blocks.push(m[0]);
  }

  return blocks;
}

function firstLine(s: string): string {
  const idx = s.indexOf('\n');
  return idx >= 0 ? s.substring(0, idx) : s;
}

export type { ReviewSegment };
