import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface StorageRef {
  bucket: string;
  path: string;
}

export function useResolvedStorageUrl(ref: StorageRef | null | undefined) {
  return useQuery<string | null>({
    queryKey: ['team-storage-url', ref?.bucket, ref?.path],
    queryFn: async () => {
      if (!ref) return null;
      const { data, error } = await supabase.storage
        .from(ref.bucket)
        .createSignedUrl(ref.path, 3600);
      if (error) throw error;
      return data?.signedUrl ?? null;
    },
    enabled: !!ref?.bucket && !!ref?.path,
    staleTime: 50 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}
