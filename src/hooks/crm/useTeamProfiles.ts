import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Uses get_team_profiles RPC (SECURITY DEFINER) for safe team member listing.
 * Avoids exposing sensitive profile columns via direct table queries.
 */
export function useTeamProfiles(enabled = true) {
  return useQuery({
    queryKey: ['team-profiles-rpc'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_team_profiles');
      if (error) throw error;
      return data || [];
    },
    enabled,
    staleTime: 30_000,
  });
}
