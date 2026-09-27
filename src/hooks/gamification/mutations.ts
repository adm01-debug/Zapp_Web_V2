import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AgentStats } from './types';

export function useGamificationMutations(profileId: string | undefined, _currentStats?: AgentStats | null) {
  const queryClient = useQueryClient();

  const addXpMutation = useMutation({
    mutationFn: async ({ xp }: { xp: number; reason: string }) => {
      if (!profileId) throw new Error('No profile ID');
      const { data, error } = await supabase.rpc('add_agent_xp', {
        p_profile_id: profileId,
        p_xp: xp,
      });
      if (error) throw error;
      if (!data) throw new Error('No stats found');
      const d = data as { newXp: number; newLevel: number; previousLevel: number; leveledUp: boolean };
      return { newXp: d.newXp, newLevel: d.newLevel, leveledUp: d.leveledUp, previousLevel: d.previousLevel };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-stats', profileId] }),
  });

  const grantAchievementMutation = useMutation({
    mutationFn: async ({ type, name, description, xpReward }: { type: string; name: string; description?: string; xpReward: number }) => {
      if (!profileId) throw new Error('No profile ID');
      const { data, error } = await supabase.rpc('grant_agent_achievement', {
        p_profile_id: profileId,
        p_type: type,
        p_name: name,
        p_description: description ?? null,
        p_xp_reward: xpReward,
      });
      if (error) throw error;
      if (!data) return { alreadyHad: false as const };
      const d = data as { alreadyHad: boolean; newXp?: number; newLevel?: number; leveledUp?: boolean };
      if (d.alreadyHad) return { alreadyHad: true as const };
      return { alreadyHad: false as const, newXp: d.newXp!, newLevel: d.newLevel!, leveledUp: d.leveledUp! };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-stats', profileId] });
      queryClient.invalidateQueries({ queryKey: ['agent-achievements', profileId] });
    },
  });

  const updateStreakMutation = useMutation({
    mutationFn: async (increment: boolean) => {
      if (!profileId) throw new Error('No profile ID');
      const { data, error } = await supabase.rpc('update_agent_streak', {
        p_profile_id: profileId,
        p_increment: increment,
      });
      if (error) throw error;
      if (!data) throw new Error('No stats found');
      const d = data as { newStreak: number; newBestStreak: number };
      return { newStreak: d.newStreak, newBestStreak: d.newBestStreak };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-stats', profileId] }),
  });

  const incrementMessagesMutation = useMutation({
    mutationFn: async (type: 'sent' | 'received') => {
      if (!profileId) throw new Error('No profile ID');
      const { data, error } = await supabase.rpc('increment_agent_messages', {
        p_profile_id: profileId,
        p_type: type,
      });
      if (error) throw error;
      if (!data) throw new Error('No stats found');
      const d = data as { newSent: number; newReceived: number };
      return { newSent: d.newSent, newReceived: d.newReceived };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-stats', profileId] }),
  });

  const incrementResolutionsMutation = useMutation({
    mutationFn: async () => {
      if (!profileId) throw new Error('No profile ID');
      const { data, error } = await supabase.rpc('increment_agent_resolutions', {
        p_profile_id: profileId,
      });
      if (error) throw error;
      if (!data) throw new Error('No stats found');
      const d = data as { newResolutions: number };
      return { newResolutions: d.newResolutions };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-stats', profileId] }),
  });

  return {
    addXp: addXpMutation.mutateAsync,
    grantAchievement: grantAchievementMutation.mutateAsync,
    updateStreak: updateStreakMutation.mutateAsync,
    incrementMessages: incrementMessagesMutation.mutateAsync,
    incrementResolutions: incrementResolutionsMutation.mutateAsync,
    isAddingXp: addXpMutation.isPending,
    isGrantingAchievement: grantAchievementMutation.isPending,
  };
}
