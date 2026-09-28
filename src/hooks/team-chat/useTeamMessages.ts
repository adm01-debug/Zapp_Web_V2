import { useEffect, useMemo } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { teamChatKeys } from './queryKeys';
import type { TeamMessage } from './teamChatTypes';

interface RpcMessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  reply_to_id: string | null;
  is_edited: boolean;
  created_at: string;
  updated_at: string;
  media_url: string | null;
  media_type: string | null;
  status: string | null;
  reactions: Record<string, { count: number; users: string[] }> | null;
}

function toTeamMessage(row: RpcMessageRow): TeamMessage {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_id: row.sender_id,
    content: row.content,
    message_type: row.message_type,
    reply_to_id: row.reply_to_id,
    is_edited: row.is_edited,
    created_at: row.created_at,
    updated_at: row.updated_at,
    media_url: row.media_url,
    media_type: row.media_type,
    media_bucket: null,
    media_path: null,
    status: row.status,
  };
}

export function useTeamMessages(conversationId: string | null) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const channelName = useMemo(
    () => (conversationId ? `team:messages:${conversationId}:${crypto.randomUUID().slice(0, 8)}` : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversationId],
  );

  const query = useInfiniteQuery({
    queryKey: teamChatKeys.messagePages(conversationId ?? ''),
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      if (!conversationId) return { messages: [] as TeamMessage[], nextCursor: null };
      const { data, error } = await supabase.rpc('get_team_messages', {
        p_conversation_id: conversationId,
        p_limit: 50,
        ...(pageParam ? { p_before_id: pageParam } : {}),
      });
      if (error) throw error;
      const rows = (data ?? []) as RpcMessageRow[];
      const messages = rows.map(toTeamMessage);
      const nextCursor = rows.length === 50 ? messages[messages.length - 1].id : null;
      return { messages, nextCursor };
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!conversationId && !!profile,
    staleTime: 5_000,
  });

  useEffect(() => {
    if (!conversationId || !channelName) return;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'team_messages', filter: `conversation_id=eq.${conversationId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: teamChatKeys.messagePages(conversationId) });
          void queryClient.invalidateQueries({ queryKey: teamChatKeys.conversations() });
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [conversationId, channelName, queryClient]);

  const messages = useMemo(
    () => query.data?.pages.flatMap(p => p.messages) ?? [],
    [query.data],
  );

  return {
    messages,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage ?? false,
    fetchNextPage: query.fetchNextPage,
  };
}
