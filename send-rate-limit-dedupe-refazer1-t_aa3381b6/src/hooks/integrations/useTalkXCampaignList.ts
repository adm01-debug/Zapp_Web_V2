/**
 * X078 — Listagem de campanhas da Visão geral (tela 01) paginada no SERVIDOR.
 *
 * Antes: `useTalkX` trazia TODAS as campanhas (`select('*')`) e a tela filtrava,
 * buscava e paginava em memória (`TalkXOverview:85-98`) — com muitas campanhas a
 * base inteira trafega, e o realtime não enxerga exclusão (ouve só UPDATE e
 * INSERT). Aqui o recorte é do banco: colunas nomeadas, `count: 'exact'`,
 * `.range()` e os filtros (status, segmento, criador, período, busca) vão na
 * consulta.
 *
 * Tempo real em um canal só: UPDATE de contadores corrige a linha nas páginas
 * em cache (janela fixa de 500 ms, acumulado POR campanha). UPDATE que pode
 * mudar recorte ou ordem invalida a lista; INSERT e DELETE invalidam o
 * prefixo `talkx-campaigns` — esta lista e a lista legada que ainda alimenta os
 * KPIs da Visão geral e o indicador de campanha ativa. Sem o canal inscrito,
 * polling de 15 s.
 *
 * A chave da lista vive DENTRO da família `['talkx-campaigns', …]`: as mutações de
 * `useTalkX` (criar, duplicar, excluir, pausar…) invalidam esse prefixo e passam a
 * alcançar esta lista, em vez de deixar duas listas divergindo.
 *
 * `useTalkX().campaigns` continua servindo Analytics e "Em andamento" até as
 * demais trilhas (X079…X082) trocarem pelo recorte do servidor.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { escapeOrFilterValue } from '@/lib/postgrestFilters';
import { uniqueRealtimeTopic } from '@/lib/realtimeTopic';
import type { TalkXCampaign } from './useTalkX';

/** Itens por página padrão da Visão geral (o mock mostra "10 por página"). */
export const TALKX_CAMPAIGN_DEFAULT_PAGE_SIZE = 10;

/** Opções de itens por página que a tela oferece. */
export const TALKX_CAMPAIGN_PAGE_SIZES = [10, 20, 50] as const;
export type TalkXCampaignPageSize = (typeof TALKX_CAMPAIGN_PAGE_SIZES)[number];

/** Colunas de ordenação aceitas pela consulta. */
export type TalkXCampaignSortField =
  | 'name'
  | 'status'
  | 'sent_count'
  | 'scheduled_at'
  | 'created_at';

/**
 * Valor de `segmentId` que significa "Seleção manual": campanha sem segmento
 * (`segment_id is null`). É o mesmo literal que o seletor da tela já usa.
 */
export const TALKX_CAMPAIGN_MANUAL_SEGMENT = 'manual';

/** Sentinela dos seletores da tela para "sem filtro". */
const ANY = 'all';

/**
 * O período da barra de filtros recorta a DATA DE CRIAÇÃO da campanha: é a data
 * em que a linha entrou na lista. Recortar por `scheduled_at`/`started_at` é
 * decisão de tela (X081), não deste recorte.
 */
export const TALKX_CAMPAIGN_PERIOD_COLUMN = 'created_at';

/**
 * Colunas nomeadas da lista. `select('*')` trazia o registro inteiro (inclusive
 * `variables_config` e `audience_filters`, que a lista não usa) e obrigava a tela
 * a recalcular no navegador o que o banco já sabe responder.
 */
export const TALKX_CAMPAIGN_LIST_COLUMNS = [
  'id',
  'name',
  'description',
  'message_template',
  'status',
  'objective',
  'audience_source',
  'segment_id',
  'template_id',
  'media_url',
  'media_type',
  'total_recipients',
  'sent_count',
  'failed_count',
  'delivered_count',
  'read_count',
  'replied_count',
  'outcome_unknown_count',
  'whatsapp_connection_id',
  'created_by',
  'created_at',
  'updated_at',
  'started_at',
  'completed_at',
  'scheduled_at',
].join(', ');

/** Colunas em que a busca `ilike` procura. */
export const TALKX_CAMPAIGN_SEARCH_COLUMNS = ['name', 'description', 'message_template'] as const;

export interface TalkXCampaignListFilters {
  /** Busca livre (nome, descrição e mensagem). */
  search?: string;
  /** Status da campanha; `'all'`, vazio ou nulo não filtra. */
  status?: string | null;
  /** `segment_id`; `TALKX_CAMPAIGN_MANUAL_SEGMENT` filtra as sem segmento. */
  segmentId?: string | null;
  /** Autor da campanha (`created_by`). */
  createdBy?: string | null;
  /** Início do período (inclusive), sobre `created_at`. */
  from?: string | null;
  /** Fim do período (inclusive), sobre `created_at`. */
  to?: string | null;
  /** Coluna de ordenação, resolvida no servidor. */
  sortBy?: TalkXCampaignSortField;
  /** `true` = crescente. */
  sortAscending?: boolean;
}

