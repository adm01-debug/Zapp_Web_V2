import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/auth/useAuth';
import { supabase } from '@/integrations/supabase/client';

export function useCRMAdminAccess(): boolean | null {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['crm-admin-access', user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await supabase.rpc('is_admin_or_supervisor', { _user_id: user.id });
      return !error && data === true;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
  if (!user) return false;
  return query.isPending ? null : query.data === true;
}
