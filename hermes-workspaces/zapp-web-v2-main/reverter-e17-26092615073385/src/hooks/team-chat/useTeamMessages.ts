import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import type { TeamMessage } from './teamChatTypes';

export function useTeamMessages(conversationId: string | null) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const lastReadRef = useRef<string | null>(null);

  const query = useQuery({
    queryKey: ['team-messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const { data, error } = await supabase
        .from('team_messages')
        .select('*, sender:profiles!team_messages_sender_id_fkey(id, name, avatar_url)')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data || []) as TeamMessage[];
    },
    enabled: !!conversationId && !!profile,
  });

  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`team-messages-${conversationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_messages', filter: `conversation_id=eq.${conversationId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['team-messages', conversationId] });
        queryClient.invalidateQueries({ queryKey: ['team-conversations'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, queryClient]);

  useEffect(() => {
    if (!conversationId || !profile) return;
    if (lastReadRef.current === conversationId) return;
    lastReadRef.current = conversationId;
    const timeout = setTimeout(() => {
      supabase.from('team_conversation_members').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', conversationId).eq('profile_id', profile.id).then();
    }, 500);
    return () => clearTimeout(timeout);
  }, [conversationId, profile]);

  useEffect(() => {
    if (!conversationId || !profile || !query.data?.length) return;
    supabase.from('team_conversation_members').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', conversationId).eq('profile_id', profile.id).then();
  }, [conversationId, profile, query.data?.length]);

  return query;
}
