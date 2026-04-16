export interface WpPost {
  id: number;
  title: { rendered: string; raw: string };
  slug: string;
  status: string;
  date: string;
  modified: string;
  link: string;
  content: { rendered: string; raw: string };
  excerpt: { rendered: string; raw: string };
  categories: number[];
  tags: number[];
  featured_media: number;
  meta: Record<string, unknown>;
  acf: Record<string, unknown>;
  yoast_head_json?: Record<string, unknown>;
}

export interface WpPostListItem {
  id: number;
  title: { rendered: string };
  slug: string;
  status: string;
  date: string;
  modified: string;
  link: string;
  categories: number[];
  tags: number[];
}

export interface WpCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  parent: number;
  count: number;
  link: string;
}

export interface WpTag {
  id: number;
  name: string;
  slug: string;
  description: string;
  count: number;
  link: string;
}

export interface YoastMeta {
  _yoast_wpseo_title: string;
  _yoast_wpseo_metadesc: string;
  _yoast_wpseo_focuskw: string;
  _yoast_wpseo_canonical: string;
}

export interface PostSearchParams {
  search?: string;
  slug?: string;
  status?: string;
  category?: number;
  tag?: number;
  lang?: string;
  per_page?: number;
  page?: number;
}

export type AcfFields = Record<string, unknown>;
