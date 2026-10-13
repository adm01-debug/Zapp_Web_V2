/**
 * Testes de `src/hooks/system/useRateLimitLogs.ts`.
 *
 * A fronteira dublada é o cliente Supabase (rede/banco): o duplo só reproduz o
 * encadeamento do PostgREST (`from().select().ilike().eq().order().range().limit()`)
 * e devolve, por fila, a resposta de cada consulta. O CÓDIGO REAL do hook é
 * exercitado. A listagem paginada e a janela de estatística são enfileiradas em
 * filas separadas (a que tem `.range()` é a listagem).
 *
 * Casos: recorte de página no servidor, `count` exato, filtros com o escape de
 * `escapeOrFilterValue`, ordem determinística com desempate, volta à página 1,
 * erro exposto ao chamador e resposta obsoleta descartada quando o filtro muda.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

import { useRateLimitLogs, type RateLimitLog } from '@/hooks/system/useRateLimitLogs';

type Resposta = { data?: unknown; count?: number | null; error?: unknown };
type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};
type Consulta = {
  tabela: string;
  colunas: string | null;
  contagem: string | null;
  ilike: [string, string][];
  eq: [string, unknown][];
  ordem: [string, boolean | undefined][];
  range: [number, number] | null;
  limite: number | null;
  signal?: AbortSignal;
};

const mocks = vi.hoisted(() => ({
  pagina: [] as unknown[],
  stats: [] as unknown[],
  consultas: [] as Consulta[],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (tabela: string) => {
      const registro: Consulta = {
        tabela,
        colunas: null,
        contagem: null,
        ilike: [],
        eq: [],
        ordem: [],
        range: null,
        limite: null,
      };
      mocks.consultas.push(registro);
      const builder: Record<string, unknown> = {
        select: (colunas: string, opcoes?: { count?: string }) => {
          registro.colunas = colunas;
          registro.contagem = opcoes?.count ?? null;
          return builder;
        },
        ilike: (coluna: string, valor: string) => {
          registro.ilike.push([coluna, valor]);
          return builder;
        },
        eq: (coluna: string, valor: unknown) => {
          registro.eq.push([coluna, valor]);
          return builder;
        },
        order: (coluna: string, opcoes?: { ascending?: boolean }) => {
          registro.ordem.push([coluna, opcoes?.ascending]);
          return builder;
        },
        range: (from: number, to: number) => {
          registro.range = [from, to];
          return builder;
        },
        limit: (n: number) => {
          registro.limite = n;
          return builder;
        },
        abortSignal: (signal: AbortSignal) => {
          registro.signal = signal;
          return builder;
        },
        then: (onFulfilled: (v: Resposta) => unknown, onRejected: (e: unknown) => unknown) => {
          const fila = registro.range ? mocks.pagina : mocks.stats;
          const padrao: Resposta = registro.range ? { data: [], count: 0 } : { data: [] };
          const entrada = fila.shift() ?? padrao;
          const resultado =
            entrada && typeof entrada === 'object' && 'deferred' in (entrada as object)
              ? (entrada as { deferred: Deferred<Resposta> }).deferred.promise
              : Promise.resolve(entrada as Resposta);
          return resultado.then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  },
}));

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function log(id: string, overrides: Partial<RateLimitLog> = {}): RateLimitLog {
  return {
    id,
    ip_address: '10.0.0.1',
    endpoint: '/api/v1/messages',
    user_id: null,
    request_count: 1,
    blocked: false,
    user_agent: null,
    country: null,
    city: null,
    created_at: '2026-10-13T10:00:00.000Z',
    ...overrides,
  };
}

/** Última consulta de listagem (a que leva `.range()`). */
function ultimaPagina(): Consulta {
  const paginas = mocks.consultas.filter(c => c.range !== null);
  return paginas[paginas.length - 1];
}

beforeEach(() => {
  mocks.pagina.length = 0;
  mocks.stats.length = 0;
  mocks.consultas.length = 0;
});

