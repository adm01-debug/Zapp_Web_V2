import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TeamMessageStatusType } from './teamMessageStatus';
import { queryKeys } from './queryKeys';

/**
 * Estado de leitura de UMA mensagem, agregado pela view
 * `team_message_read_state` (N-070).
 *
 * A view conta, por mensagem, quantos membros a conversa tem (`member_count`) e
 * quantos já LERAM sem serem o remetente (`read_count`), e deriva `all_read`
 * (`read_count = member_count - 1`, isto é: todos os outros membros leram).
 */
export interface TeamMessageReadState {
  message_id: string;
  conversation_id: string;
  member_count: number;
  read_count: number;
  all_read: boolean;
}

export type TeamReadStateMap = Record<string, TeamMessageReadState>;

/** Mapa vazio compartilhado: identidade estável enquanto não há dados. */
const SEM_LEITURA: TeamReadStateMap = {};

/**
 * Converte o estado agregado no `status` desenhado pela interface
 * (`MessageStatus`). A visão não expõe entrega por dispositivo — só leitura —,
 * então o tick sai assim:
 *  - lida por TODOS os outros membros -> `read`;
 *  - lida por pelo menos um, mas não todos -> `delivered` (a mensagem já deixou
 *    o estado "enviado");
 *  - sem linha na visão (nenhuma leitura) -> `sent`.
 */
export function deriveOwnMessageStatus(state?: TeamMessageReadState): TeamMessageStatusType {
  if (!state) return 'sent';
  if (state.all_read) return 'read';
  if (state.read_count > 0) return 'delivered';
  return 'sent';
}

/**
 * Lê o estado real de leitura das mensagens PRÓPRIAS visíveis e o mantém vivo.
 *
 * `ownMessageIds` vem da página aberta (`useTeamMessages`): a consulta é
 * escopada à conversa E a esses ids, então o volume é o da própria página (200)
 * e não o histórico inteiro da conversa. Sem mensagem própria o hook não
 * consulta nada.
 */
export function useTeamReadState(
  conversationId: string | null,
  ownMessageIds: readonly string[],
) {
  const queryClient = useQueryClient();

  // Ids únicos e ordenados: a mesma página de mensagens produz sempre a mesma
  // chave, mesmo que a ordem de entrada mude entre renders.
  const idsKey = Array.from(new Set(ownMessageIds)).sort().join(',');

  const query = useQuery({
    queryKey: queryKeys.readState(conversationId, idsKey),
    enabled: !!conversationId && idsKey.length > 0,
    queryFn: async (): Promise<TeamReadStateMap> => {
      if (!conversationId || !idsKey) return {};

      // Lotes de 100: um `.in(...)` com 200 uuids põe ~8 KB na URL do PostgREST
      // e esbarra no limite de cabeçalho do gateway.
      const ids = idsKey.split(',');
      const lotes: string[][] = [];
      for (let i = 0; i < ids.length; i += 100) lotes.push(ids.slice(i, i + 100));

      const respostas = await Promise.all(
        lotes.map(async lote => {
          const { data, error } = await supabase
            .from('team_message_read_state')
            .select('message_id, conversation_id, member_count, read_count, all_read')
            .eq('conversation_id', conversationId)
            .in('message_id', lote);
          if (error) throw error;
          return data ?? [];
        }),
      );

      const mapa: TeamReadStateMap = {};
      for (const linha of respostas.flat()) {
        if (!linha?.message_id) continue;
        mapa[linha.message_id] = {
          message_id: linha.message_id,
          conversation_id: linha.conversation_id ?? conversationId,
          member_count: Number(linha.member_count ?? 0),
          read_count: Number(linha.read_count ?? 0),
          all_read: linha.all_read === true,
        };
      }
      return mapa;
    },
  });

  useEffect(() => {
    // Sem mensagem própria na página não há recibo para acompanhar — e um canal
    // aberto à toa atrapalha quem conta os canais da conversa (o canal de
    // mensagens é o dono do tópico `team-messages-<conversa>`).
    if (!conversationId || !idsKey) return;
    const channel = supabase
      .channel(`team-read-state-${conversationId}`)
      // Sem filtro por `conversation_id`: a publicação replica
      // `team_message_receipts` com REPLICA IDENTITY DEFAULT (nenhuma migration
      // marca FULL), e filtrar por coluna que não é chave pode descartar o
      // evento — o status ficaria preso em "enviado". Sem filtro é o mesmo
      // padrão do módulo (`useTeamConversations`); a invalidação fica escopada à
      // chave DESTA conversa, então as outras queries não são tocadas.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_message_receipts' }, () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.readState(conversationId) });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, idsKey, queryClient]);

  return { readStates: query.data ?? SEM_LEITURA, isLoading: query.isLoading };
}
