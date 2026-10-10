import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { useGamificationMutations } from './mutations';
import type { AgentStats, Achievement } from './types';

// Re-export types and utilities for external consumers
export type { AgentStats, Achievement } from './types';
export { ACHIEVEMENT_TYPES } from './types';
export { calculateLevel, xpForNextLevel, levelProgress } from './levelUtils';

export const useAgentGamification = () => {
  const { user } = useAuth();

  const profileQuery = useQuery({
    queryKey: ['user-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const profileId = profileQuery.data?.id;

  const statsQuery = useQuery({
    queryKey: ['agent-stats', profileId],
    queryFn: async () => {
      if (!profileId) return null;
      const { data, error } = await supabase
        .from('agent_stats')
        .select('*')
        .eq('profile_id', profileId)
        .maybeSingle();
      if (error) throw error;
      return data as AgentStats | null;
    },
    enabled: !!profileId,
    refetchInterval: 30000,
  });

  const achievementsQuery = useQuery({
    queryKey: ['agent-achievements', profileId],
    queryFn: async () => {
      if (!profileId) return [];
      const { data, error } = await supabase
        .from('agent_achievements')
        .select('*')
        .eq('profile_id', profileId)
        .order('earned_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as Achievement[];
    },
    enabled: !!profileId,
  });

  const mutations = useGamificationMutations(profileId, statsQuery.data);

  return {
    stats: statsQuery.data,
    achievements: achievementsQuery.data || [],
    isLoading: statsQuery.isLoading || achievementsQuery.isLoading,
    profileId,
    ...mutations,
  };
};
