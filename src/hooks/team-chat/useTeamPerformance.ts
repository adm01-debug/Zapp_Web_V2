import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PerformanceStat {
  messageCount: number;
  activeParticipants: number;
  avgResponseTimeMs: number | null;
}

export function useTeamPerformance(conversationId: string) {
  return useQuery<PerformanceStat>({
    queryKey: ['departmentChat', 'performance', conversationId],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('team_messages')
        .select('id, sender_id, created_at')
        .eq('conversation_id', conversationId)
        .gte('created_at', since);
      if (error) throw error;
      const msgs = data ?? [];
      const activeParticipants = new Set(msgs.map(m => m.sender_id)).size;
      let avgResponseTimeMs: number | null = null;
      if (msgs.length >= 2) {
        const sorted = [...msgs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        const gaps: number[] = [];
        for (let i = 1; i < sorted.length; i++) {
          gaps.push(new Date(sorted[i].created_at).getTime() - new Date(sorted[i - 1].created_at).getTime());
        }
        avgResponseTimeMs = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      }
      return { messageCount: msgs.length, activeParticipants, avgResponseTimeMs };
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
