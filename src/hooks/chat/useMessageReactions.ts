import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/auth/useAuth';
import { useReactionMutations } from '../reactions/useReactionMutations';
import { MessageReaction, UseMessageReactionsOptions } from '../reactions/types';

// Re-export types and batch hook for consumers
export type { MessageReaction, UseMessageReactionsOptions };
export { useMessagesReactions } from '../reactions/useBatchReactions';

export function useMessageReactions(messageId: string, options?: UseMessageReactionsOptions) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const lastRefreshKeyRef = useRef(options?.refreshKey);

  // Optional per-message realtime subscription (disabled in chat view to avoid one channel per bubble)
  useEffect(() => {
    if (!messageId || options?.disableRealtime) return;

    const channel = supabase
      .channel(`reactions:${messageId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'message_reactions',
        filter: `message_id=eq.${messageId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['message-reactions', messageId] });
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [messageId, options?.disableRealtime, queryClient]);

  const { data: profile } = useQuery({
    queryKey: ['my-profile-reactions', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const { data: reactions = [], isLoading, refetch } = useQuery({
    queryKey: ['message-reactions', messageId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('message_reactions')
        .select('*')
        .eq('message_id', messageId);
      if (error) throw error;

      const userIds = data?.filter(r => r.user_id).map(r => r.user_id) || [];
      let usersMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('profiles')
          .select('id, name')
          .in('id', userIds);
        usersMap = new Map(users?.map(u => [u.id, u.name ?? '']) || []);
      }

      return (data || []).map(r => ({
        ...r,
        user_name: r.user_id ? usersMap.get(r.user_id) || 'Agente' : 'Cliente',
      })) as MessageReaction[];
    },
    enabled: !!messageId,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!messageId) return;
    if (lastRefreshKeyRef.current === options?.refreshKey) return;

    lastRefreshKeyRef.current = options?.refreshKey;
    void refetch();
  }, [messageId, options?.refreshKey, refetch]);

  const { addMutation, removeMutation } = useReactionMutations(messageId, profile?.id, options);

  const addReaction = useCallback((emoji: string) => addMutation.mutateAsync(emoji), [addMutation]);
  const removeReaction = useCallback((emoji: string) => removeMutation.mutateAsync(emoji), [removeMutation]);

  const hasReacted = useCallback(
    (emoji: string) => reactions.some(r => r.user_id === profile?.id && r.emoji === emoji),
    [reactions, profile?.id]
  );

  const groupedReactions = reactions.reduce((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = [];
    acc[r.emoji].push(r);
    return acc;
  }, {} as Record<string, MessageReaction[]>);

  return {
    reactions,
    groupedReactions,
    isLoading,
    addReaction,
    removeReaction,
    hasReacted,
    currentProfileId: profile?.id,
    refetch,
  };
}
