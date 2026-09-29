import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { TEAM_KEYS } from './queryKeys';

interface ReadReceipt {
  id: string;
  conversation_id: string;
  profile_id: string;
  last_read_message_id: string | null;
  read_at: string;
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

  const readByProfile = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const r of query.data ?? []) {
      map.set(r.profile_id, r.last_read_message_id);
    }
    return map;
  }, [query.data]);

  const isReadByAll = (messageId: string) => {
    if (!query.data?.length) return false;
    return query.data.every(r => {
      if (r.profile_id === profile?.id) return true;
      return r.last_read_message_id === messageId || (r.last_read_message_id ?? '') >= messageId;
    });
  };

  return {
    receipts: query.data ?? [],
    readByProfile,
    isReadByAll,
    isLoading: query.isLoading,
  };
}
