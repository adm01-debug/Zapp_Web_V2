import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';

export interface LeaderboardAgent {
  id: string;
  profile_id: string;
  name: string;
  avatar?: string;
  xp: number;
  level: number;
  streak: number;
  messagesHandled: number;
  conversationsResolved: number;
  avgResponseTime: number;
  satisfaction: number;
  rank: number;
  previousRank: number;
  achievements: string[];
  achievementsCount: number;
  isOnline: boolean;
}

export function useLeaderboard() {
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month'>('week');
  const [agents, setAgents] = useState<LeaderboardAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const { data: stats, error } = await supabase
        .from('agent_stats')
        .select(`*, profiles:profile_id (id, name, avatar_url, is_active)`)
        .order('xp', { ascending: false })
        .limit(10);

      if (error) throw error;
      if (!stats || stats.length === 0) { setAgents([]); return; }

      const profileIds = stats.map(s => s.profile_id);
      const { data: achievements } = await supabase
        .from('agent_achievements')
        .select('profile_id, achievement_type')
        .in('profile_id', profileIds)
        .order('earned_at', { ascending: false });

      const achievementsByProfile: Record<string, string[]> = {};
      achievements?.forEach(a => {
        if (!achievementsByProfile[a.profile_id]) achievementsByProfile[a.profile_id] = [];
        if (!achievementsByProfile[a.profile_id].includes(a.achievement_type))
          achievementsByProfile[a.profile_id].push(a.achievement_type);
      });

      setAgents(stats.map((stat, index) => {
        const profile = stat.profiles as { id: string; name: string; avatar_url: string | null; is_active: boolean | null } | null;
        const agentAchievements = achievementsByProfile[stat.profile_id] || [];
        return {
          id: stat.id, profile_id: stat.profile_id,
          name: profile?.name || 'Agente', avatar: profile?.avatar_url || undefined,
          xp: stat.xp, level: stat.level, streak: stat.current_streak,
          messagesHandled: stat.messages_sent + stat.messages_received,
          conversationsResolved: stat.conversations_resolved,
          avgResponseTime: stat.avg_response_time_seconds || 0,
          satisfaction: Number(stat.customer_satisfaction_score) * 100 || 0,
          rank: index + 1, previousRank: index + 1,
          achievements: agentAchievements.slice(0, 5),
          achievementsCount: stat.achievements_count,
          isOnline: profile?.is_active ?? false,
        };
      }));
    } catch (error) {
      log.error('Error fetching leaderboard:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard();
    const channel = supabase
      .channel('leaderboard-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_stats' }, () => {
        log.debug('Agent stats updated, refreshing leaderboard...');
        fetchLeaderboard();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [timeRange, fetchLeaderboard]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  return { agents, isLoading, isRefreshing, timeRange, setTimeRange, handleRefresh };
}
