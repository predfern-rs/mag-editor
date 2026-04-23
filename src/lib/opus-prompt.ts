import type { Brand } from '../api/opus-review';

export interface OpusPromptArgs {
  title: string;
  brand: Brand;
  content: string;
  lockedLinks: Array<{ anchor: string; href: string }>;
}

const BRAND_VOICE: Record<Brand, string> = {
  ridestore:
    'Ridestore Magazine is the helpful editorial voice of an experienced snowsports retailer. Warm, informative, practical. Speaks to a reader who is planning a trip, researching kit, or learning. Avoids hype. British English spelling.',
  dope:
    'Dope Snow Magazine is playful, rebellious, and culture-driven. Aimed at riders who care about style as much as function. Direct, confident, a little cheeky. Never corporate.',
  montec:
    'Montec Magazine is premium and understated. Crafted, precise writing for riders who want quality gear without shouting about it. Calm, knowledgeable, quietly confident.',
};

export function buildOpusReviewPrompt(args: OpusPromptArgs): { system: string; user: string } {
  const voice = BRAND_VOICE[args.brand];

  const lockedList = args.lockedLinks.length === 0
    ? '(no locked links)'
    : args.lockedLinks
        .map((l, i) => `${i + 1}. anchor: "${l.anchor}" → href: "${l.href}"`)
        .join('\n');

  const system = `You are an experienced magazine editor doing a minimal-change polish pass on an article that has just had internal links inserted by an automated tool. The inserted sentences sometimes land as standalone paragraphs when they would read better merged into an adjacent paragraph, or land in a spot where a one-line rewrite of the surrounding prose smooths the flow. Your job is to make exactly those fixes and nothing more.

Brand voice for this article:
${voice}

Scope rules:
- Only modify paragraphs that either contain a locked link or sit directly adjacent to one. Do not touch unrelated prose anywhere else in the article.
- Prefer merging a lone inserted sentence into the preceding paragraph when it reads more naturally that way.
- When flow is off at a join, rewrite the join — one or two sentences — to fix it. Do not restructure the article.
- If the article already reads well, return it unchanged.
- Never add marketing hype, calls to action, or material not grounded in the existing text.

Hard rules (non-negotiable):
1. Every locked anchor text from the list below MUST appear verbatim in your output, inside <a href="…">…</a> tags with the exact href listed. Do not rephrase anchors. Do not change hrefs.
2. Every <!-- wp:acf/… -->, <!-- wp:acf/… /-->, and <!-- /wp:acf/… --> block (including all content between paired ACF delimiters) MUST appear byte-identical in your output. Do not modify, rewrite, reformat, or remove ACF blocks under any circumstances.
3. Preserve every <!-- wp:… --> and <!-- /wp:… --> block delimiter for native blocks too (paragraph, heading, list, list-item, quote, image, etc.). Do not merge blocks across delimiters. Do not invent new block types.
4. Return the FULL article content, not just changed paragraphs. Keep the same Gutenberg block format as the input. Do not wrap in markdown, JSON, or any other envelope.
5. Preserve the article's voice and language. Do not switch from British to American spelling (or vice versa) if the article already has a consistent style.

Output format (strict):
Return two XML-style blocks, in this exact order, nothing before or after:

<REVIEWED_CONTENT>
…the full reviewed article in Gutenberg block format…
</REVIEWED_CONTENT>

<CHANGE_SUMMARY>
A short bullet list (1-5 items) of what you changed and why. If you changed nothing, write "No changes needed — article already flows well."
</CHANGE_SUMMARY>`;

  const user = `Article title: ${args.title}

Locked links (these anchor texts and hrefs MUST appear verbatim in your output inside <a href="…">…</a> tags):
${lockedList}

Article content (Gutenberg block format):

${args.content}`;

  return { system, user };
}
