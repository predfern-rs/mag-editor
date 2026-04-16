import type { WpCategory } from '../types/wordpress';
import { wpGet } from './wp-client';

export function listCategories(
  params?: Record<string, string | number | boolean>,
): Promise<WpCategory[]> {
  return wpGet<WpCategory[]>('/categories', { per_page: 100, ...params });
}
