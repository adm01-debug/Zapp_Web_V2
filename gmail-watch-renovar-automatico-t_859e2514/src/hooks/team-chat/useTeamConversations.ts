import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import type { TeamConversation, TeamMember, TeamMessage } from './teamChatTypes';
import { queryKeys } from './queryKeys';

export function useTeamConversations() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.inbox(profile?.id),
    queryFn: async () => {
      if (!profile) return [];

      // SL-016 (F53): a caixa de entrada vem da RPC `get_team_inbox`, numa
      // chamada só. Antes o hook montava a lista com três consultas
      // (`team_conversation_members` + `get_team_conversation_previews` +
      // `get_team_unread_counts`) e o não-lido saía de uma contagem à parte da
      // última mensagem exibida na lista.
      const { data: inboxRows, error: inboxError } = await supabase.rpc('get_team_inbox');
      if (inboxError) throw inboxError;
      if (!inboxRows?.length) return [];

      const convIds = inboxRows.map(row => row.conversation_id);

      // `created_by`, `created_at` e `avatar_url` não vêm na RPC e continuam
      // vindo da tabela: o painel usa `created_by` para saber se o usuário criou
      // o grupo e a lista usa `avatar_url`. Os membros também seguem sendo
      // carregados — a lista de participantes e o estado de mute do painel saem
      // de `members`.
      const [convResult, membersResult] = await Promise.all([
        supabase
          .from('team_conversations')
          .select('*')
          .in('id', convIds)
          .order('updated_at', { ascending: false }),
        supabase
          .from('team_conversation_members')
          .select('*, profile:profiles(id, name, email, avatar_url, is_active)')
          .in('conversation_id', convIds),
      ]);

      if (convResult.error) throw convResult.error;
      if (membersResult.error) throw membersResult.error;

      const conversations = convResult.data || [];
      const allMembers = membersResult.data || [];

      const inboxMap = new Map(inboxRows.map(row => [row.conversation_id, row]));

      const enriched: TeamConversation[] = conversations.map(conv => {
        const members = ((allMembers || []).filter(m => m.conversation_id === conv.id)) as unknown as TeamMember[];
        const inbox = inboxMap.get(conv.id);

        let displayName = conv.name;
        if (conv.type === 'direct' && !conv.name) {
          const other = members.find(m => m.profile_id !== profile.id);
          displayName = other?.profile?.name || 'Chat Direto';
        }

        // A RPC devolve o texto, o remetente e o instante da última mensagem,
        // mas não o id nem o tipo dela. Nenhum consumidor do módulo lê
        // `last_message.id` nem `last_message.message_type` (a lista usa só
        // `created_at` e `content`), então o preview usa o id da conversa como
        // marcador estável e o tipo genérico 'text'.
        const lastMsg: TeamMessage | null = inbox?.last_message_at
          ? {
              id: conv.id,
              conversation_id: conv.id,
              sender_id: inbox.last_sender_id,
              content: inbox.last_message_text ?? '',
              message_type: 'text',
              status: 'delivered',
              media_url: null,
              media_type: null,
              media_bucket: null,
              media_path: null,
              reply_to_id: null,
              is_edited: false,
              created_at: inbox.last_message_at,
              updated_at: inbox.last_message_at,
            }
          : null;

        return {
          ...conv,
          type: conv.type as 'direct' | 'group',
          name: displayName,
          avatar_url: conv.type === 'direct' && !conv.avatar_url
            ? members.find(m => m.profile_id !== profile.id)?.profile?.avatar_url ?? null
            : conv.avatar_url,
          members,
          last_message: lastMsg,
          unread_count: Number(inbox?.unread_count ?? 0),
        };
      });

      return enriched;
    },
    enabled: !!profile,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel('team-chat-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_messages' }, () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.inbox() });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_conversation_members' }, () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.inbox() });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'team_message_receipts' }, () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.inbox() });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, queryClient]);

  return query;
}
