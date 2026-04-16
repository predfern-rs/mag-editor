import { wpGet, wpPost } from './wp-client';

interface AcfPostData {
  id: number;
  title: { rendered: string; raw: string };
  slug: string;
  acf: Record<string, unknown>;
}

export function getAcfFields(id: number): Promise<AcfPostData> {
  return wpGet<AcfPostData>(`/posts/${id}`, {
    context: 'edit',
    _fields: 'id,title,slug,acf',
  });
}

export function updateAcfFields(
  id: number,
  fields: Record<string, unknown>,
): Promise<AcfPostData> {
  return wpPost<AcfPostData>(`/posts/${id}`, { acf: fields });
}
