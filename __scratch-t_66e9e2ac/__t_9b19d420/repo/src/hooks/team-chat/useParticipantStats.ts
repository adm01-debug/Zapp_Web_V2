import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ParticipantStat {
  senderId: string;
  senderName: string;
  sent: number;
  delivered: number;
  read: number;
}

export function useParticipantStats(conversationId: string) {
  return useQuery<ParticipantStat[]>({
    queryKey: ['departmentChat', 'participantStats', conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_messages')
        .select('sender_id, status, profiles:sender_id(name)')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      const map = new Map<string, ParticipantStat>();
      type Row = { sender_id: string; status: string | null; profiles: { name?: string } | null };
      for (const row of (data ?? []) as Row[]) {
        const sid = row.sender_id;
        const name = (row.profiles as { name?: string } | null)?.name ?? sid.slice(0, 8);
        if (!map.has(sid)) map.set(sid, { senderId: sid, senderName: name, sent: 0, delivered: 0, read: 0 });
        const s = map.get(sid)!;
        s.sent++;
        const status = row.status;
        if (status === 'delivered' || status === 'read') s.delivered++;
        if (status === 'read') s.read++;
      }
      return Array.from(map.values()).sort((a, b) => b.sent - a.sent).slice(0, 10);
    },
    staleTime: 60_000,
  });
}
