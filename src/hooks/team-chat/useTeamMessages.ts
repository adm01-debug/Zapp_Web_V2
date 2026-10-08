import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/auth/useAuth';
import { getLogger } from '@/lib/logger';
import type { TeamMessage } from './teamChatTypes';

const log = getLogger('useTeamMessages');

// Janela da página: mesmo tamanho que o hook lia antes via `.limit(200)` e o
// teto que a RPC aplica no servidor (`LEAST(p_limit, 200)`).
const TEAM_MESSAGES_PAGE_SIZE = 200;

/**
 * Linha devolvida pela RPC `get_team_messages_page` (F38): já traz o remetente
 * achatado (`sender_name`/`sender_avatar`) e não traz `status` — a coluna é
 * `NOT NULL DEFAULT 'sent'` e o cliente não tem UPDATE nela (grant por coluna),
 * então o campo fica sempre no mesmo valor.
 */
type TeamMessagePageRow = Database['public']['Functions']['get_team_messages_page']['Returns'][number];

function toTeamMessage(row: TeamMessagePageRow): TeamMessage {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_id: row.sender_id,
    content: row.content ?? '',
    message_type: row.message_type ?? 'text',
    media_url: row.media_url ?? null,
    media_type: row.media_type ?? null,
    media_bucket: row.media_bucket ?? null,
    media_path: row.media_path ?? null,
    reply_to_id: row.reply_to_id ?? null,
    is_edited: row.is_edited ?? false,
    created_at: row.created_at,
    updated_at: row.updated_at,
    sender: row.sender_id
      ? { id: row.sender_id, name: row.sender_name ?? '', avatar_url: row.sender_avatar ?? null }
      : undefined,
  };
}

export function useTeamMessages(conversationId: string | null) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const markedRef = useRef<string | null>(null);

  const query = useQuery({
    queryKey: ['team-messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      // SL-016 (F54): a página vem da RPC `get_team_messages_page` — keyset por
      // `created_at` no servidor (`p_before_id`), com o remetente já resolvido.
      // Antes era um `select` direto em `team_messages` com embed de `profiles` e
      // `.limit(200)`, que montava a janela inteira no cliente.
      const { data, error } = await supabase.rpc('get_team_messages_page', {
        p_conversation_id: conversationId,
        p_limit: TEAM_MESSAGES_PAGE_SIZE,
      });
      if (error) throw error;
      // A RPC devolve DESC (mais novas primeiro); o contrato deste hook (e do
      // painel, que usa `messages[0]` como cursor) é ASC.
      return (data ?? []).map(toTeamMessage).reverse();
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

    const messages = query.data;
    if (!messages?.length) return;

    // Recibo só existe para mensagem alheia: mensagem própria não gera leitura.
    // A RPC aplica a mesma regra no servidor (`sender_id <> current_profile_id`),
    // mas a checagem aqui evita uma chamada por ciclo quando não há o que marcar.
    if (!messages.some(m => m.sender_id !== profile.id)) return;

    const cacheKey = `${conversationId}:${messages[messages.length - 1]?.id}`;
    if (markedRef.current === cacheKey) return;

    // TC-010: a marcação só avança DEPOIS que a gravação confirma. Com a falha, a
    // chave continua livre e o próximo ciclo do efeito (dado novo/realtime) tenta
    // gravar de novo — antes o `markedRef` era fixado antes do await e o
    // resultado era descartado, então um erro de rede/RLS deixava a conversa
    // "lida" só na tela.
    let cancelado = false;

    const persistir = async () => {
      // SL-016 (F55): uma RPC só grava os recibos das mensagens alheias e o
      // `last_read_at` da membership na MESMA transação. Antes eram dois writes
      // separados (upsert em `team_message_receipts` + update em
      // `team_conversation_members`) e um deles podia falhar sozinho, deixando a
      // conversa meio-lida.
      const { error } = await supabase.rpc('mark_team_conversation_read', {
        p_conversation_id: conversationId,
      });

      // Troca de conversa/desmontagem: o resultado não vale mais para a chave
      // atual e não pode promover a marcação dela.
      if (cancelado) return;

      if (error) {
        log.error('Falha ao marcar a conversa como lida', error);
        return;
      }

      markedRef.current = cacheKey;
    };

    void persistir();
    return () => { cancelado = true; };
  }, [conversationId, profile, query.data]);

  return { messages: query.data ?? [], isLoading: query.isLoading };
}
