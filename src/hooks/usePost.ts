import { useQuery } from '@tanstack/react-query';
import { getPost } from '../api/posts';

export function usePost(id: number) {
  return useQuery({
    queryKey: ['post', id],
    queryFn: () => getPost(id),
    enabled: id > 0,
  });
}
