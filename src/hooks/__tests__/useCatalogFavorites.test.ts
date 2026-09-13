import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockUser = { id: 'user-1' };

const favRow = (overrides = {}) => ({
  id: 'f1',
  product_id: 'p1',
  product_name: 'Açucareiro em bambu',
  product_sku: 'PO-13153',
  primary_image_url: 'https://example.com/a.jpg',
  created_at: '2026-09-12T10:00:00Z',
  ...overrides,
});

// Estado "vivo" que o mock lê/escreve — simula a tabela real: insert/delete
// mudam o que a próxima list (disparada por invalidateQueries) devolve.
let fakeTable: Record<string, unknown>[] = [];
let insertShouldFail = false;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: mockUser } })) },
    from: vi.fn((table: string) => {
      if (table !== 'catalog_favorites') throw new Error(`tabela inesperada: ${table}`);
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.order = vi.fn(async () => ({ data: [...fakeTable], error: null }));
      builder.insert = vi.fn(async (payload: Record<string, unknown>) => {
        if (insertShouldFail) return { data: null, error: { message: 'insert falhou' } };
        fakeTable = [{ id: `f-${payload.product_id}`, ...payload }, ...fakeTable];
        return { data: null, error: null };
      });
      builder.delete = vi.fn(() => builder);
      let deleteProductId: string | null = null;
      let eqCalls = 0;
      builder.eq = vi.fn((column: string, value: string) => {
        eqCalls += 1;
        if (column === 'product_id') deleteProductId = value;
        if (eqCalls >= 2) {
          fakeTable = fakeTable.filter((r) => r.product_id !== deleteProductId);
          return Promise.resolve({ data: null, error: null });
        }
        return builder;
      });
      return builder;
    }),
  },
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
  log: { debug: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { useCatalogFavorites } from '@/hooks/integrations/useExternalCatalog';

let activeQueryClient: QueryClient | null = null;

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  activeQueryClient = queryClient;
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

/** renderHook + registro do unmount para o afterEach — evita a instância
 * anterior ficar montada (e sua query ativa) durante o próximo teste. */
let activeUnmount: (() => void) | null = null;
function renderFavoritesHook() {
  const rendered = renderHook(() => useCatalogFavorites(), { wrapper: createWrapper() });
  activeUnmount = rendered.unmount;
  return rendered;
}

describe('useCatalogFavorites', () => {
  beforeEach(() => {
    fakeTable = [];
    insertShouldFail = false;
  });

  // Isolamento entre testes: sem isso, uma query invalidada pelo toggle()
  // do teste anterior pode resolver durante o teste seguinte (o hook não é
  // desmontado por padrão entre 'it's), causando corrida intermitente.
  afterEach(() => {
    activeUnmount?.();
    activeUnmount = null;
    activeQueryClient?.clear();
    activeQueryClient = null;
  });

  it('lista os favoritos do usuário', async () => {
    fakeTable = [favRow()];
    const { result } = renderFavoritesHook();
    await waitFor(() => expect(result.current.favorites).toHaveLength(1));
    expect(result.current.isFavorite('p1')).toBe(true);
    expect(result.current.isFavorite('outro')).toBe(false);
  });

  it('toggle otimista: favoritar aparece na lista antes da escrita confirmar, e persiste após o refetch', async () => {
    const { result } = renderFavoritesHook();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.toggle({ id: 'p2', name: 'Caneta Azul', sku: 'CAN-1', primary_image_url: null });
    });

    expect(result.current.isFavorite('p2')).toBe(true);
    expect(fakeTable.some((r) => r.product_id === 'p2')).toBe(true);
  });

  it('toggle otimista: desfavoritar remove da lista e da tabela', async () => {
    fakeTable = [favRow()];
    const { result } = renderFavoritesHook();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => expect(result.current.isFavorite('p1')).toBe(true));

    await act(async () => {
      await result.current.toggle({ id: 'p1', name: 'Açucareiro em bambu' });
    });

    // waitFor (não expect direto): garante que o estado assíncrono do
    // hook (não só a variável fakeTable) já refletiu a remoção antes de
    // afirmar — evita depender de um flush síncrono perfeito do act().
    await waitFor(() => expect(result.current.isFavorite('p1')).toBe(false));
    expect(fakeTable.some((r) => r.product_id === 'p1')).toBe(false);
  });

  it('rollback: falha ao favoritar desfaz o update otimista e não grava na tabela', async () => {
    insertShouldFail = true;
    const { result } = renderFavoritesHook();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.toggle({ id: 'p3', name: 'Garrafa' });
    });

    expect(result.current.isFavorite('p3')).toBe(false);
    expect(fakeTable.some((r) => r.product_id === 'p3')).toBe(false);
  });

  it('sem usuário logado, toggle não faz nada', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    (supabase.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { user: null } });
    const { result } = renderFavoritesHook();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.toggle({ id: 'p4', name: 'Mochila' });
    });

    expect(result.current.isFavorite('p4')).toBe(false);
    expect(fakeTable.some((r) => r.product_id === 'p4')).toBe(false);
  });
});
