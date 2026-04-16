import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { YoastMeta } from '../types/wordpress';
import { getYoast, updateYoast } from '../api/yoast';

export function useYoast(id: number) {
  return useQuery({
    queryKey: ['yoast', id],
    queryFn: () => getYoast(id),
    enabled: id > 0,
  });
}

export function useUpdateYoast(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (meta: Partial<YoastMeta>) => updateYoast(id, meta),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['yoast', id] });
      void queryClient.invalidateQueries({ queryKey: ['post', id] });
    },
  });
}
