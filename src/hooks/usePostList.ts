import { useQuery } from '@tanstack/react-query';
import type { PostSearchParams } from '../types/wordpress';
import { listPosts } from '../api/posts';

export function usePostList(params: PostSearchParams) {
  return useQuery({
    queryKey: ['posts', params],
    queryFn: () => listPosts(params),
  });
}
