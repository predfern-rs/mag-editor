import type { YoastMeta } from '../types/wordpress';
import { wpGet, wpPost } from './wp-client';

interface YoastPostData {
  id: number;
  title: { rendered: string; raw: string };
  slug: string;
  meta: Record<string, unknown>;
  yoast_head_json?: Record<string, unknown>;
}

export function getYoast(id: number): Promise<YoastPostData> {
  return wpGet<YoastPostData>(`/posts/${id}`, {
    context: 'edit',
    _fields: 'id,title,slug,meta,yoast_head_json',
  });
}

export function updateYoast(
  id: number,
  meta: Partial<YoastMeta>,
): Promise<YoastPostData> {
  return wpPost<YoastPostData>(`/posts/${id}`, { meta });
}
