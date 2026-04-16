import type { PostSearchParams, WpPost, WpPostListItem } from '../types/wordpress';
import { wpDelete, wpGet, wpPost } from './wp-client';

export function listPosts(params: PostSearchParams): Promise<WpPostListItem[]> {
  const query: Record<string, string | number | boolean> = {};
  if (params.search) query.search = params.search;
  if (params.slug) query.slug = params.slug;
  if (params.status) query.status = params.status;
  if (params.category) query.categories = params.category;
  if (params.tag) query.tags = params.tag;
  if (params.lang) query.lang = params.lang;
  if (params.per_page) query.per_page = params.per_page;
  if (params.page) query.page = params.page;
  query._fields = 'id,title,slug,status,date,modified,link,categories,tags';
  return wpGet<WpPostListItem[]>('/posts', query);
}

export function getPost(id: number): Promise<WpPost> {
  return wpGet<WpPost>(`/posts/${id}`, { context: 'edit' });
}

export function updatePost(
  id: number,
  data: Partial<WpPost>,
): Promise<WpPost> {
  return wpPost<WpPost>(`/posts/${id}`, data as Record<string, unknown>);
}

export function createPost(
  data: Partial<WpPost>,
): Promise<WpPost> {
  return wpPost<WpPost>('/posts', data as Record<string, unknown>);
}

export function deletePost(
  id: number,
  force = false,
): Promise<WpPost> {
  return wpDelete<WpPost>(`/posts/${id}`, { force });
}
