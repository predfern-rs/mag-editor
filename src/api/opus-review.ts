import { buildOpusReviewPrompt } from '../lib/opus-prompt';

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
  | { type: 'acf'; value: string };

export interface OpusReviewResponse {
  reviewedContent: string;
  changeSummary: string;
  modelUsed: string;
  lockFailures: LockFailure[];
  usage: { input_tokens: number; output_tokens: number };
}

function getApiKey(): string {
  const key = import.meta.env.VITE_OPENROUTER_API_KEY as string;
  if (!key) throw new Error('Missing VITE_OPENROUTER_API_KEY in .env');
  return key;
}

export async function runOpusReview(req: OpusReviewRequest): Promise<OpusReviewResponse> {
  const model: OpusModel = req.model ?? 'opus-4';
  const route = MODEL_ROUTES[model];

  const { system, user } = buildOpusReviewPrompt({
    title: req.title,
    brand: req.brand,
    content: req.content,
    lockedLinks: req.lockedLinks,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);

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

  const reviewedContent = extractTagged(raw, 'REVIEWED_CONTENT');
  const changeSummary = extractTagged(raw, 'CHANGE_SUMMARY') ?? '';

  if (!reviewedContent) {
    throw new Error(
      'Mr Opus did not return a <REVIEWED_CONTENT> block. Raw response (truncated): ' +
        raw.substring(0, 400),
    );
  }

  const lockFailures = validateLocks(req.content, reviewedContent, req.lockedLinks);

  return {
    reviewedContent,
    changeSummary,
    modelUsed: route,
    lockFailures,
    usage,
  };
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

  return failures;
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

  // Self-closing ACF blocks.
  const selfClosing = /<!--\s*wp:acf\/[^\s]+[^>]*\/-->/g;
  let m: RegExpExecArray | null;
  while ((m = selfClosing.exec(content)) !== null) {
    blocks.push(m[0]);
  }

  // Paired ACF blocks — capture the whole span including inner content.
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
