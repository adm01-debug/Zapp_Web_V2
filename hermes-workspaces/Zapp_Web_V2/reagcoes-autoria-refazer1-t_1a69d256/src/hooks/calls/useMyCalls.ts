import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { periodoParaIntervalo } from './useCallsKpi';

/** Itens por página do histórico (o plano fixa 8). */
export const PAGE_SIZE = 8;

export interface MyCallsParams {
  page: number;
  period: string;
  channel: string;
  direction: string;
  result: string;
  q: string;
  scope: string;
}

/** Linha da RPC , tipada a partir do banco gerado (nao inventada aqui). */
export type SearchMyCallsRow = Database['public']['Functions']['search_my_calls']['Returns'][number];

export interface MyCalls {
  rows: SearchMyCallsRow[];
  total: number;
  pages: number;
}

/**
 * Histórico paginado do servidor (T45).
 *
 * A RPC `search_my_calls` já existia e faz o recorte no banco: filtro por canal,
 * direção, resultado, busca, período e escopo, com `total_count` vindo junto. Por
 * isso a tela não pagina em memória nem conta linha no cliente.
 *
 * TEL-PERIOD-001: esta é a fronteira do contrato com a RPC, então é aqui que os
 * filtros da UI viram parâmetros válidos para o banco:
 *  - a RPC só interpreta NULL como "sem filtro"; o literal `'all'` da UI virava
 *    `c.channel = 'all'` / `c.direction = 'all'` e o histórico padrão voltava vazio.
 *  - `period` só mudava o queryKey e o histórico consultava sem janela de data,
 *    divergindo do KPI. Agora usa a mesma `periodoParaIntervalo` que o `my_calls_kpi`.
 */
export function useMyCalls(params: MyCallsParams) {
  const { page, period, channel, direction, result, q, scope } = params;

  const query = useQuery({
    queryKey: ['calls', page, period, channel, direction, result, q, scope],
    // keepPreviousData: ao trocar de página a tabela continua mostrando a anterior
    // enquanto a próxima chega, em vez de piscar o skeleton.
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    queryFn: async (): Promise<MyCalls> => {
      const { from, to } = periodoParaIntervalo(period);
      const buscarPagina = async (pagina: number): Promise<SearchMyCallsRow[]> => {
        const { data, error } = await supabase.rpc('search_my_calls', {
          p_limit: PAGE_SIZE,
          p_offset: (pagina - 1) * PAGE_SIZE,
          p_channel: channel === 'all' ? undefined : channel,
          p_direction: direction === 'all' ? undefined : direction,
          p_result: result === 'all' ? undefined : result,
          p_from: from,
          p_to: to,
          p_q: q,
          p_scope: scope,
        });
        if (error) throw error;
        // A RPC devolve um ARRAY de linhas e cada linha carrega o `total_count` da
        // consulta inteira (padrao de window function, nao `{ rows, total_count }`).
        return (Array.isArray(data) ? data : []) as SearchMyCallsRow[];
      };

      const lista = await buscarPagina(page);

      // R2-MOD-015: `total_count` vem por linha (`count(*) over ()`), entao uma pagina
      // vazia nao carrega total nenhum — nao da para descobrir o fim do historico pela
      // própria resposta vazia. Uma pagina alem do fim so se revela assim: pedimos a
      // pagina fora do intervalo, ela volta vazia e o hook anunciava "pagina 1" sem
      // refazer a consulta, deixando a tabela vazia com total 0. Aqui o total real sai
      // da consulta a pagina 1 (nao da primeira linha da pagina invalida) e sao os
      // dados dela que voltam. Pagina 1 vazia e fim de historico de verdade: 1 consulta.
      if (lista.length === 0 && page > 1) {
        const primeira = await buscarPagina(1);
        const totalCorrigido = Number(primeira[0]?.total_count ?? primeira.length) || 0;
        return {
          rows: primeira,
          total: totalCorrigido,
          pages: Math.max(1, Math.ceil(totalCorrigido / PAGE_SIZE)),
        };
      }

      const total = Number(lista[0]?.total_count ?? lista.length) || 0;
      return { rows: lista, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
    },
  });

  const total = query.data?.total ?? 0;
  const pages = query.data?.pages ?? 1;

  // Página fora do intervalo (filtro encolheu o resultado): volta para a 1.
  const pageEfetiva = page > pages ? 1 : page;

  return {
    rows: query.data?.rows ?? [],
    total,
    pages,
    page: pageEfetiva,
    paginaForaDoIntervalo: page > pages,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    refetch: query.refetch,
  };
}