/**
 * Uma página da lista: as linhas, o total do recorte (`count: 'exact'`) e a
 * página que de fato foi servida (pode ser menor que a pedida quando a lista
 * encolheu — ver `useTalkXCampaignList`).
 */
export interface TalkXCampaignPage {
  rows: TalkXCampaign[];
  count: number;
  page: number;
}

/**
 * Escapa o termo digitado para o `ilike`. `%` e `_` são curingas do LIKE: sem a
 * barra de escape, buscar "50%" casaria qualquer campanha começando com "50".
 * A barra entra primeiro para não re-escapar o que o LIKE acabou de escapar.
 * A gramática do `.or()` (vírgula, parêntese, aspas) fica com
 * `escapeOrFilterValue`, que é a fonte única desse escape no projeto.
 */
export function escapeTalkXCampaignSearch(term: string): string {
  return term.replace(/\\/g, '\\\\').replace(/[%_]/g, (char) => `\\${char}`);
}

/**
 * Cláusulas `ilike` da busca, prontas para o `.or()` do PostgREST. Devolve `null`
 * sem termo (a consulta segue sem filtro de busca).
 */
export function buildTalkXCampaignSearchFilter(search: string): string | null {
  const term = search.trim();
  if (!term) return null;
  const pattern = escapeOrFilterValue(`%${escapeTalkXCampaignSearch(term)}%`);
  return TALKX_CAMPAIGN_SEARCH_COLUMNS.map((column) => `${column}.ilike.${pattern}`).join(',');
}

/** Recorte normalizado: o mesmo recorte produz a mesma chave de consulta. */
function normalizeFilters(filters: TalkXCampaignListFilters) {
  const clean = (value: string | null | undefined): string | null =>
    value && value !== ANY ? value : null;
  return {
    search: (filters.search ?? '').trim(),
    status: clean(filters.status),
    segmentId: clean(filters.segmentId),
    createdBy: clean(filters.createdBy),
    from: filters.from || null,
    to: filters.to || null,
    sortBy: filters.sortBy ?? 'created_at',
    sortAscending: filters.sortAscending ?? false,
  };
}

type NormalizedFilters = ReturnType<typeof normalizeFilters>;

type TalkXCampaignField = keyof TalkXCampaign;
type TalkXCampaignRealtimeUpdate = {
  updated: TalkXCampaign;
  previous?: Partial<TalkXCampaign>;
};

const TALKX_CAMPAIGN_RECUT_FIELDS = [
  'status',
  'segment_id',
  'created_by',
  'created_at',
  'name',
  'description',
  'message_template',
] as const satisfies readonly TalkXCampaignField[];

const TALKX_CAMPAIGN_SORT_FIELDS = [
  'name',
  'status',
  'sent_count',
  'scheduled_at',
  'created_at',
] as const satisfies readonly TalkXCampaignSortField[];

function hasCampaignField(row: Partial<TalkXCampaign>, field: TalkXCampaignField): boolean {
  return Object.prototype.hasOwnProperty.call(row, field);
}

function campaignFieldChanged(
  updated: Partial<TalkXCampaign>,
  previous: Partial<TalkXCampaign> | undefined,
  field: TalkXCampaignField,
): boolean {
  if (!previous || !hasCampaignField(previous, field)) return hasCampaignField(updated, field);
  return !Object.is(previous[field], updated[field]);
}

function isNormalizedCampaignFilters(value: unknown): value is NormalizedFilters {
  if (!value || typeof value !== 'object') return false;
  const sortBy = (value as { sortBy?: unknown }).sortBy;
  return TALKX_CAMPAIGN_SORT_FIELDS.includes(sortBy as TalkXCampaignSortField);
}

function cachedCampaignListSortFields(queryClient: QueryClient): Set<TalkXCampaignSortField> {
  const fields = new Set<TalkXCampaignSortField>();
  queryClient
    .getQueryCache()
    .findAll({ queryKey: ['talkx-campaigns', 'list'] })
    .forEach((query) => {
      const filters = query.queryKey[2];
      if (isNormalizedCampaignFilters(filters)) fields.add(filters.sortBy);
    });
  return fields;
}

function campaignListUpdateAffectsRecorteOrOrder(
  update: TalkXCampaignRealtimeUpdate,
  queryClient: QueryClient,
): boolean {
  const recutChanged = TALKX_CAMPAIGN_RECUT_FIELDS.some((field) =>
    campaignFieldChanged(update.updated, update.previous, field),
  );
  if (recutChanged) return true;

  const sortedFields = cachedCampaignListSortFields(queryClient);
  return Array.from(sortedFields).some((field) =>
    campaignFieldChanged(update.updated, update.previous, field),
  );
}

