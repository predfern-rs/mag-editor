import { getWpUrl, getAuthToken } from '../config';

function getBase(): string {
  return `${getWpUrl()}/wp-json/wp/v2`;
}

export async function wpGet<T>(
  endpoint: string,
  params?: Record<string, string | number | boolean>,
): Promise<T> {
  const url = new URL(`${getBase()}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    });
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Basic ${getAuthToken()}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `WordPress API error: ${res.status}`);
  }
  return res.json();
}

export async function wpPost<T>(
  endpoint: string,
  data: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${getBase()}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${getAuthToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `WordPress API error: ${res.status}`);
  }
  return res.json();
}

export async function wpDelete<T>(
  endpoint: string,
  params?: Record<string, string | number | boolean>,
): Promise<T> {
  const url = new URL(`${getBase()}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) url.searchParams.set(k, String(v));
    });
  }
  const res = await fetch(url.toString(), {
    method: 'DELETE',
    headers: { Authorization: `Basic ${getAuthToken()}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `WordPress API error: ${res.status}`);
  }
  return res.json();
}
