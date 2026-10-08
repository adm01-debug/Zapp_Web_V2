/**
 * R2-MOD-042 (item 411) — "Histórico de envios do catálogo esconde registros
 * além dos 500 mais recentes".
 *
 * O hook aplicava `limit(500)` sem total nem continuação: com mais de 500
 * eventos o mais antigo nunca chegava à aba "Enviados" (a busca respondia
 * "Nenhum envio com esses filtros" para um envio que existe) e o CSV exportava
 * só o lote truncado.
 *
 * Este teste chama o hook REAL com o cliente Supabase falso servindo 1201
 * eventos em páginas de 1000 (a mesma semântica de offset do PostgREST) e
 * prova que a leitura percorre TODAS as páginas — a mais antiga inclusive — e
 * que uma varredura que pare no teto de páginas vira ERRO, não um recorte
 * parcial apresentado como histórico completo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

type Linha = Record<string, unknown>;
type Resultado = { data: unknown; error: unknown };

const rangeCalls: [number, number][] = [];
let tabela: Linha[] = [];
/** Toda página volta cheia: prova o teto de páginas (fail-closed). */
let paginasInfinitas = false;

/** Linha crua de `catalog_send_events` como o PostgREST devolve. */
function linhaDoEvento(i: number): Linha {
  return {
    id: `evt-${i + 1}`,
    product_id: `prod-${i + 1}`,
    product_name: `Produto ${i + 1}`,
    product_sku: null,
    variant_label: null,
    contact_id: 'c1',
    agent_id: 'a1',
    template: 'informal',
    images_count: 1,
    status: 'sent',
    created_at: new Date(Date.UTC(2026, 9, 6, 12, 0, 0) - i * 60_000).toISOString(),
    contacts: null,
    profiles: null,
  };
}

/** Builder encadeável mínimo do PostgREST. */
function makeBuilder() {
  const b: Record<string, unknown> = {};
  const self = () => b;
  b.select = () => b;
  b.eq = vi.fn(self);
  b.order = vi.fn(self);
  // Comportamento ANTIGO (`limit(500)`): devolve só o começo da tabela.
  b.limit = vi.fn((n: number): Promise<Resultado> => Promise.resolve({ data: tabela.slice(0, n), error: null }));
  b.range = vi.fn((from: number, to: number): Promise<Resultado> => {
    rangeCalls.push([from, to]);
    const data = paginasInfinitas
      ? Array.from({ length: to - from + 1 }, (_, i) => linhaDoEvento(from + i))
      : tabela.slice(from, to + 1);
    return Promise.resolve({ data, error: null });
  });
  return b;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => makeBuilder() },
}));

import { useCatalogSendHistory } from '@/hooks/integrations/useCatalogSendHistory';

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      {children}
    </QueryClientProvider>
  );
}

beforeEach(() => {
  rangeCalls.length = 0;
  paginasInfinitas = false;
  tabela = Array.from({ length: 1201 }, (_, i) => linhaDoEvento(i));
});

describe('useCatalogSendHistory — histórico completo (R2-MOD-042 / item 411)', () => {
  it('lê todas as páginas: o 1201º evento (o mais antigo) chega ao resultado', async () => {
    const { result } = renderHook(() => useCatalogSendHistory(), { wrapper });

    await waitFor(() => expect(result.current.rows).toHaveLength(1201));

    expect(result.current.rows[1200].id).toBe('evt-1201');
    expect(result.current.rows[1200].product_name).toBe('Produto 1201');
    // varredura paginada de verdade, não um lote único
    expect(rangeCalls).toEqual([[0, 999], [1000, 1999]]);
  });

  it('varredura que para no teto de páginas é erro, não histórico parcial silencioso', async () => {
    paginasInfinitas = true;

    const { result } = renderHook(() => useCatalogSendHistory(), { wrapper });

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.rows).toHaveLength(0);
  });
});
