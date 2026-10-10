import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { fromTable } from '@/lib/supabaseHelpers';
import type { TalkXCampaignEvent, TalkXEventType } from '@/hooks/integrations/useTalkXEvents';

/**
 * X152 — leitura da "Linha do tempo operacional" direto do servidor.
 *
 * Antes desta etapa o Monitor lia `useTalkXEvents` — 50 eventos fixos por polling de
 * 10 s, sem filtro e sem segunda página — e a tela mostrava o tipo cru do banco
 * quando o evento não tinha mensagem ("resumed"), além de despejar o JSON de
 * `limits_updated`.
 *
 * Aqui a leitura passa a ter cursor: cada página tem tamanho fixo, a próxima página
 * começa no `created_at` do item mais antigo já lido (o `p_before` do plano X141) e o
 * filtro por tipo é feito no servidor, não no navegador.
 *
 * A RPC `talkx_campaign_timeline` que X141 previa para juntar eventos de campanha e
 * itens POR DESTINATÁRIO ainda não existe no banco vivo (`grep talkx_campaign_timeline`
 * = 0 em supabase/), então esta leitura vem da tabela que o servidor já grava,
 * `talkx_campaign_events`. Quando a RPC entrar, o único ponto a trocar é o `fetchPage`
 * abaixo — a tela não sabe de onde o item veio.
 */

/** Teto de uma página da linha do tempo. */
export const TIMELINE_PAGE_SIZE = 20;

/** Quantos itens o card mostra antes do "Ver todos". */
export const TIMELINE_PREVIEW_SIZE = 5;

/** Item já normalizado para a tela — o mesmo formato para evento de campanha e item por destinatário. */
export interface TalkXTimelineItem {
  id: string;
  /** Tipo do evento. String aberta: o CHECK do banco aceita tipos que a união do front ainda não lista. */
  kind: TalkXEventType | string;
  /** Momento do item (ISO). */
  at: string;
  /** Perfil que praticou a ação, quando o servidor gravou o ator. */
  actorName: string | null;
  /** Mensagem do evento (texto livre, número, rótulo de link ou o JSON de limites). */
  message: string | null;
  /** Nome do contato — preenchido pelo item por destinatário (X141/X155), nulo no evento de campanha. */
  contactName: string | null;
  /** Telefone do contato — mesma origem do nome. */
  contactPhone: string | null;
}

interface TalkXTimelinePage {
  items: TalkXTimelineItem[];
  /** Cursor da próxima página: composto `created_at|id` do item mais antigo da página; nulo quando a página veio incompleta. */
  nextCursor: string | null;
}

/** Converte a linha do servidor no item da tela (um só lugar faz esse de-para). */
export function toTimelineItem(row: TalkXCampaignEvent): TalkXTimelineItem {
  return {
    id: row.id,
    kind: row.event_type,
    at: row.created_at,
    actorName: row.actor?.name ?? null,
    message: row.message ?? null,
    contactName: null,
    contactPhone: null,
  };
}

export interface UseTalkXCampaignTimelineOptions {
  /** Filtro por tipo aplicado no servidor. Lista vazia = todos os tipos. */
  kinds?: (TalkXEventType | string)[];
  /** Tamanho da página (padrão: TIMELINE_PAGE_SIZE). */
  pageSize?: number;
  /** Desliga a consulta (o painel "Ver todos" só consulta com o painel aberto). */
  enabled?: boolean;
  /** Intervalo do polling, em ms. 0 desliga. */
  refetchInterval?: number;
}

export function useTalkXCampaignTimeline(campaignId: string | null | undefined, options: UseTalkXCampaignTimelineOptions = {}) {
  const { kinds = [], pageSize = TIMELINE_PAGE_SIZE, enabled = true, refetchInterval = 10_000 } = options;
  const kindsKey = kinds.join(',');

  /**
   * Uma página da linha do tempo. `cursor` nulo pede a PRIMEIRA página; com cursor,
   * pede o que veio ANTES dele (`created_at` menor) — é o `p_before` do X141.
   */
  const fetchPage = async (cursor: string | null): Promise<TalkXTimelinePage> => {
    let query = fromTable('talkx_campaign_events')
      .select('*, actor:actor_id(name)')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(pageSize);
    if (cursor) {
      const [cursorCreatedAt, cursorId] = cursor.split('|');
      query = query.or(
        `created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`,
      );
    }
    if (kinds.length > 0) query = query.in('event_type', kinds);

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as TalkXCampaignEvent[];
    return {
      items: rows.map(toTimelineItem),
      // Página cheia = pode haver mais; incompleta = fim da lista.
      // Cursor compound: created_at|id do item mais antigo.
      nextCursor: rows.length === pageSize ? `${rows[rows.length - 1].created_at}|${rows[rows.length - 1].id}` : null,
    };
  };

  const query = useInfiniteQuery({
    queryKey: ['talkx-campaign-timeline', campaignId, kindsKey, pageSize],
    queryFn: ({ pageParam }) => fetchPage((pageParam as string | null) ?? null),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!campaignId && enabled,
    refetchInterval: refetchInterval > 0 ? refetchInterval : false,
  });

  const items = useMemo(() => (query.data?.pages ?? []).flatMap((page) => page.items), [query.data]);

  return {
    items,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: (query.error as Error | null) ?? null,
    hasMore: query.hasNextPage === true,
    isLoadingMore: query.isFetchingNextPage,
    loadMore: () => { void query.fetchNextPage(); },
    refetch: query.refetch,
  };
}
