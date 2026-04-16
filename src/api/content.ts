import { wpGet, wpPost } from './wp-client';

interface PostContent {
  id: number;
  title: { rendered: string; raw: string };
  slug: string;
  content: { rendered: string; raw: string };
}

export function getPostContent(id: number): Promise<PostContent> {
  return wpGet<PostContent>(`/posts/${id}`, {
    context: 'edit',
    _fields: 'id,title,slug,content',
  });
}

export function updatePostContent(
  id: number,
  content: string,
): Promise<PostContent> {
  return wpPost<PostContent>(`/posts/${id}`, { content });
}

interface Revision {
  id: number;
  date: string;
  content: { rendered: string; raw: string };
}

/**
 * Get the most recent revisions for a post.
 */
export async function getRevisions(postId: number, count = 5): Promise<Revision[]> {
  return wpGet<Revision[]>(`/posts/${postId}/revisions`, {
    per_page: count,
    _fields: 'id,date,content',
    context: 'edit',
  });
}

/**
 * Revert a post to its previous revision (the one before the current version).
 */
export async function revertToLastRevision(postId: number): Promise<{ success: boolean; restoredDate: string; contentLength: number }> {
  const revisions = await getRevisions(postId, 2);
  // revisions[0] is the current save, revisions[1] is the previous version
  if (revisions.length < 2) {
    throw new Error('No previous revision available to revert to');
  }
  const previousRevision = revisions[1]!;
  const previousContent = previousRevision.content.raw;

  if (!previousContent) {
    throw new Error('Previous revision has no raw content');
  }

  await updatePostContent(postId, previousContent);

  return {
    success: true,
    restoredDate: previousRevision.date,
    contentLength: previousContent.length,
  };
}
