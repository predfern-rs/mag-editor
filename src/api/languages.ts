import { getWpUrl, getAuthToken } from '../config';

export interface Language {
  slug: string;
  name: string;
  count: number;
}

export async function listLanguages(): Promise<Language[]> {
  const headers = { Authorization: `Basic ${getAuthToken()}` };
  const baseUrl = getWpUrl();

  // Get language list from Polylang
  const langRes = await fetch(`${baseUrl}/wp-json/pll/v1/languages`, { headers });
  if (!langRes.ok) return [];

  const langData = (await langRes.json()) as Array<{
    slug: string;
    name: string;
  }>;

  // Get real post counts per language from the REST API X-WP-Total header
  const counts = await Promise.all(
    langData.map(async (l) => {
      try {
        const res = await fetch(
          `${baseUrl}/wp-json/wp/v2/posts?lang=${l.slug}&per_page=1&status=publish`,
          { headers },
        );
        return {
          slug: l.slug,
          name: l.name,
          count: Number(res.headers.get('x-wp-total') ?? 0),
        };
      } catch {
        return { slug: l.slug, name: l.name, count: 0 };
      }
    }),
  );

  return counts.sort((a, b) => b.count - a.count);
}
