import { useEffect, useMemo, useRef } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { TEAM_KEYS } from './queryKeys';
import type { TeamMessagePageRow } from './teamChatTypes';

const PAGE_SIZE = 50;

export function useTeamMessages(conversationId: string | null) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const sfx = useMemo(() => crypto.randomUUID().slice(0, 8), []);
  const markedRef = useRef<string | null>(null);

  const query = useInfiniteQuery<TeamMessagePageRow[], Error>({
    queryKey: TEAM_KEYS.messages(conversationId ?? ''),
    queryFn: async ({ pageParam }) => {
      if (!conversationId) return [];
      const { data, error } = await supabase.rpc('get_team_messages_page', {
        p_conversation_id: conversationId,
        p_before_id: (pageParam as string | undefined) ?? undefined,
        p_limit: PAGE_SIZE,
      });
      if (error) throw error;
      return (data ?? []) as TeamMessagePageRow[];
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.length < PAGE_SIZE) return undefined;
      return lastPage[0]?.id;
    },
    initialPageParam: undefined,
    enabled: !!conversationId && !!profile,
  });

  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`team:messages:${conversationId}:${sfx}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'team_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, () => {
        void queryClient.invalidateQueries({ queryKey: TEAM_KEYS.messages(conversationId) });
        void queryClient.invalidateQueries({ queryKey: ['team-chat', 'inbox'] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [conversationId, sfx, queryClient]);

  // Mark read on new messages
  useEffect(() => {
    if (!conversationId || !profile || !query.data?.pages?.length) return;
    const firstPage = query.data.pages[0];
    if (!firstPage?.length) return;
    const lastId = firstPage[firstPage.length - 1]?.id;
    const cacheKey = `${conversationId}:${lastId}`;
    if (markedRef.current === cacheKey) return;
    markedRef.current = cacheKey;
    void supabase.rpc('mark_team_conversation_read', { p_conversation_id: conversationId });
  }, [conversationId, profile, query.data]);

  const messages = useMemo(() => {
    if (!query.data) return [];
    return [...query.data.pages].reverse().flat() as TeamMessagePageRow[];
  }, [query.data]);

  return {
    messages,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
  };
}
