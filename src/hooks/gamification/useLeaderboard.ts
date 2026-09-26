import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { uniqueRealtimeTopic } from '@/lib/realtimeTopic';

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

/** Shape devolvido pela RPC dashboard_leaderboard (issue #777) -- XP/resolvidas/
 * mensagens/tempo de resposta/satisfacao ja calculados por periodo no servidor. */
interface LeaderboardRpcRow {
  profile_id: string;
  name: string;
  avatar: string | null;
  is_online: boolean | null;
  level: number;
  streak: number;
  achievements_count: number;
  xp: number;
  conversations_resolved: number;
  messages_handled: number;
  avg_response_time: number;
  satisfaction: number;
  rank: number;
}

export function useLeaderboard() {
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month'>('week');
  const [agents, setAgents] = useState<LeaderboardAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Antes, fetchLeaderboard tinha deps [] e sempre buscava agent_stats (contadores
  // all-time) -- o useEffect refazia a chamada ao trocar timeRange, mas a query
  // nunca usava o periodo, entao o seletor hoje/semana/mes era decorativo (#777).
  // Agora o periodo entra como parametro e vai direto pra RPC no servidor.
  const fetchLeaderboard = useCallback(async (period: 'today' | 'week' | 'month') => {
    try {
      // cast temporario: types.ts gerado ainda nao tem dashboard_leaderboard (RPC nova) -- sync automatico (PR #791) traz o tipo real em breve.
      const { data, error } = await (supabase as any).rpc('dashboard_leaderboard', { // eslint-disable-line @typescript-eslint/no-explicit-any -- cast temporario ate sync de types
        p_period: period,
        p_limit: 10,
      });

      if (error) throw error;
      const rows = (data || []) as unknown as LeaderboardRpcRow[];
      if (rows.length === 0) { setAgents([]); return; }

      const profileIds = rows.map(r => r.profile_id);
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

      setAgents(rows.map(row => ({
        id: row.profile_id, profile_id: row.profile_id,
        name: row.name || 'Agente', avatar: row.avatar || undefined,
        xp: row.xp, level: row.level, streak: row.streak,
        messagesHandled: row.messages_handled,
        conversationsResolved: row.conversations_resolved,
        avgResponseTime: row.avg_response_time,
        satisfaction: row.satisfaction,
        rank: row.rank, previousRank: row.rank,
        achievements: (achievementsByProfile[row.profile_id] || []).slice(0, 5),
        achievementsCount: row.achievements_count,
        isOnline: row.is_online ?? false,
      })));
    } catch (error) {
      log.error('Error fetching leaderboard:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetchLeaderboard so seta estado apos o await da RPC; a chamada aqui e sincrona (so dispara a query).
    fetchLeaderboard(timeRange);
    const channel = supabase
      .channel(uniqueRealtimeTopic('leaderboard-updates'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_stats' }, () => {
        log.debug('Agent stats updated, refreshing leaderboard...');
        fetchLeaderboard(timeRange);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [timeRange, fetchLeaderboard]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchLeaderboard(timeRange);
  }, [fetchLeaderboard, timeRange]);

  return { agents, isLoading, isRefreshing, timeRange, setTimeRange, handleRefresh };
}
