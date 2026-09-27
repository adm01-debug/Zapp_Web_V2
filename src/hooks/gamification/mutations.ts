import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AgentStats } from './types';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _Unused = AgentStats; // keep import for type consumers

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
      if (!profileId) throt¹•ÜÉÉ½È 9¼ÁÉ½™¥±”%œ¤ì(€€€€€½¹ÍÐì‘…Ñ„°•ÉÉ½Èô€ô…Ý…¥ÐÍÕÁ…‰…Í”¹ÉÁŒ ÕÁ‘…Ñ•}…•¹Ñ}ÍÑÉ•…¬œ°ì(€€€€€€€Á}ÁÉ½™¥±•}¥èÁÉ½™¥±•%°(€€€€€€€Á}¥¹É•µ•¹Ðè¥¹É•µ•¹Ð°(€€€€€ô¤ì(€€€€€¥˜€¡•ÉÉ½È¤Ñ¡É½Ü•ÉÉ½Èì(€€€€€¥˜€ …‘…Ñ„¤Ñ¡É½Ü¹•ÜÉÉ½È 9¼ÍÑ…ÑÌ™½Õ¹œ¤ì(€€€€€½¹ÍÐ€ô‘…Ñ„…Ìì¹•ÝMÑÉ•…¬è¹Õµ‰•Èì¹•Ý	•ÍÑMÑÉ•…¬è¹Õµ‰•Èôì(€€€€€É•ÑÕÉ¸ì¹•ÝMÑÉ•…¬è¹¹•ÝMÑÉ•…¬°¹•Ý	•ÍÑMÑÉ•…¬è¹¹•Ý	•ÍÑMÑÉ•…¬ôì(€€€ô°(€€€½¹MÕ•ÍÌè€ ¤€ôøÅÕ•Éå±¥•¹Ð¹¥¹Ù…±¥‘…Ñ•EÕ•É¥•Ì¡ìÅÕ•Éå-•äèl…•¹ÐµÍÑ…ÑÌœ°ÁÉ½™¥±•%‘tô¤°(€ô¤ì((€½¹ÍÐ¥¹É•µ•¹Ñ5•ÍÍ…•Í5ÕÑ…Ñ¥½¸€ôÕÍ•5ÕÑ…Ñ¥½¸¡ì(€€€µÕÑ…Ñ¥½¹¸è…Íå¹Œ€¡ÑåÁ”è€Í•¹Ðœð€É••¥Ù•œ¤€ôøì(€€€€€¥˜€ …ÁÉ½™¥±•%¤Ñ¡É½Ü¹•ÜÉÉ½È 9¼ÁÉ½™¥±”%œ¤ì(€€€€€½¹ÍÐì‘…Ñ„°•ÉÉ½Èô€ô…Ý…¥ÐÍÕÁ…‰…Í”¹ÉÁŒ ¥¹É•µ•¹Ñ}…•¹Ñ}µ•ÍÍ…•Ìœ°ì(€€€€€€€Á}ÁÉ½™¥±•}¥èÁÉ½™¥±•%°(€€€€€€€Á}ÑåÁ”èÑåÁ”°(€€€€€ô¤ì(€€€€€¥˜€¡•ÉÉ½È¤Ñ¡É½Ü•ÉÉ½Èì(€€€€€¥˜€ …‘…Ñ„¤Ñ¡É½Ü¹•ÜÉÉ½È 9¼ÍÑ…ÑÌ™½Õ¹œ¤ì(€€€€€½¹ÍÐ€ô‘…Ñ„…Ìì¹•ÝM•¹Ðè¹Õµ‰•Èì¹•ÝI••¥Ù•è¹Õµ‰•Èôì(€€€€€É•ÑÕÉ¸ì¹•ÝM•¹Ðè¹¹•ÝM•¹Ð°¹•ÝI••¥Ù•è¹¹•ÝI••¥Ù•ôì(€€€ô°(€€€½¹MÕ•ÍÌè€ ¤€ôøÅÕ•Éå±¥•¹Ð¹¥¹Ù…±¥‘…Ñ•EÕ•É¥•Ì¡ìÅÕ•Éå-•äèl…•¹ÐµÍÑ…ÑÌœ°ÁÉ½™¥±•%‘tô¤°(€ô¤ì((€½¹ÍÐ¥¹É•µ•¹ÑI•Í½±ÕÑ¥½¹Í5ÕÑ…Ñ¥½¸€ôÕÍ•5ÕÑ…Ñ¥½¸¡ì(€€€µÕÑ…Ñ¥½¹¸è…Íå¹Œ€ ¤€ôøì(€€€€€¥˜€ …ÁÉ½™¥±•%¤Ñ¡É½Ü¹•ÜÉÉ½È 9¼ÁÉ½™¥±”%œ¤ì(€€€€€½¹ÍÐì‘…Ñ„°•ÉÉ½Èô€ô…Ý…¥ÐÍÕÁ…‰…Í”¹ÉÁŒ ¥¹É•µ•¹Ñ}…•¹Ñ}É•Í½±ÕÑ¥½¹Ìœ°ì(€€€€€€€Á}ÁÉ½™¥±•}¥èÁÉ½™¥±•%°(€€€€€ô¤ì(€€€€€¥˜€¡•ÉÉ½È¤Ñ¡É½Ü•ÉÉ½Èì(€€€€€¥˜€ …‘…Ñ„¤Ñ¡É½Ü¹•ÜÉÉ½È 9¼ÍÑ…ÑÌ™½Õ¹œ¤ì(€€€€€½¹ÍÐ€ô‘…Ñ„…Ìì¹•ÝI•Í½±ÕÑ¥½¹Ìè¹Õµ‰•Èôì(€€€€€É•ÑÕÉ¸ì¹•ÝI•Í½±ÕÑ¥½¹Ìè¹¹•ÝI•Í½±ÕÑ¥½¹Ìôì(€€€ô°(€€€½¹MÕ•ÍÌè€ ¤€ôøÅÕ•Éå±¥•¹Ð¹¥¹Ù…±¥‘…Ñ•EÕ•É¥•Ì¡ìÅÕ•Éå-•äèl…•¹ÐµÍÑ…ÑÌœ°ÁÉ½™¥±•%‘tô¤°(€ô¤ì((€É•ÑÕÉ¸ì(€€€…‘‘aÀè…‘‘aÁ5ÕÑ…Ñ¥½¸¹µÕÑ…Ñ•Íå¹Œ°(€€€É…¹Ñ¡¥•Ù•µ•¹ÐèÉ…¹Ñ¡¥•Ù•µ•¹Ñ5ÕÑ…Ñ¥½¸¹µÕÑ…Ñ•Íå¹Œ°(€€€ÕÁ‘…Ñ•MÑÉ•…¬èÕÁ‘…Ñ•MÑÉ•…­5ÕÑ…Ñ¥½¸¹µÕÑ…Ñ•Íå¹Œ°(€€€¥¹É•µ•¹Ñ5•ÍÍ…•Ìè¥¹É•µ•¹Ñ5•ÍÍ…•Í5ÕÑ…Ñ¥½¸¹µÕÑ…Ñ•Íå¹Œ°(€€€¥¹É•µ•¹ÑI•Í½±ÕÑ¥½¹Ìè¥¹É•µ•¹ÑI•Í½±ÕÑ¥½¹Í5ÕÑ…Ñ¥½¸¹µÕÑ…Ñ•Íå¹Œ°(€€€¥Í‘‘¥¹aÀè…‘‘aÁ5ÕÑ…Ñ¥½¸¹¥ÍA•¹‘¥¹œ°(€€€¥ÍÉ…¹Ñ¥¹¡¥•Ù•µ•¹ÐèÉ…¹Ñ¡¥•Ù•µ•¹Ñ5ÕÑ…Ñ¥½¸¹¥ÍA•¹‘¥¹œ°(€ôì)ô(