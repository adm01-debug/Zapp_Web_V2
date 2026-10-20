/**
 * Y05 — testes NOVOS do hook de banco externo (`useExternalDB`).
 *
 * Exercita os hooks REAIS e dubla so a FRONTEIRA: o servico que fala com a Edge
 * (`ExternalCRMService`), o cliente de integracao (`callCRMIntegration`) e a
 * flag de habilitacao do CRM. Cada caso prova comportamento observavel:
 * parametros enviados, o portao duplo (feature flag + `enabled`), a paginacao
 * (limit/offset), os filtros/ordem, os padroes de data/meta e a invalidacao
 * do cache na mutacao.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryExternal = vi.fn();
const callRPC = vi.fn();
vi.mock('@/services/crm/external-crm.service', () => ({
  ExternalCRMService: {
    queryExternal: (...args: unknown[]) => queryExternal(...args),
    callRPC: (...args: unknown[]) => callRPC(...args),
  },
}));

const callCRMIntegration = vi.fn();
vi.mock('@/lib/crmIntegration', () => ({
  callCRMIntegration: (...args: unknown[]) => callCRMIntegration(...args),
}));

let crmEnabled = true;
vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({
  useCRMIntegrationEnabled: () => crmEnabled,
}));

import {
  useExternalMutation,
  useExternalRPC,
  useExternalSelect,
  useExternalTableBrowser,
} from '@/hooks/integrations/useExternalDB';
import type { ExternalDBFilter } from '@/types/externalDB';

type QueryResult = { data: unknown; error: unknown };

const calls = (fn: unknown) => (fn as Mock).mock.calls as unknown[][];
const lastArgs = () => {
  const all = calls(queryExternal);
  return all[all.length - 1][0] as Record<string, unknown>;
};

let qc: QueryClient;

function wrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
  crmEnabled = true;
  queryExternal.mockResolvedValue({ data: [], meta: { record_count: 0, duration_ms: 0, severity: 'ok' } });
  callRPC.mockResolvedValue({ data: [], meta: { record_count: 0, duration_ms: 0, severity: 'ok' } });
  callCRMIntegration.mockResolvedValue({ data: { ok: true } });
  qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  });
});

describe('useExternalSelect', () => {
  it('usa limit 50 / offset 0 por padrão e devolve os dados', async () => {
    queryExternal.mockResolvedValue({
      data: [{ id: 'e-1' }],
      meta: { record_count: 1, duration_ms: 7, severity: 'ok' },
    });
    const { result } = renderHook(() => useExternalSelect({ table: 'empresas' }), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.data?.data).toHaveLength(1));

    expect(queryExternal).toHaveBeenCalledWith({
      table: 'empresas',
      select: undefined,
      filters: undefined,
      order: undefined,
      limit: 50,
      offset: 0,
      countMode: undefined,
    });
    expect(result.current.data?.data[0]).toEqual({ id: 'e-1' });
  });

  it('repassa select, filtros, ordem, paginacao e modo de contagem', async () => {
    const filtros: ExternalDBFilter[] = [{ column: 'uf', operator: 'eq', value: 'SP' }];
    const { result } = renderHook(
      () => useExternalSelect({
        table: 'clientes',
        select: 'id,nome',
        filters: filtros,
        order: { column: 'nome', ascending: false },
        limit: 10,
        offset: 20,
        countMode: 'estimated',
      }),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(queryExternal).toHaveBeenCalled());

    expect(lastArgs()).toEqual({
      table: 'clientes',
      select: 'id,nome',
      filters: filtros,
      order: { column: 'nome', ascending: false },
      limit: 10,
      offset: 20,
      countMode: 'estimated',
    });
    await waitFor(() => expect(result.current.data?.data).toEqual([]));
  });

  it('não busca quando a flag do CRM está desligada', async () => {
    crmEnabled = false;
    const { result } = renderHook(() => useExternalSelect({ table: 'empresas' }), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));

    expect(queryExternal).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  it('não busca quando enabled=false mesmo com o CRM ligado', async () => {
    const { result } = renderHook(
      () => useExternalSelect({ table: 'empresas', enabled: false }),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));

    expect(queryExternal).not.toHaveBeenCalled();
  });

  it('expõe o erro do serviço sem repetir a chamada (retry desligado)', async () => {
    queryExternal.mockRejectedValue(new Error('CFM integration request failed'));
    const { result } = renderHook(() => useExternalSelect({ table: 'empresas' }), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.error).toBeTruthy());

    expect((result.current.error as Error).message).toBe('CFM integration request failed');
    expect(queryExternal).toHaveBeenCalledTimes(1);
  });
});

describe('useExternalRPC', () => {
  it('chama a RPC externa com os parâmetros informados', async () => {
    callRPC.mockResolvedValue({ data: [{ total: 12 }], meta: { record_count: 1, duration_ms: 3, severity: 'ok' } });
    const { result } = renderHook(
      () => useExternalRPC<{ total: number }>({ rpc: 'relatorio_vendas', params: { ano: 2026 } }),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.data?.data).toHaveLength(1));

    expect(callRPC).toHaveBeenCalledWith('relatorio_vendas', { ano: 2026 });
    expect(result.current.data?.data[0]).toEqual({ total: 12 });
  });

  it('não chama a RPC quando a flag do CRM está desligada', async () => {
    crmEnabled = false;
    const { result } = renderHook(
      () => useExternalRPC({ rpc: 'relatorio_vendas' }),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));

    expect(callRPC).not.toHaveBeenCalled();
  });

  it('não chama a RPC quando enabled=false', async () => {
    const { result } = renderHook(
      () => useExternalRPC({ rpc: 'relatorio_vendas', enabled: false }),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));

    expect(callRPC).not.toHaveBeenCalled();
  });
});

describe('useExternalTableBrowser', () => {
  it('começa na página 0 com 25 linhas e conta exata', async () => {
    const { result } = renderHook(() => useExternalTableBrowser('empresas'), { wrapper: wrapper() });

    await waitFor(() => expect(queryExternal).toHaveBeenCalled());

    expect(result.current.page).toBe(0);
    expect(result.current.pageSize).toBe(25);
    expect(result.current.filters).toEqual([]);
    expect(result.current.searchTerm).toBe('');
    expect(lastArgs()).toEqual({
      table: 'empresas',
      filters: [],
      order: undefined,
      limit: 25,
      offset: 0,
      countMode: 'exact',
    });
  });

  it('muda a página e recalcula o offset pela página', async () => {
    const { result } = renderHook(() => useExternalTableBrowser('empresas'), { wrapper: wrapper() });
    await waitFor(() => expect(queryExternal).toHaveBeenCalled());

    act(() => result.current.goToPage(2));
    await waitFor(() => expect(lastArgs().offset).toBe(50));

    expect(result.current.page).toBe(2);
    expect(lastArgs().limit).toBe(25);

    act(() => result.current.nextPage());
    await waitFor(() => expect(lastArgs().offset).toBe(75));
    expect(result.current.page).toBe(3);
  });

  it('não deixa a página ficar negativa', async () => {
    const { result } = renderHook(() => useExternalTableBrowser('empresas'), { wrapper: wrapper() });
    await waitFor(() => expect(queryExternal).toHaveBeenCalled());

    act(() => result.current.prevPage());

    expect(result.current.page).toBe(0);
    expect(lastArgs().offset).toBe(0);
  });

  it('trocar o tamanho da página volta para a primeira página', async () => {
    const { result } = renderHook(() => useExternalTableBrowser('empresas'), { wrapper: wrapper() });
    await waitFor(() => expect(queryExternal).toHaveBeenCalled());
    act(() => result.current.goToPage(2));
    await waitFor(() => expect(result.current.page).toBe(2));

    act(() => result.current.setPageSize(100));

    expect(result.current.pageSize).toBe(100);
    expect(result.current.page).toBe(0);
    await waitFor(() => expect(lastArgs().limit).toBe(100));
    expect(lastArgs().offset).toBe(0);
  });

  it('adicionar filtro volta para a primeira página e envia o filtro', async () => {
    const { result } = renderHook(() => useExternalTableBrowser('empresas'), { wrapper: wrapper() });
    await waitFor(() => expect(queryExternal).toHaveBeenCalled());
    act(() => result.current.goToPage(3));
    await waitFor(() => expect(result.current.page).toBe(3));

    act(() => result.current.addFilter({ column: 'uf', operator: 'eq', value: 'SP' }));

    expect(result.current.filters).toEqual([{ column: 'uf', operator: 'eq', value: 'SP' }]);
    expect(result.current.page).toBe(0);
    await waitFor(() => expect((lastArgs().filters as unknown[]).length).toBe(1));
    expect(lastArgs().offset).toBe(0);
  });

  it('remover filtro pelo índice volta para a primeira página', async () => {
    const { result } = renderHook(() => useExternalTableBrowser('empresas'), { wrapper: wrapper() });
    await waitFor(() => expect(queryExternal).toHaveBeenCalled());
    act(() => {
      result.current.addFilter({ column: 'uf', operator: 'eq', value: 'SP' });
      result.current.addFilter({ column: 'ramo', operator: 'ilike', value: 'metal' });
    });
    await waitFor(() => expect((lastArgs().filters as unknown[]).length).toBe(2));

    act(() => result.current.removeFilter(0));

    expect(result.current.filters).toEqual([{ column: 'ramo', operator: 'ilike', value: 'metal' }]);
    await waitFor(() => expect((lastArgs().filters as unknown[]).length).toBe(1));
  });

  it('limpar filtros zera a lista e a página', async () => {
    const { result } = renderHook(() => useExternalTableBrowser('empresas'), { wrapper: wrapper() });
    await waitFor(() => expect(queryExternal).toHaveBeenCalled());
    act(() => result.current.addFilter({ column: 'uf', operator: 'eq', value: 'SP' }));
    await waitFor(() => expect((lastArgs().filters as unknown[]).length).toBe(1));

    act(() => result.current.clearFilters());

    expect(result.current.filters).toEqual([]);
    expect(result.current.page).toBe(0);
  });

  it('ordenar por uma coluna grava a ordem e volta para a primeira página', async () => {
    const { result } = renderHook(() => useExternalTableBrowser('empresas'), { wrapper: wrapper() });
    await waitFor(() => expect(queryExternal).toHaveBeenCalled());
    act(() => result.current.goToPage(2));
    await waitFor(() => expect(result.current.page).toBe(2));

    act(() => result.current.setSort('nome', false));

    expect(result.current.order).toEqual({ column: 'nome', ascending: false });
    expect(result.current.page).toBe(0);
    await waitFor(() => expect(lastArgs().order).toEqual({ column: 'nome', ascending: false }));
  });

  it('usa [] / 0 quando o serviço responde sem data e sem meta', async () => {
    queryExternal.mockResolvedValue({} as QueryResult);
    const { result } = renderHook(() => useExternalTableBrowser('empresas'), { wrapper: wrapper() });

    await waitFor(() => expect(queryExternal).toHaveBeenCalled());

    expect(result.current.data).toEqual([]);
    expect(result.current.totalRecords).toBe(0);
    expect(result.current.duration).toBe(0);
  });

  it('expõe a contagem e a duração quando o serviço as informa', async () => {
    queryExternal.mockResolvedValue({
      data: [{ id: 'e-1' }],
      meta: { record_count: 1234, duration_ms: 45, severity: 'ok' },
    });
    const { result } = renderHook(() => useExternalTableBrowser('empresas'), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.data).toHaveLength(1));

    expect(result.current.totalRecords).toBe(1234);
    expect(result.current.duration).toBe(45);
  });

  it('expõe a mensagem do erro da consulta', async () => {
    queryExternal.mockRejectedValue(new Error('tabela externa indisponível'));
    const { result } = renderHook(() => useExternalTableBrowser('empresas'), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.error).toBe('tabela externa indisponível'));
  });
});

describe('useExternalMutation', () => {
  it('envia a mutação pela integração autenticada e devolve os dados', async () => {
    callCRMIntegration.mockResolvedValue({ data: { inserted: 1 } });
    const { result } = renderHook(() => useExternalMutation(), { wrapper: wrapper() });

    let out: unknown;
    await act(async () => {
      out = await result.current.mutateAsync({
        action: 'update',
        table: 'empresas',
        data: { nome: 'Metal Co' },
        match: { id: 'e-1' },
      });
    });

    expect(out).toEqual({ inserted: 1 });
    expect(callCRMIntegration).toHaveBeenCalledWith('mutate', {
      mutationAction: 'update',
      table: 'empresas',
      data: { nome: 'Metal Co' },
      match: { id: 'e-1' },
    });
  });

  it('invalida a consulta da tabela alterada ao concluir', async () => {
    const { result } = renderHook(
      () => ({
        select: useExternalSelect({ table: 'empresas' }),
        mutation: useExternalMutation(),
      }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(queryExternal).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.mutation.mutateAsync({ action: 'insert', table: 'empresas', data: { nome: 'Nova' } });
    });

    await waitFor(() => expect(queryExternal).toHaveBeenCalledTimes(2));
  });

  it('propaga o erro da integração', async () => {
    callCRMIntegration.mockRejectedValue(new Error('sem permissão para gravar no CRM'));
    const { result } = renderHook(() => useExternalMutation(), { wrapper: wrapper() });

    await act(async () => {
      await result.current
        .mutateAsync({ action: 'insert', table: 'empresas', data: { nome: 'X' } })
        .catch(() => undefined);
    });

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect((result.current.error as Error).message).toBe('sem permissão para gravar no CRM');
  });
});
