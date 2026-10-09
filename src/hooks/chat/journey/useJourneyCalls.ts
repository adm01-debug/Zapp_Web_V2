import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { JourneyRangeIso, RawCall } from '@/lib/journey/rawRows';

/**
 * Ligações do contato no período (S019–S025) — a fonte de telefone do Histórico (Journey).
 *
 * Escopo: só as ligações DESTE contato (`calls.contact_id`) e só as que COMEÇARAM dentro do
 * intervalo (`calls.started_at` entre `sinceIso` e `untilIso`, `null` = lado aberto). O período
 * chega pronto do seletor da aba; este hook não redesenha a janela.
 *
 * Ordem e paginação: `started_at` decrescente com desempate por `id` (data empatada não pode
 * fazer a página repetir ou pular linha — `.range` sem `.order` estável devolve subconjunto
 * arbitrário) e páginas de 200 por rolagem, sem teto de 500/200.
 *
 * Gravação: a consulta NÃO pede `recording_url` ao banco — a URL nunca chega ao navegador por
 * este caminho (quem entrega o arquivo é a Edge `get-call-recording`, no destino do clique).
 * O histórico só marca se EXISTE gravação: `recording_status = 'available'`, o mesmo sinal que
 * o detalhe da ligação usa para oferecer o player (`CallHistoryTable`, `useCallRecording`).
 *
 * RLS do usuário no cliente do projeto (nunca service role). Se a consulta falhar, o hook
 * devolve lista vazia com `isError` — a tela mostra o erro, a lista continua um array.
 */

/** Tamanho da página da rolagem (S096: sem teto de 500/200). */
export const JOURNEY_CALLS_PAGE_SIZE = 200;

/** Colunas cruas pedidas ao banco — `recording_status` é o ÚNICO sinal de gravação. */
const CALL_COLUMNS =
  'id, direction, status, started_at, answered_at, ended_at, duration_seconds, talk_seconds, agent_id, answered_by, end_reason, recording_status';

/** Linha de `calls` como o PostgREST a devolve. */
interface CallRow {
  id: string;
  direction: string;
  status: string;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  talk_seconds: number | null;
  agent_id: string | null;
  answered_by: string | null;
  end_reason: string | null;
  /**
   * `none` | `pending` | `available` | `failed` (check do banco) — o ÚNICO sinal de gravação
   * que este hook pede. `recording_url` não é selecionado: a URL nunca chega ao navegador.
   */
  recording_status: string | null;
}

/**
 * Traduz a linha do banco para o tipo cru do histórico. Nenhum campo de gravação é copiado: o
 * `RawCall` carrega só `hasRecording` (decisão do plano).
 *
 * "Existe gravação" usa o MESMO teste do resto do sistema — `recording_status = 'available'` é
 * o que faz o detalhe da ligação oferecer o player (`CallHistoryTable`, `useCallRecording`) — e
 * nada mais: a URL não é pedida ao banco, então não há um segundo sinal a considerar.
 */
export function mapCallRow(row: CallRow): RawCall {
  return {
    id: row.id,
    direction: row.direction,
    status: row.status,
    startedAt: row.started_at,
    answeredAt: row.answered_at ?? null,
    endedAt: row.ended_at ?? null,
    durationSeconds: row.duration_seconds ?? null,
    talkSeconds: row.talk_seconds ?? null,
    agentId: row.agent_id ?? null,
    answeredBy: row.answered_by ?? null,
    endReason: row.end_reason ?? null,
    hasRecording: row.recording_status === 'available',
  };
}

export interface UseJourneyCallsArgs {
  contactId: string | null | undefined;
  /** Pontas em UTC do período (do seletor da aba); `null` deixa aquele lado aberto. */
  range: JourneyRangeIso;
}

export interface JourneyCallsState {
  calls: RawCall[];
  /** Primeira carga (nenhuma página ainda) — controla o esqueleto de carga. */
  isLoading: boolean;
  /** Página seguinte em voo — controla o esqueleto do fim da lista. */
  isFetchingNextPage: boolean;
  /** Há mais páginas não carregadas. */
  hasMore: boolean;
  /** A consulta falhou: `calls` vem vazia (o hook nunca lança para a tela). */
  isError: boolean;
  fetchNextPage: () => void;
  refetch: () => void;
}

/** Chave de cache: contato + as duas pontas do período (primitivas, para não invalidar à toa). */
export const journeyCallsKey = (
  contactId: string | null | undefined,
  range: JourneyRangeIso,
): readonly unknown[] => ['journey-calls', contactId ?? null, range.sinceIso, range.untilIso];

export function useJourneyCalls({ contactId, range }: UseJourneyCallsArgs): JourneyCallsState {
  const sinceIso = range.sinceIso;
  const untilIso = range.untilIso;

  const query = useInfiniteQuery({
    queryKey: journeyCallsKey(contactId, range),
    enabled: !!contactId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = pageParam * JOURNEY_CALLS_PAGE_SIZE;
      let consulta = supabase
        .from('calls')
        .select(CALL_COLUMNS)
        .eq('contact_id', contactId as string);
      if (sinceIso) consulta = consulta.gte('started_at', sinceIso);
      if (untilIso) consulta = consulta.lte('started_at', untilIso);

      const { data, error } = await consulta
        .order('started_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + JOURNEY_CALLS_PAGE_SIZE - 1);
      if (error) throw error;
      return ((data ?? []) as CallRow[]).map(mapCallRow);
    },
    // Página cheia = pode haver mais; página incompleta = fim da lista.
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === JOURNEY_CALLS_PAGE_SIZE ? allPages.length : undefined,
    staleTime: 30_000,
  });

  const calls = useMemo(() => query.data?.pages.flat() ?? [], [query.data]);

  return {
    calls,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasMore: !!query.hasNextPage,
    // Falha na PRIMEIRA página: `data` é indefinido, então `calls` já vem `[]`.
    isError: query.isError,
    fetchNextPage: () => { void query.fetchNextPage(); },
    refetch: () => { void query.refetch(); },
  };
}
