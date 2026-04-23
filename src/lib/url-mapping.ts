/**
 * URL mapping for all magazine sites.
 * Maps WordPress site ID + language to Netlify and live URLs.
 */

interface SiteUrlConfig {
  netlify: string;
  live: string | null; // null = no proxy (staging sites)
}

// Ridestore Mag
const RIDESTORE_URLS: Record<string, SiteUrlConfig> = {
  en: { netlify: 'https://ridestore-mag-en.netlify.app/mag/', live: 'https://www.ridestore.com/mag/' },
  sv: { netlify: 'https://ridestore-mag-se.netlify.app/mag/', live: 'https://www.ridestore.se/mag/' },
  de: { netlify: 'https://ridestore-mag-de.netlify.app/mag/', live: 'https://www.ridestore.de/mag/' },
  it: { netlify: 'https://ridestore-mag-it.netlify.app/it/mag/', live: 'https://www.ridestore.com/it/mag/' },
  fi: { netlify: 'https://ridestore-mag-fi.netlify.app/mag/', live: 'https://www.ridestore.fi/mag/' },
  da: { netlify: 'https://ridestore-mag-dk.netlify.app/dk/mag/', live: 'https://www.ridestore.com/mag/dk/mag/' },
  es: { netlify: 'https://ridestore-mag-es.netlify.app/es/mag/', live: 'https://www.ridestore.com/mag/es/mag/' },
  fr: { netlify: 'https://ridestore-mag-fr.netlify.app/fr/mag/', live: 'https://www.ridestore.com/mag/fr/mag/' },
  nl: { netlify: 'https://ridestore-mag-nl.netlify.app/nl/mag/', live: 'https://www.ridestore.com/mag/nl/mag/' },
};

// Dope Mag
const DOPE_URLS: Record<string, SiteUrlConfig> = {
  en: { netlify: 'https://dope-mag-en.netlify.app/mag/', live: 'https://www.dopesnow.com/mag/' },
  de: { netlify: 'https://dope-mag-de.netlify.app/de/mag/', live: 'https://www.dopesnow.com/de/mag/' },
  nl: { netlify: 'https://dope-mag-nl.netlify.app/nl/mag/', live: 'https://www.dopesnow.com/nl/mag/' },
  it: { netlify: 'https://dope-mag-it.netlify.app/it/mag/', live: 'https://www.dopesnow.com/it/mag/' },
  sv: { netlify: 'https://dope-mag-se.netlify.app/se/mag/', live: 'https://www.dopesnow.com/se/mag/' },
  fr: { netlify: 'https://dope-mag-fr.netlify.app/fr/mag/', live: 'https://www.dopesnow.com/fr/mag/' },
  fi: { netlify: 'https://dope-mag-fi.netlify.app/fi/mag/', live: 'https://www.dopesnow.com/fi/mag/' },
};

// Montec Mag
const MONTEC_URLS: Record<string, SiteUrlConfig> = {
  en: { netlify: 'https://montec-mag-en.netlify.app/mag/', live: 'https://www.montecwear.com/mag/' },
  it: { netlify: 'https://montec-mag-it.netlify.app/it/mag/', live: 'https://www.montecwear.com/it/mag/' },
  nl: { netlify: 'https://montec-mag-nl.netlify.app/nl/mag/', live: 'https://www.montecwear.com/nl/mag/' },
  sv: { netlify: 'https://montec-mag-se.netlify.app/se/mag/', live: 'https://www.montecwear.com/se/mag/' },
  fi: { netlify: 'https://montec-mag-fi.netlify.app/fi/mag/', live: 'https://www.montecwear.com/fi/mag/' },
  fr: { netlify: 'https://montec-mag-fr.netlify.app/fr/mag/', live: 'https://www.montecwear.com/fr/mag/' },
  de: { netlify: 'https://montec-mag-de.netlify.app/de/mag/', live: 'https://www.montecwear.com/de/mag/' },
};

// Staging sites (no proxy)
const STAGING_URLS: Record<string, SiteUrlConfig> = {
  en: { netlify: 'https://ridestore-mag-staging.netlify.app/mag/', live: null },
  fr: { netlify: 'https://redistore-mag-staging-fr.netlify.app/fr/mag/', live: null },
};

// Sustainability hubs
const DOPE_SUSTAINABILITY: Record<string, SiteUrlConfig> = {
  en: { netlify: 'https://dope-sustainability-en.netlify.app/sustainability/', live: 'https://www.dopesnow.com/sustainability/' },
};

const MONTEC_SUSTAINABILITY: Record<string, SiteUrlConfig> = {
  en: { netlify: 'https://montec-sustainability-en.netlify.app/sustainability/', live: 'https://www.montecwear.com/sustainability/' },
};

// Map site IDs to URL configs
const SITE_URL_MAP: Record<string, Record<string, SiteUrlConfig>> = {
  staging: STAGING_URLS,
  ridestore: RIDESTORE_URLS,
  dope: DOPE_URLS,
  montec: MONTEC_URLS,
  'dope-sustainability': DOPE_SUSTAINABILITY,
  'montec-sustainability': MONTEC_SUSTAINABILITY,
};

export interface ArticleUrls {
  netlify: string | null;
  live: string | null;
  wordpress: string;
}

// Map site IDs to WordPress base URLs for admin links
const SITE_WP_ADMIN: Record<string, string> = {
  staging: 'https://wordpress-1269845-4600687.cloudwaysapps.com',
  ridestore: 'https://wordpress-1269845-4582241.cloudwaysapps.com',
  dope: 'https://wordpress-1269845-4582242.cloudwaysapps.com',
  montec: 'https://wordpress-1269845-4582243.cloudwaysapps.com',
};

/**
 * Get all URLs for an article given the site, language, slug, and WP post URL.
 */
export function getArticleUrls(
  siteId: string,
  lang: string,
  slug: string,
  wpUrl: string,
  wpPostId?: number,
): ArticleUrls {
  const siteUrls = SITE_URL_MAP[siteId];
  const config = siteUrls?.[lang];

  // Build wp-admin edit link if we have a post ID
  let wordpress = wpUrl;
  if (wpPostId && wpPostId > 0) {
    const wpBase = SITE_WP_ADMIN[siteId];
    if (wpBase) {
      wordpress = `${wpBase}/wp-admin/post.php?post=${wpPostId}&action=edit`;
    }
  }

  return {
    netlify: config ? `${config.netlify}${slug}/` : null,
    live: config?.live ? `${config.live}${slug}/` : null,
    wordpress,
  };
}

/**
 * Try to detect the site and language from a WordPress URL.
 * Used when we only have the WP URL (e.g. from a report).
 */
export function detectSiteFromWpUrl(wpUrl: string): { siteId: string; lang: string } | null {
  // For now, default to staging + en since that's what we're working with
  // This can be expanded when multi-site is fully configured
  if (wpUrl.includes('4600687')) return { siteId: 'staging', lang: 'en' };
  if (wpUrl.includes('ridestore.com')) return { siteId: 'ridestore', lang: 'en' };
  if (wpUrl.includes('dopesnow.com')) return { siteId: 'dope', lang: 'en' };
  if (wpUrl.includes('montecwear.com')) return { siteId: 'montec', lang: 'en' };
  return null;
}