/** Monta a consulta paginada do recorte (exportada para o teste conferir a query). */
export function buildTalkXCampaignListQuery(
  filters: NormalizedFilters,
  page: number,
  pageSize: number,
) {
  const first = (page - 1) * pageSize;
  const last = first + pageSize - 1;

  let request = supabase
    .from('talkx_campaigns')
    .select(TALKX_CAMPAIGN_LIST_COLUMNS, { count: 'exact' });

  if (filters.status) request = request.eq('status', filters.status);
  if (filters.segmentId === TALKX_CAMPAIGN_MANUAL_SEGMENT) {
    request = request.is('segment_id', null);
  } else if (filters.segmentId) {
    request = request.eq('segment_id', filters.segmentId);
  }
  if (filters.createdBy) request = request.eq('created_by', filters.createdBy);
  if (filters.from) request = request.gte(TALKX_CAMPAIGN_PERIOD_COLUMN, filters.from);
  if (filters.to) request = request.lte(TALKX_CAMPAIGN_PERIOD_COLUMN, filters.to);

  const searchFilter = buildTalkXCampaignSearchFilter(filters.search);
  if (searchFilter) request = request.or(searchFilter);

  // Ordem determinística: a coluna pedida e, sempre, `id` como desempate. Sem o
  // desempate, duas páginas seguidas podem repetir ou pular a mesma linha quando
  // várias campanhas empatam no nome, no status ou na data.
  request = request.order(filters.sortBy, { ascending: filters.sortAscending });
  request = request.order('id', { ascending: true });

  return request.range(first, last);
}

/**
 * Lista de campanhas paginada no servidor, com tempo real.
 *
 * A página é estado do hook (e não do chamador) porque a lista pode encolher
 * sozinha — exclusão em outra sessão, filtro ou busca: quando o total cai, a
 * página atual deixa de existir e o hook recua até a última página real em vez de
 * mostrar uma tabela vazia anunciando "página 3 de 2".
 */
