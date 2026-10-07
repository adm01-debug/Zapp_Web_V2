import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * R2-MOD-044 (item 413) — o ranking "Mais enviados" do rail contava TODA linha
 * de catalog_send_events da janela de 30 dias, inclusive as `failed` (o envio
 * em que NENHUMA mensagem chegou ao contato). O produto A tem 2 envios que
 * saíram e 1 que falhou por inteiro: o ranking tem de mostrar 2, não 3.
 *
 * `status` é a coluna que o hook precisa ler para decidir — o teste também
 * falha se alguém voltar a pedir só `product_id, product_name` (a agregação
 * não tem como adivinhar o status que não foi buscado).
 */

type QueryResult = { data: unknown; error: unknown };

const rangeCalls: [number, number][] = [];
const selectArgs: string[] = [];
let recentResult: QueryResult = { data: [], error: null };
let topResult: QueryResult = { data: [], error: null };

/** Builder encadeável mínimo do PostgREST. Os dois caminhos do hook terminam
 * em métodos diferentes — `recent` usa `.limit()`, `top` usa `.range()` — e
 * cada um resolve no seu resultado configurado. */
function makeBuilder() {
  const b: Record<string, unknown> = {};
  const self = () => b;
  b.select = (cols: string) => { selectArgs.push(cols); return b; };
  b.gte = vi.fn(self);
  b.order = vi.fn(self);
  b.limit = vi.fn(() => Promise.resolve(recentResult));
  b.range = vi.fn((from: number, to: number) => {
    rangeCalls.push([from, to]);
    return Promise.resolve(topResult);
  });
  return b;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => makeBuilder() },
}));

import { useCatalogRecentSends } from '@/hooks/integrations/useCatalogRecentSends';

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }) },
    children,
  );
}

const A = 'prod-a';
const B = 'prod-b';
const C = 'prod-c';

beforeEach(() => {
  rangeCalls.length = 0;
  selectArgs.length = 0;
  recentResult = { data: [], error: null };
  topResult = { data: [], error: null };
});

describe('useCatalogRecentSends — "Mais enviados" (R2-MOD-044 / item 413)', () => {
  it('não conta envios que falharam por inteiro (status "failed")', async () => {
    topResult = {
      data: [
        { product_id: A, product_name: 'Produto A', status: 'sent' },
        { product_id: A, product_name: 'Produto A', status: 'failed' },
        { product_id: A, product_name: 'Produto A', status: 'sent' },
      ],
      error: null,
    };

    const { result } = renderHook(() => useCatalogRecentSends(), { wrapper });
    await waitFor(() => expect(result.current.topSent).toHaveLength(1));

    expect(result.current.topSent[0]).toEqual({ product_id: A, product_name: 'Produto A', count: 2 });
  });

  it('continua contando o envio parcial (ao menos uma mensagem saiu)', async () => {
    topResult = {
      data: [
        { product_id: B, product_name: 'Produto B', status: 'partial' },
        { product_id: B, product_name: 'Produto B', status: 'sent' },
      ],
      error: null,
    };

    const { result } = renderHook(() => useCatalogRecentSends(), { wrapper });
    await waitFor(() => expect(result.current.topSent).toHaveLength(1));

    expect(result.current.topSent[0].count).toBe(2);
  });

  it('produto cujas tentativas falharam todas some do ranking', async () => {
    topResult = {
      data: [
        { product_id: C, product_name: 'Produto C', status: 'failed' },
        { product_id: C, product_name: 'Produto C', status: 'failed' },
        { product_id: A, product_name: 'Produto A', status: 'sent' },
      ],
      error: null,
    };

    const { result } = renderHook(() => useCatalogRecentSends(), { wrapper });
    await waitFor(() => expect(result.current.topSent).toHaveLength(1));

    expect(result.current.topSent.map((t) => t.product_id)).toEqual([A]);
  });

  it('busca a coluna status para poder filtrar (a agregação não adivinha)', async () => {
    topResult = { data: [{ product_id: A, product_name: 'Produto A', status: 'sent' }], error: null };

    const { result } = renderHook(() => useCatalogRecentSends(), { wrapper });
    await waitFor(() => expect(result.current.topSent).toHaveLength(1));

    // O select dos recentes traz o embed `contacts(...)`; o da agregação não.
    const topSelect = selectArgs.find((cols) => !cols.includes('contacts('));
    expect(topSelect).toContain('status');
  });
});
