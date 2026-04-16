export interface WpSite {
  id: string;
  name: string;
  url: string;
  authToken: string;
}

// Build sites from env vars
const sites: WpSite[] = [];

// Always add the default site
if (import.meta.env.VITE_WP_URL) {
  sites.push({
    id: 'staging',
    name: 'Staging',
    url: import.meta.env.VITE_WP_URL as string,
    authToken: btoa(`${import.meta.env.VITE_WP_USERNAME}:${import.meta.env.VITE_WP_APP_PASSWORD}`),
  });
}

// Live sites
if (import.meta.env.VITE_WP_RIDESTORE_URL) {
  sites.push({
    id: 'ridestore',
    name: 'Ridestore Mag',
    url: import.meta.env.VITE_WP_RIDESTORE_URL as string,
    authToken: btoa(`${import.meta.env.VITE_WP_RIDESTORE_USERNAME}:${import.meta.env.VITE_WP_RIDESTORE_APP_PASSWORD}`),
  });
}

if (import.meta.env.VITE_WP_DOPE_URL) {
  sites.push({
    id: 'dope',
    name: 'Dope Mag',
    url: import.meta.env.VITE_WP_DOPE_URL as string,
    authToken: btoa(`${import.meta.env.VITE_WP_DOPE_USERNAME}:${import.meta.env.VITE_WP_DOPE_APP_PASSWORD}`),
  });
}

if (import.meta.env.VITE_WP_MONTEC_URL) {
  sites.push({
    id: 'montec',
    name: 'Montec Mag',
    url: import.meta.env.VITE_WP_MONTEC_URL as string,
    authToken: btoa(`${import.meta.env.VITE_WP_MONTEC_USERNAME}:${import.meta.env.VITE_WP_MONTEC_APP_PASSWORD}`),
  });
}

export const SITES = sites;

// Active site state — mutable, changed via the site selector
let activeSite: WpSite = sites[0]!;

export function getActiveSite(): WpSite {
  return activeSite;
}

export function setActiveSite(siteId: string) {
  const site = sites.find((s) => s.id === siteId);
  if (site) activeSite = site;
}

// Backward-compatible exports for existing code
export const WP_BASE_URL = activeSite.url;
export const WP_AUTH_TOKEN = activeSite.authToken;

// For dynamic access (use these in new code)
export function getWpUrl(): string {
  return activeSite.url;
}

export function getAuthToken(): string {
  return activeSite.authToken;
}

// OpenRouter
export const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY as string;
