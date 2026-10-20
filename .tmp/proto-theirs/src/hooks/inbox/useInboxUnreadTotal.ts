import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { uniqueRealtimeTopic } from '@/lib/realtimeTopic';
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
 * O selo acompanha o banco por realtime: qualquer evento em `messages` (chegou
 * mensagem / foi lida) ou em `contacts` (o recorte de contatos visíveis ao usuário
 * mudou) revalida esta chave. A revalidação é SÓ desta chave — nada de
 * `invalidateQueries()` global, que derrubaria o cache do inbox inteiro.
 * Rajada de eventos vira uma recontagem (debounce) e a volta do canal depois de
 * uma queda revalida na hora, porque os eventos da janela offline se perdem.
 */
export const inboxUnreadTotalQueryKey = ['inbox-unread-total'] as const;

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

  useEffect(() => {
    if (!enabled) return;

    let debounce: ReturnType<typeof setTimeout> | undefined;
    // `caiu` distingue a PRIMEIRA inscrição (a consulta inicial já cobre) da
    // VOLTA do canal depois de uma queda, quando a recontagem é obrigatória.
    let caiu = false;

    const invalidate = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = undefined;
        void queryClient.invalidateQueries({ queryKey: inboxUnreadTotalQueryKey });
      }, DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(uniqueRealtimeTopic('inbox-unread-total'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, invalidate)
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          if (caiu) {
            caiu = false;
            void queryClient.invalidateQueries({ queryKey: inboxUnreadTotalQueryKey });
          }
          return;
        }
        // CHANNEL_ERROR / TIMED_OUT / CLOSED: o canal está fora do ar.
        caiu = true;
      });

    return () => {
      if (debounce) clearTimeout(debounce);
      void supabase.removeChannel(channel);
    };
  }, [enabled, queryClient]);

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
