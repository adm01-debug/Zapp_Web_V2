import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { calculateLevel } from './levelUtils';
import type { AgentStats } from './types';

export function useGamificationMutations(profileId: string | undefined, currentStats: AgentStats | null | undefined) {
  const queryClient = useQueryClient();

  const addXpMutation = useMutation({
    mutationFn: async ({ xp }: { xp: number; reason: string }) => {
      if (!profileId) throw new Error('No profile ID');
      const newXp = (currentStats?.xp || 0) + xp;
      const newLevel = calculateLevel(newXp);
      const leveledUp = newLevel > (currentStats?.level || 1);

      const { error } = await supabase
        .from('agent_stats')
        .update({ xp: newXp, level: newLevel, updated_at: new Date().toISOString() })
        .eq('profile_id', profileId);
      if (error) throw error;
      return { newXp, newLevel, leveledUp, previousLevel: currentStats?.level || 1 };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-stats', profileId] }),
  });

  const grantAchievementMutation = useMutation({
    mutationFn: async ({ type, name, description, xpReward }: { type: string; name: string; description?: string; xpReward: number }) => {
      if (!profileId) throw new Error('No profile ID');

      const { data: existing } = await supabase
        .from('agent_achievements')
        .select('id')
        .eq('profile_id', profileId)
        .eq('achievement_type', type)
        .maybeSingle();

      const allowDuplicates = ['daily_goal', 'streak', 'message_milestone'];
      if (existing && !allowDuplicates.includes(type)) return { alreadyHad: true };

      const { error: achievementError } = await supabase
        .from('agent_achievements')
        .insert({ profile_id: profileId, achievement_type: type, achievement_name: name, achievement_description: description, xp_earned: xpReward });
      if (achievementError) throw achievementError;

      const newXp = (currentStats?.xp || 0) + xpReward;
      const newLevel = calculateLevel(newXp);
      const newAchievementsCount = (currentStats?.achievements_count || 0) + 1;

      const { error: statsError } = await supabase
        .from('agent_stats')
        .update({ xp: newXp, level: newLevel, achievements_count: newAchievementsCount, updated_at: new Date().toISOString() })
        .eq('profile_id', profileId);
      if (statsError) throw statsError;

      return { alreadyHad: false, newXp, newLevel, leveledUp: newLevel > (currentStats?.level || 1) };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-stats', profileId] });
      queryClient.invalidateQueries({ queryKey: ['agent-achievements', profileId] });
    },
  });

  const updateStreakMutation = useMutation({
    mutationFn: async (increment: boolean) => {
      if (!profileId) throw new Error('No profile ID');
      let newStreak: number;
      let newBestStreak = currentStats?.best_streak || 0;

      if (increment) {
        newStreak = (currentStats?.current_streak || 0) + 1;
        if (newStreak > newBestStreak) newBestStreak = newStreak;
      } else {
        newStreak = 0;
      }

      const { error } = await supabase
        .from('agent_stats')
        .update({ current_streak: newStreak, best_streak: newBestStreak, updated_at: new Date().toISOString() })
        .eq('profile_id', profileId);
      if (error) throw error;
      return { newStreak, newBestStreak };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-stats', profileId] }),
  });

  const incrementMessagesMutation = useMutation({
    mutationFn: async (type: 'sent' | 'received') => {
      if (!profileId) throw new Error('No profile ID');
      const newSent = type === 'sent' ? (currentStats?.messages_sent || 0) + 1 : currentStats?.messages_sent || 0;
      const newReceived = type === 'received' ? (currentStats?.messages_received || 0) + 1 : currentStats?.messages_received || 0;

      const { error } = await supabase
        .from('agent_stats')
        .update({ messages_sent: newSent, messages_received: newReceived, updated_at: new Date().toISOString() })
        .eq('profile_id', profileId);
      if (error) throw error;
      return { newSent, newReceived };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-stats', profileId] }),
  });

  const incrementResolutionsMutation = useMutation({
    mutationFn: async () => {
      if (!profileId) throw new Error('No profile ID');
      const newResolutions = (currentStats?.conversations_resolved || 0) + 1;

      const { error } = await supabase
        .from('agent_stats')
        .update({ conversations_resolved: newResolutions, updated_at: new Date().toISOString() })
        .eq('profile_id', profileId);
      if (error) throw error;
      return { newResolutions };
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
