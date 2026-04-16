import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getPostContent, updatePostContent } from '../api/content';

export function usePostContent(id: number) {
  return useQuery({
    queryKey: ['post-content', id],
    queryFn: () => getPostContent(id),
    enabled: id > 0,
  });
}

export function useUpdatePostContent(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (content: string) => updatePostContent(id, content),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['post-content', id] });
      void queryClient.invalidateQueries({ queryKey: ['post', id] });
    },
  });
}
