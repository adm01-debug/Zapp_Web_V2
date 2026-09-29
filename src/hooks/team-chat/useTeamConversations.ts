import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { TEAM_KEYS } from './queryKeys';
import type { TeamInboxRow } from './teamChatTypes';
import { getLogger } from '@/lib/logger';

const log = getLogger('TeamConversations');

export function useTeamConversations() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const sfx = useMemo(() => crypto.randomUUID().slice(0, 8), []);

  const query = useQuery({
    queryKey: TEAM_KEYS.inbox(profile?.id),
    queryFn: async (): Promise<TeamInboxRow[]> => {
      const { data, error } = await supabase.rpc('get_team_inbox');
      if (error) throw error;
      return (data ?? []) as TeamInboxRow[];
    },
    enabled: !!profile,
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchOnReconnect: true,
  });

  useEffect(() => {
    if (!profile) return;
    const pid = profile.id;
    const channel = supabase
      .channel(`team:inbox:${pid}:${sfx}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_conversations' }, () => {
        void queryClient.invalidateQueries({ queryKey: TEAM_KEYS.inbox(pid) });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_conversation_members' }, () => {
        void queryClient.invalidateQueries({ queryKey: TEAM_KEYS.inbox(pid) });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_messages' }, () => {
        void queryClient.invalidateQueries({ queryKey: TEAM_KEYS.inbox(pid) });
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('system' as any, {}, (status: string) => {
        if (status === 'CHANNEL_ERROR') log.warn('team:inbox CHANNEL_ERROR', { pid });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [profile, sfx, queryClient]);

  return query;
}
