import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { toast } from 'sonner';
import { TEAM_KEYS } from './queryKeys';
import type { ReactionGroup } from '@/components/ui/message-reactions';
import { getLogger } from '@/lib/logger';

const log = getLogger('TeamReactions');

interface RawReaction {
  id: string;
  message_id: string;
  profile_id: string;
  emoji: string;
  conversation_id: string;
  created_at: string;
}

function aggregateReactions(rows: RawReaction[], myProfileId: string | undefined): Map<string, ReactionGroup[]> {
  const byMessage = new Map<string, Map<string, ReactionGroup>>();
  for (const row of rows) {
    let msgMap = byMessage.get(row.message_id);
    if (!msgMap) { msgMap = new Map(); byMessage.set(row.message_id, msgMap); }
    const existing = msgMap.get(row.emoji);
    if (existing) {
      existing.count++;
      existing.profileIds.push(row.profile_id);
      if (row.profile_id === myProfileId) existing.reactedByMe = true;
    } else {
      msgMap.set(row.emoji, {
        emoji: row.emoji,
        count: 1,
        reactedByMe: row.profile_id === myProfileId,
        profileIds: [row.profile_id],
      });
    }
  }
  const result = new Map<string, ReactionGroup[]>();
  byMessage.forEach((emojiMap, msgId) => {
    result.set(msgId, Array.from(emojiMap.values()));
  });
  return result;
}

export function useTeamMessageReactions(conversationId: string) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const qKey = useMemo(() => TEAM_KEYS.reactions(conversationId), [conversationId]);

  const { data: rows = [] } = useQuery<RawReaction[]>({
    queryKey: qKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_message_reactions')
        .select('*')
        .eq('conversation_id', conversationId);
      if (error) throw error;
      return (data ?? []) as RawReaction[];
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    const sfx = crypto.randomUUID().slice(0, 8);
    const channel = supabase
      .channel(`team:reactions:${conversationId}:${sfx}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('postgres_changes' as any, {
          event: '*',
          schema: 'public',
          table: 'team_message_reactions',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => { void qc.invalidateQueries({ queryKey: qKey }); },
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('system' as any, {}, (status: string) => {
        if (status === 'CHANNEL_ERROR') log.warn('team:reactions CHANNEL_ERROR', { conversationId });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [conversationId, qc, qKey]);

  const aggregated = aggregateReactions(rows, profile?.id);

  const aggregate = useCallback(
    (messageId: string): ReactionGroup[] => aggregated.get(messageId) ?? [],
    [aggregated],
  );

  const toggleMutation = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!profile?.id) throw new Error('Não autenticado');
      const { error } = await supabase.rpc('toggle_team_reaction', {
        p_message_id: messageId,
        p_emoji: emoji,
      });
      if (error) throw error;
    },
    onMutate: async ({ messageId, emoji }) => {
      await qc.cancelQueries({ queryKey: qKey });
      const prev = qc.getQueryData<RawReaction[]>(qKey) ?? [];
      const myId = profile?.id ?? '';
      const existing = prev.find(r => r.message_id === messageId && r.emoji === emoji && r.profile_id === myId);
      const next = existing
        ? prev.filter(r => r.id !== existing.id)
        : [...prev, { id: crypto.randomUUID(), message_id: messageId, profile_id: myId, emoji, conversation_id: conversationId, created_at: new Date().toISOString() }];
      qc.setQueryData<RawReaction[]>(qKey, next);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(qKey, ctx.prev);
      toast.error('Erro ao reagir');
    },
    onSettled: () => { void qc.invalidateQueries({ queryKey: qKey }); },
  });

  return {
    reactions: rows,
    aggregate,
    toggle: toggleMutation.mutate,
    isToggling: toggleMutation.isPending,
  };
}
