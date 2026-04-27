// ── Types ──────────────────────────────────────────────────────────────

export interface AuditReport {
  title: string;
  generatedDate: string;
  stats: {
    articlesAudited: number;
    linksToAdd: number;
    linksToKeep: number;
    linksToRemove: number;
    shopLinksToAdd: number;
    shopLinksToKeep: number;
  };
  clusters: ClusterInfo[];
  articles: ArticleAudit[];
}

export interface ClusterInfo {
  name: string;
  pillarSlug: string;
  supportingCount: number;
}

export interface ArticleAudit {
  id: string;
  title: string;
  url: string;
  funnelStage: string;
  context: string;
  role: string;
  cluster: string;
  reasoning: string;
  recommendations: LinkRecommendation[];
  /**
   * v2 reports include a per-article carousel verdict via `.carousel-badge`.
   * Older reports omit it; consumers must treat this as optional.
   */
  carousel?: CarouselRecommendation;
}

export type CarouselAction = 'keep' | 'move_to_bottom' | 'remove' | 'none';

export interface CarouselRecommendation {
  action: CarouselAction;
  label: string;
  positionPct?: number;
  positionRegion?: 'TOP' | 'BOTTOM';
}

export interface LinkRecommendation {
  action: 'add' | 'keep' | 'remove';
  section: 'article' | 'shop' | 'remove';
  anchor: string;
  targetUrl: string;
  reason: string;
  suggestedSentence: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

function txt(el: Element | null | undefined): string {
  return el?.textContent?.trim() ?? '';
}

function parseStatNumber(label: string, statCards: NodeListOf<Element>): number {
  for (const card of statCards) {
    const cardLabel = txt(card.querySelector('.label'));
    if (cardLabel.toLowerCase().includes(label.toLowerCase())) {
      return Number(txt(card.querySelector('.number'))) || 0;
    }
  }
  return 0;
}

function normaliseAction(raw: string): 'add' | 'keep' | 'remove' {
  const upper = raw.toUpperCase().trim();
  if (upper === 'ADD') return 'add';
  if (upper === 'KEEP') return 'keep';
  return 'remove';
}

function sectionFromHeading(heading: string): 'article' | 'shop' | 'remove' {
  const lower = heading.toLowerCase();
  if (lower.includes('remove')) return 'remove';
  if (lower.includes('shop')) return 'shop';
  return 'article';
}

// ── Parser ─────────────────────────────────────────────────────────────

export function parseAuditReport(htmlString: string): AuditReport {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');

  // Title & date
  const title = txt(doc.querySelector('h1')) || txt(doc.querySelector('title')) || 'Content Audit Report';
  const generatedDate = txt(doc.querySelector('.generated-date')) || new Date().toISOString();

  // Stats
  const statCards = doc.querySelectorAll('.stat-card');
  const stats = {
    articlesAudited: parseStatNumber('Articles Audited', statCards),
    linksToAdd: parseStatNumber('Article Links to ADD', statCards) || parseStatNumber('Links to ADD', statCards),
    linksToKeep: parseStatNumber('Article Links to KEEP', statCards) || parseStatNumber('Links to KEEP', statCards),
    linksToRemove: parseStatNumber('Links to REMOVE', statCards) || parseStatNumber('Remove', statCards),
    shopLinksToAdd: parseStatNumber('Shop Links to ADD', statCards),
    shopLinksToKeep: parseStatNumber('Shop Links to KEEP', statCards),
  };

  // Clusters
  const clusters: ClusterInfo[] = [];
  for (const card of doc.querySelectorAll('.cluster-card')) {
    const name = txt(card.querySelector('.cluster-name'));
    const statsText = txt(card.querySelector('.cluster-stats'));

    // Parse "Pillar: best-apres-ski-resorts | 7 supporting articles"
    let pillarSlug = '';
    let supportingCount = 0;
    const pillarMatch = statsText.match(/Pillar:\s*([^\s|]+)/i);
    if (pillarMatch) pillarSlug = pillarMatch[1];
    const countMatch = statsText.match(/(\d+)\s*supporting/i);
    if (countMatch) supportingCount = Number(countMatch[1]);

    clusters.push({ name, pillarSlug, supportingCount });
  }

  // Articles
  const articles: ArticleAudit[] = [];
  for (const card of doc.querySelectorAll('.article-card')) {
    const id = card.id || '';
    const articleTitle = txt(card.querySelector('.article-title'));
    const url = txt(card.querySelector('.article-url'));

    // Badges
    const badges = card.querySelectorAll('.badge');
    let funnelStage = '';
    let context = '';
    let role = '';
    let cluster = '';

    for (const badge of badges) {
      const classes = badge.classList;
      const text = txt(badge);

      if (classes.contains('badge-tof')) funnelStage = text;
      else if (classes.contains('badge-mof')) funnelStage = text;
      else if (classes.contains('badge-bof')) funnelStage = text;
      else if (classes.contains('badge-conv')) funnelStage = text;
      else if (classes.contains('badge-ski')) context = text;
      else if (classes.contains('badge-snowboard')) context = text;
      else if (classes.contains('badge-outdoor')) context = text;
      else if (classes.contains('badge-pillar')) role = text;
      else if (classes.contains('badge-supporting')) role = text;
      else if (badge.getAttribute('style')) {
        // The cluster badge has an inline style
        cluster = text;
      }
    }

    const reasoning = txt(card.querySelector('.reasoning'));

    // Link recommendations
    const recommendations: LinkRecommendation[] = [];
    for (const linkSection of card.querySelectorAll('.link-section')) {
      const heading = txt(linkSection.querySelector('h4'));
      const section = sectionFromHeading(heading);

      for (const item of linkSection.querySelectorAll('.link-item')) {
        const actionRaw = txt(item.querySelector('.action'));
        const action = normaliseAction(actionRaw);
        const anchor = txt(item.querySelector('.anchor'));
        const targetRaw = txt(item.querySelector('.target'));
        // Strip leading " → " or "→ " prefix from target
        const targetUrl = targetRaw.replace(/^[\s→]+/, '').trim();
        const reason = txt(item.querySelector('.why'));
        const suggestedSentence = txt(item.querySelector('.sentence'));

        recommendations.push({
          action,
          section,
          anchor,
          targetUrl,
          reason,
          suggestedSentence,
        });
      }
    }

    const carousel = parseCarouselRecommendation(card, reasoning);

    articles.push({
      id,
      title: articleTitle,
      url,
      funnelStage,
      context,
      role,
      cluster,
      reasoning,
      recommendations,
      ...(carousel ? { carousel } : {}),
    });
  }

  return { title, generatedDate, stats, clusters, articles };
}

/**
 * Read v2 report carousel data from an article card. Returns undefined for
 * v1 reports (no `.carousel-badge` present) so legacy reports keep working.
 *
 * The badge class encodes the verdict:
 *   carousel-keep    → action 'keep'
 *   carousel-move    → action 'move_to_bottom'
 *   carousel-remove  → action 'remove'
 *   carousel-none    → action 'none'
 *
 * The reasoning text usually carries a `[Carousel correction: ... block at N% (TOP|BOTTOM) ...]`
 * clause we mine for the position-pct so the UI can say "currently at 8%".
 */
function parseCarouselRecommendation(
  card: Element,
  reasoning: string,
): CarouselRecommendation | undefined {
  // The carousel badge usually lives at the bottom of the article card, but
  // v2 report HTML has a stray closing </div> that prematurely closes the
  // .article-card so the badge ends up as a SIBLING after JSDOM auto-fixes
  // the malformed markup. Look in both places to be tolerant of either.
  let badge = card.querySelector('.carousel-badge');
  if (!badge) {
    let cursor: Element | null = card.nextElementSibling;
    while (cursor && !cursor.classList.contains('article-card')) {
      const found = cursor.classList.contains('carousel-badge')
        ? cursor
        : cursor.querySelector('.carousel-badge');
      if (found) {
        badge = found;
        break;
      }
      cursor = cursor.nextElementSibling;
    }
  }
  if (!badge) return undefined;

  const label = txt(badge);
  let action: CarouselAction;
  if (badge.classList.contains('carousel-keep')) action = 'keep';
  else if (badge.classList.contains('carousel-move')) action = 'move_to_bottom';
  else if (badge.classList.contains('carousel-remove')) action = 'remove';
  else if (badge.classList.contains('carousel-none')) action = 'none';
  else {
    // Fallback: parse the label text. Ensures we don't drop a future variant.
    const upper = label.toUpperCase();
    if (upper.includes('MOVE')) action = 'move_to_bottom';
    else if (upper.includes('REMOVE')) action = 'remove';
    else if (upper.includes('KEEP')) action = 'keep';
    else action = 'none';
  }

  const positionMatch = reasoning.match(/block at (\d+)%\s*\((TOP|BOTTOM)\)/i);
  const positionPct = positionMatch ? Number(positionMatch[1]) : undefined;
  const positionRegion = positionMatch ? (positionMatch[2]!.toUpperCase() as 'TOP' | 'BOTTOM') : undefined;

  return {
    action,
    label,
    ...(positionPct !== undefined ? { positionPct } : {}),
    ...(positionRegion ? { positionRegion } : {}),
  };
}
