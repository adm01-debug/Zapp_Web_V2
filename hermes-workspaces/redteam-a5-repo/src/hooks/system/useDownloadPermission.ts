import { useAuth } from '@/hooks/auth/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

export function useDownloadPermission() {
  const { user } = useAuth();

  const { data: canDownload = false, isLoading } = useQuery({
    queryKey: ['download-permission', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      const { data, error } = await supabase
        .from('profiles')
        .select('can_download')
        .eq('user_id', user.id)
        .single();
      if (error || !data) return false;
      return data.can_download ?? false;
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  return { canDownload, isLoading };
}
