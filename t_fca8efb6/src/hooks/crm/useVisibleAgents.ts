import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';

/**
 * Uses get_visible_agent_ids RPC for RBAC-filtered agent visibility.
 * Special agents only see explicitly granted agent IDs.
 */
export function useVisibleAgents() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['visible-agent-ids', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.rpc('get_visible_agent_ids', {
        _user_id: user.id,
      });
      if (error) throw error;
      return (data || []) as string[];
    },
    enabled: !!user,
    staleTime: 60_000,
  });
}