describe('useRateLimitLogs', () => {
  it('pagina e conta no servidor (range + count exato) em vez de cortar um lote no cliente', async () => {
    mocks.pagina.push({ data: [log('a')], count: 42 });

    const { result } = renderHook(() => useRateLimitLogs(true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const pagina = ultimaPagina();
    expect(pagina.tabela).toBe('rate_limit_logs');
    expect(pagina.contagem).toBe('exact');
    expect(pagina.range).toEqual([0, 24]);
    expect(pagina.limite).toBeNull();
    expect(pagina.ordem).toEqual([
      ['created_at', false],
      ['id', false],
    ]);

    expect(result.current.logs).toHaveLength(1);
    expect(result.current.total).toBe(42);
    expect(result.current.totalPages).toBe(2);
  });

  it('aplica filtros no servidor e escapa o termo de busca com escapeOrFilterValue', async () => {
    mocks.pagina.push({ data: [], count: 0 });

    const { result } = renderHook(() => useRateLimitLogs(true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setFilters({
        ip: '10.0, eq.admin',
        endpoint: 'a"b',
        blockedOnly: true,
      });
    });

    await waitFor(() => expect(ultimaPagina().ilike).toHaveLength(2));

    const pagina = ultimaPagina();
    expect(pagina.ilike).toEqual([
      ['ip_address', '"%10.0, eq.admin%"'],
      ['endpoint', '"%a\\"b%"'],
    ]);
    expect(pagina.eq).toEqual([['blocked', true]]);
    expect(pagina.range).toEqual([0, 24]);
  });

  it('ordena pelo campo pedido, com desempate por id', async () => {
    mocks.pagina.push({ data: [], count: 100 });

    const { result } = renderHook(() => useRateLimitLogs(true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setFilters({ sortBy: 'request_count', sortDir: 'asc' });
    });

    await waitFor(() => expect(ultimaPagina().ordem[0]).toEqual(['request_count', true]));
    expect(ultimaPagina().ordem).toEqual([
      ['request_count', true],
      ['id', true],
    ]);
  });

  it('pede a página explícita pelo intervalo e volta à página 1 quando o filtro muda', async () => {
    mocks.pagina.push({ data: [], count: 100 });

    const { result } = renderHook(() => useRateLimitLogs(true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setFilters({ page: 3 });
    });
    await waitFor(() => expect(ultimaPagina().range).toEqual([50, 74]));
    expect(result.current.filters.page).toBe(3);

    act(() => {
      result.current.setFilters({ blockedOnly: true });
    });
    await waitFor(() => expect(ultimaPagina().range).toEqual([0, 24]));
    expect(result.current.filters.page).toBe(1);
  });

  it('expõe o erro da consulta ao chamador e limpa o carregando', async () => {
    mocks.pagina.push({ data: null, count: null, error: { message: 'permission denied' } });

    const { result } = renderHook(() => useRateLimitLogs(true));

    await waitFor(() => expect(result.current.error).toBe('permission denied'));
    expect(result.current.loading).toBe(false);
    expect(result.current.logs).toEqual([]);
  });

  it('descarta a resposta obsoleta quando o filtro muda no meio da consulta', async () => {
    const antiga = deferred<Resposta>();
    mocks.pagina.push({ deferred: antiga });

    const { result } = renderHook(() => useRateLimitLogs(true));

    // Espera a consulta inicial (sem filtro) ficar realmente em voo antes de trocá-lo.
    await waitFor(() => expect(mocks.consultas.filter(c => c.range !== null)).toHaveLength(1));
    expect(mocks.consultas[0].signal?.aborted).toBe(false);

    const nova = deferred<Resposta>();
    mocks.pagina.push({ deferred: nova });

    act(() => {
      result.current.setFilters({ ip: '10.0.0.1' });
    });
    await waitFor(() => expect(mocks.consultas.filter(c => c.range !== null)).toHaveLength(2));
    expect(mocks.consultas[0].signal?.aborted).toBe(true);

    // A consulta antiga (sem filtro) responde DEPOIS de já ter sido descartada.
    await act(async () => {
      antiga.resolve({ data: [log('antigo')], count: 1 });
    });
    expect(result.current.logs).toEqual([]);
    expect(result.current.loading).toBe(true);

    // A consulta nova (com o filtro) traz o resultado que vale.
    await act(async () => {
      nova.resolve({ data: [log('novo')], count: 7 });
    });
    await waitFor(() => expect(result.current.logs).toHaveLength(1));
    expect(result.current.logs[0].id).toBe('novo');
    expect(result.current.total).toBe(7);
    expect(result.current.loading).toBe(false);
    expect(ultimaPagina().ilike).toEqual([['ip_address', '"%10.0.0.1%"']]);
  });

  it('mantém a janela recente de estatística (limit) separada da listagem paginada', async () => {
    mocks.pagina.push({ data: [log('a', { request_count: 3 })], count: 1 });
    mocks.stats.push({
      data: [log('a', { request_count: 3, blocked: true }), log('b', { request_count: 5, ip_address: '10.0.0.2' })],
    });

    const { result } = renderHook(() => useRateLimitLogs(true));

    await waitFor(() => expect(result.current.stats).not.toBeNull());
    const statsQuery = mocks.consultas.find(c => c.limite !== null)!;
    expect(statsQuery.limite).toBe(100);
    expect(statsQuery.range).toBeNull();
    expect(result.current.stats).toEqual({
      totalRequests: 8,
      blockedRequests: 1,
      uniqueIPs: 2,
      topEndpoints: [{ endpoint: '/api/v1/messages', count: 8 }],
      topIPs: [
        { ip: '10.0.0.2', count: 5, blocked: false },
        { ip: '10.0.0.1', count: 3, blocked: true },
      ],
    });
  });
});