export function useTalkXCampaignList(filters: TalkXCampaignListFilters = {}) {
  const queryClient = useQueryClient();
  const [pageSize, setPageSizeState] = useState<TalkXCampaignPageSize>(
    TALKX_CAMPAIGN_DEFAULT_PAGE_SIZE,
  );
  const [isLive, setIsLive] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // R2-MOD-026: um acumulador POR campanha — um timer único não perde o
  // UPDATE anterior quando outra campanha chega dentro da janela fixa de 500 ms.
  const pendingUpdatesRef = useRef<Map<string, TalkXCampaignRealtimeUpdate>>(new Map());

  const {
    search = '',
    status = null,
    segmentId = null,
    createdBy = null,
    from = null,
    to = null,
    sortBy = 'created_at',
    sortAscending = false,
  } = filters;

  const normalized = useMemo(
    () => normalizeFilters({ search, status, segmentId, createdBy, from, to, sortBy, sortAscending }),
    [search, status, segmentId, createdBy, from, to, sortBy, sortAscending],
  );

  // A página pedida pertence a um recorte (busca + filtros + ordem + itens por
  // página). Quando o recorte muda, a página do recorte antigo simplesmente não
  // vale: a lista volta para a primeira. O recorte fica guardado JUNTO com a
  // página, então a comparação acontece na renderização — sem `setState` dentro
  // de efeito (que o lint do projeto proíbe e que atrasaria a tela um quadro).
  const recorteKey = useMemo(
    () => JSON.stringify({ ...normalized, pageSize }),
    [normalized, pageSize],
  );
  const [pagination, setPagination] = useState<{ recorte: string; page: number }>({
    recorte: recorteKey,
    page: 1,
  });
  const requestedPage = pagination.recorte === recorteKey ? pagination.page : 1;

  const fetchCampaignPage = async (target: number): Promise<TalkXCampaignPage> => {
    const { data, error, count } = await buildTalkXCampaignListQuery(normalized, target, pageSize);
    if (error) throw error;
    return { rows: (data ?? []) as unknown as TalkXCampaign[], count: count ?? 0, page: target };
  };

  const listQuery = useQuery({
    // A chave carrega a página PEDIDA (estável). Quando ela não existe mais, a
    // consulta devolve a última página real — mesmo desenho do histórico de
    // chamadas (`useMyCalls`), que também corrige a página dentro do queryFn.
    queryKey: ['talkx-campaigns', 'list', normalized, requestedPage, pageSize],
    // Mantém a página anterior na tela enquanto a próxima chega (sem piscar).
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<TalkXCampaignPage> => {
      const requested = await fetchCampaignPage(requestedPage);
      const lastPage = Math.max(1, Math.ceil(requested.count / pageSize));
      if (requestedPage <= lastPage) return requested;
      // A página pedida deixou de existir (exclusão em outra sessão, filtro do
      // servidor): uma consulta extra traz a última página real em vez de
      // devolver tabela vazia anunciando "página 3 de 2".
      return fetchCampaignPage(lastPage);
    },
    // Fallback: só quando o canal de tempo real não está inscrito.
    refetchInterval: isLive ? false : 15_000,
  });

  const totalCount = listQuery.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  // A página pedida é um teto: enquanto ela não existir, a lista mostra a última
  // página real (a página efetiva vem do resultado da consulta).
  const page = listQuery.data?.page ?? requestedPage;

  const goToPage = useCallback(
    (next: number) => {
      const target = Number.isFinite(next) ? Math.floor(next) : 1;
      setPagination({ recorte: recorteKey, page: Math.min(Math.max(1, target), totalPages) });
    },
    [recorteKey, totalPages],
  );

  const setPageSize = useCallback((next: TalkXCampaignPageSize) => {
    setPageSizeState(next);
  }, []);

  useEffect(() => {
    const flushUpdates = () => {
      debounceRef.current = null;
      const pending = pendingUpdatesRef.current;
      if (pending.size === 0) return;
      // Novo mapa: eventos que chegarem durante o flush formam o próximo lote.
      pendingUpdatesRef.current = new Map();
      const listNeedsInvalidation = Array.from(pending.values()).some((update) =>
        campaignListUpdateAffectsRecorteOrOrder(update, queryClient),
      );
      const patch = (row: TalkXCampaign) => {
        const update = pending.get(row.id);
        return update ? { ...row, ...update.updated } : row;
      };
      // A lista só é remendada para UPDATE de contadores que não afeta recorte nem
      // a ordenação das listas em cache. Mudança de filtro/busca/ordem refaz a
      // consulta para a linha sair do recorte ou voltar na posição correta.
      if (listNeedsInvalidation) {
        void queryClient.invalidateQueries({ queryKey: ['talkx-campaigns', 'list'] });
      } else {
        queryClient.setQueriesData<TalkXCampaignPage>(
          { queryKey: ['talkx-campaigns', 'list'] },
          (old) => (old ? { ...old, rows: old.rows.map(patch) } : old),
        );
      }
      queryClient.setQueriesData<TalkXCampaign | null>(
        { queryKey: ['talkx-campaigns', 'detail'] },
        (old) => (old ? patch(old) : old),
      );
    };

    const invalidateCampaignViews = () => {
      // O prefixo alcança a lista paginada, a lista legada (`useTalkX().campaigns`,
      // que ainda alimenta os KPIs da Visão geral e o indicador "Em andamento") e o
      // detalhe roteado.
      void queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
    };

    const channel = supabase
      .channel(uniqueRealtimeTopic('talkx:campaigns:list'))
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'talkx_campaigns' },
        (payload) => {
          const realtimePayload = payload as unknown as {
            new: TalkXCampaign;
            old?: Partial<TalkXCampaign>;
          };
          const updated = realtimePayload.new;
          pendingUpdatesRef.current.set(updated.id, {
            updated,
            previous: realtimePayload.old,
          });
          if (!debounceRef.current) debounceRef.current = setTimeout(flushUpdates, 500);
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'talkx_campaigns' },
        () => invalidateCampaignViews(),
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'talkx_campaigns' },
        () => invalidateCampaignViews(),
      )
      .subscribe((status) => {
        setIsLive(status === 'SUBSCRIBED');
      });

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = null;
      pendingUpdatesRef.current = new Map();
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return {
    campaigns: listQuery.data?.rows ?? [],
    totalCount,
    totalPages,
    page,
    pageSize,
    pageSizeOptions: TALKX_CAMPAIGN_PAGE_SIZES,
    goToPage,
    setPageSize,
    isLive,
    isLoading: listQuery.isLoading,
    isFetching: listQuery.isFetching,
    isError: listQuery.isError,
    error: listQuery.error,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
    refetch: listQuery.refetch,
  };
}

/**
 * Uma campanha pelo id, para as rotas de `TalkXView` (`?campaign=<id>`), que hoje
 * resolvem a linha com `campaigns.find` sobre a lista inteira. Sem id, a consulta
 * fica parada (`enabled: false`).
 */
export function useTalkXCampaign(campaignId: string | null | undefined) {
  const id = campaignId ?? null;
  return useQuery({
    queryKey: ['talkx-campaigns', 'detail', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<TalkXCampaign | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('talkx_campaigns')
        .select(TALKX_CAMPAIGN_LIST_COLUMNS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as TalkXCampaign | null;
    },
  });
}
