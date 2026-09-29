import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import type { TeamMessage } from './teamChatTypes';

export function useTeamMessages(conversationId: string | null) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const markedRef = useRef<string | null>(null);

  const query = useQuery({
    queryKey: ['team-messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const { data, error } = await supabase
        .from('team_messages')
        .select('*, sender:profiles!team_messages_sender_id_fkey(id, name, avatar_url), media_bucket, media_path, status')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return ((data || []) as TeamMessage[]).reverse();
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
    if (!conversationId || !profile || !query.data?.length) return;

    const messages = query.data;
    const unread = messages.filter(m => m.sender_id !== profile.id);
    if (!unread.length) return;

    const cacheKey = `${conversationId}:${messages[messages.length - 1]?.id}`;
    if (markedRef.current === cacheKey) return;
    markedRef.current = cacheKey;

    const now = new Date().toISOString();

    const receipts = unread.map(m => ({
      message_id: m.id,
      profile_id: profile.id,
      status: 'read' as const,
      read_at: now,
      delivered_at: now,
    }));

    supabase
      .from('team_message_receipts')
      .upsert(receipts, { onConflict: 'message_id,profile_id' })
      .then();

    supabase
      .from('team_conversation_members')
      .update({ last_read_at: now })
      .eq('conversation_id', conversationId)
      .eq('profile_id', profile.id)
      .then();
  }, [conversationId, profile, query.data]);

  return { messages: query.data ?? [], isLoading: query.isLoading };
}
