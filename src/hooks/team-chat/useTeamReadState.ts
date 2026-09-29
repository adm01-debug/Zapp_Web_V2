import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { TEAM_KEYS } from './queryKeys';

interface ReadReceipt {
  id: string;
  message_id: string;
  profile_id: string;
  conversation_id: string;
  delivered_at: string | null;
  read_at: string | null;
  status: string;
}

export function useTeamReadState(conversationId: string) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const qKey = useMemo(() => TEAM_KEYS.readState(conversationId), [conversationId]);

  const query = useQuery<ReadReceipt[]>({
    queryKey: qKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_message_receipts')
        .select('*')
        .eq('conversation_id', conversationId);
      if (error) throw error;
      return (data ?? []) as ReadReceipt[];
    },
    enabled: !!conversationId && !!profile,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!conversationId) return;
    const sfx = crypto.randomUUID().slice(0, 8);
    const channel = supabase
      .channel(`team:receipts:${conversationId}:${sfx}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('postgres_changes' as any, {
          event: '*',
          schema: 'public',
          table: 'team_message_receipts',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => { void qc.invalidateQueries({ queryKey: qKey }); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [conversationId, qc, qKey]);

  // Maps profile_id → latest message_id that was read (status='read')
  const readByProfile = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const r of query.data ?? []) {
      if (r.status === 'read') {
        map.set(r.profile_id, r.message_id);
      }
    }
    return map;
  }, [query.data]);

  const isReadByAll = (messageId: string) => {
    if (!query.data?.length) return false;
    const others = query.data.filter(r => r.profile_id !== profile?.id);
    if (others.length === 0) return false;
    return others.every(r => r.status === 'read' && r.message_id >= messageId);
  };

  return {
    receipts: query.data ?? [],
    readByProfile,
    isReadByAll,
    isLoading: query.isLoading,
  };
}
