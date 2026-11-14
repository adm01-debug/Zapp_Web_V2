import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseRealtime } from '@/hooks/realtime/useSupabaseRealtime';
import { GLOBAL_CONTACTS_CHANNEL, GLOBAL_MESSAGES_CHANNEL } from '@/hooks/realtime/globalChannels';
import { useDocumentBadge } from '@/hooks/system/useDocumentBadge';
import { useTeamUnreadTotal } from '@/hooks/team-chat/useTeamUnreadTotal';

/**
 * PE-30 — selo de não lidas do Chat (barra lateral, barra do celular e título da
 * aba). Era fixo em `0`: o shell recebia `unreadNotifications={0}` e a aba nunca
 * ganhava o "(n)".
 *
 * O total vem da RPC `inbox_unread_total()` — UMA chamada leve que devolve
 * quantas CONVERSAS o chamador tem com ao menos uma mensagem do contato não lida
 * (contagem de conversa, não de mensagem: é o número que o selo do inbox mostra).
 * Somar a lista de conversas no cliente exigiria baixar `get_inbox_contact_summaries`
 * por contato só para contar.
 *
 * O selo acompanha o banco por realtime: mensagem nova/apagada ou `is_read` de
 * mensagem do contato mudando em `messages`, ou qualquer evento em `contacts` (o recorte de contatos visíveis ao usuário
 * mudou) revalida esta chave. A revalidação é SÓ desta chave — nada de
 * `invalidateQueries()` global, que derrubaria o cache do inbox inteiro.
 * Rajada de eventos vira uma recontagem (debounce) e a volta do canal depois de
 * uma queda revalida na hora, porque os eventos da janela offline se perdem.
 */
export const inboxUnreadTotalQueryKey = ['inbox-unread-total'] as const;

/**
 * UPDATE em `messages` que pode mudar o selo: só mensagem DO CONTATO, e — quando
 * o Realtime entrega a linha antiga com a coluna — só se `is_read` mudou. Sem a
 * coluna em `old` (REPLICA IDENTITY DEFAULT) recalcula por segurança.
 */
export function unreadMayHaveChanged(payload: RealtimePostgresChangesPayload<Record<string, unknown>>): boolean {
  const next = (payload.new ?? {}) as Record<string, unknown>;
  if (next.sender !== undefined && next.sender !== 'contact') return false;
  const prev = (payload.old ?? {}) as Record<string, unknown>;
  if ('is_read' in prev) return prev.is_read !== next.is_read;
  return true;
}

/** Rajada de eventos → uma recontagem (mesma janela de `useUnreadEmailCount`). */
const DEBOUNCE_MS = 500;

export interface InboxUnreadTotal {
  /** Conversas com mensagem do contato não lida (RPC `inbox_unread_total`). */
  count: number;
  /** Total de não lidas do Teams (cache do inbox, sem consulta nova). */
  teams: number;
  isLoading: boolean;
  isError: boolean;
  /** Revalida na hora (sem debounce) — útil em retentativa explícita. */
  refetch: () => void;
}

/**
 * @param enabled Desligado (ex.: sem sessão) não consulta nem abre canal e
 *        devolve `count: 0`. Padrão ligado.
 */
export function useInboxUnreadTotal(enabled = true): InboxUnreadTotal {
  const queryClient = useQueryClient();
  const teams = useTeamUnreadTotal();

  const query = useQuery({
    queryKey: inboxUnreadTotalQueryKey,
    enabled,
    queryFn: async (): Promise<number> => {
      // Sem argumento: em `types.ts` a assinatura é `Args: never`. Um parâmetro
      // indo `undefined` desaparece do JSON e o PostgREST resolve outra função.
      const { data, error } = await supabase.rpc('inbox_unread_total');
      if (error) throw error;
      return Number(data ?? 0);
    },
  });

  // Debounce: rajada de eventos → uma recontagem. O timer é do hook (ref) porque
  // os dois canais compartilhados (messages e contacts) disparam a mesma janela.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const invalidate = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = undefined;
      void queryClient.invalidateQueries({ queryKey: inboxUnreadTotalQueryKey });
    }, DEBOUNCE_MS);
  }, [queryClient]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = undefined;
  }, []);

  // Volta do canal depois de uma queda: recontagem na hora (sem debounce),
  // porque os eventos da janela offline não se recuperam sozinhos.
  const recountNow = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: inboxUnreadTotalQueryKey });
  }, [queryClient]);

  // P1-9: só o que muda o selo. O UPDATE de recibo (sent→delivered→read) é de
  // mensagem NOSSA e não mexe em "não lida do contato" — antes cada recibo
  // recalculava `inbox_unread_total` (que chama `is_contact_visible_to_user`
  // por linha) em toda aba aberta.
  const onMessageUpdate = useCallback((payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
    if (unreadMayHaveChanged(payload)) invalidate();
  }, [invalidate]);

  // Canais COMPARTILHADOS com a inbox e os avisos globais (`useSupabaseRealtime`
  // conta os donos por nome): a aba mantém UMA assinatura em `messages` e UMA em
  // `contacts`, em vez de um canal exclusivo deste selo.
  useSupabaseRealtime<Record<string, unknown>>({
    channelName: GLOBAL_MESSAGES_CHANNEL,
    table: 'messages',
    enabled,
    onInsert: invalidate,
    onUpdate: onMessageUpdate,
    onDelete: invalidate,
    onReconnect: recountNow,
  });
  useSupabaseRealtime<Record<string, unknown>>({
    channelName: GLOBAL_CONTACTS_CHANNEL,
    table: 'contacts',
    enabled,
    onAll: invalidate,
    onReconnect: recountNow,
  });

  const count = enabled ? query.data ?? 0 : 0;

  // Título da aba: "(n) " só com a aba em segundo plano (padrão de e-mail).
  useDocumentBadge(count);

  return {
    count,
    teams,
    isLoading: enabled && query.isLoading,
    isError: query.isError,
    refetch: () => {
      void query.refetch();
    },
  };
}
