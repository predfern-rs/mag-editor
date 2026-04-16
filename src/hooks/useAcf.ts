import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AcfFields } from '../types/wordpress';
import { getAcfFields, updateAcfFields } from '../api/acf';

export function useAcf(id: number) {
  return useQuery({
    queryKey: ['acf', id],
    queryFn: () => getAcfFields(id),
    enabled: id > 0,
  });
}

export function useUpdateAcf(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (acf: AcfFields) => updateAcfFields(id, acf),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['acf', id] });
      void queryClient.invalidateQueries({ queryKey: ['post', id] });
    },
  });
}
