import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// SL-217 (Bloco 16 do plano IA-200, etapa IA-152 — recomendar produtos com
// restrições REAIS): o aceite é "Produto incompatível não é recomendado como
// viável; dado ausente exige confirmação". O único atributo de restrição que
// existe em fonte autorizada no catálogo é `products.stock_quantity`; a coluna
// NÃO era sequer lida, então um produto esgotado (estoque 0) era apresentado ao
// atendente como se fosse viável.
//
// O stub de PostgREST devolve as linhas reais da fixture (aplica o filtro
// `eq`), então o teste passa pelo hook REAL com backend falso — não troca o
// código do cartão por um mock dele.

type Row = Record<string, unknown>;
interface TableConfig { rows: Row[]; error: { message: string } | null }
interface QueryLog { table: string; cols: string | null; filters: Array<{ op: string; col: string; val: unknown }> }

const h = vi.hoisted(() => ({
  tables: {} as Record<string, TableConfig>,
  queries: [] as QueryLog[],
}));

vi.mock('@/integrations/supabase/client', () => {
  const makeBuilder = (table: string) => {
    const entry: QueryLog = { table, cols: null, filters: [] };
    h.queries.push(entry);

    const cfg = (): TableConfig => h.tables[table] ?? { rows: [], error: null };
    const matching = () =>
      cfg().rows.filter((row) => entry.filters.every((f) => (f.op === 'eq' ? row[f.col] === f.val : true)));
    const result = () => {
      const { error } = cfg();
      if (error) return { data: null, error };
      return { data: matching(), error: null };
    };

    const builder = {
      select: (cols: string) => { entry.cols = cols; return builder; },
      eq: (col: string, val: unknown) => { entry.filters.push({ op: 'eq', col, val }); return builder; },
      order: () => builder,
      limit: () => builder,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return builder;
  };

  return { supabase: { from: (table: string) => makeBuilder(table) } };
});

import { useRecommendedProducts } from '@/hooks/chat/useRecommendedProducts';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

async function renderProducts(interesses: string[] = []) {
  const hook = renderHook(() => useRecommendedProducts('c1', interesses), { wrapper });
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
  return hook.result.current.data ?? [];
}

const CATALOGO = [
  { id: 'p1', name: 'Caneca branca', price: 18.5, currency: 'BRL', image_url: null, category: 'Canecas', stock_quantity: 12, is_active: true },
  { id: 'p2', name: 'Caneca esmaltada', price: 22, currency: 'BRL', image_url: null, category: 'Canecas', stock_quantity: 0, is_active: true },
  { id: 'p3', name: 'Caneca térmica', price: 31, currency: 'BRL', image_url: null, category: 'Canecas', stock_quantity: null, is_active: true },
];

describe('useRecommendedProducts — recomendar com restrições reais (IA-152)', () => {
  beforeEach(() => {
    h.tables = { products: { rows: CATALOGO.map((p) => ({ ...p })), error: null } };
    h.queries = [];
  });

  it('não apresenta como viável o produto sem estoque (incompatível conhecido)', async () => {
    const produtos = await renderProducts(['canecas']);

    expect(produtos.map((p) => p.id)).not.toContain('p2');
    expect(produtos.map((p) => p.id)).toContain('p1');
  });

  it('marca o produto de estoque desconhecido para confirmação, e o de estoque informado como disponível', async () => {
    const produtos = await renderProducts(['canecas']);

    const conhecida = produtos.find((p) => p.id === 'p1');
    const desconhecida = produtos.find((p) => p.id === 'p3');

    expect(conhecida?.availability).toBe('disponivel');
    expect(desconhecida?.availability).toBe('confirmar');
  });

  it('lê o estoque autorizado do catálogo na consulta', async () => {
    await renderProducts(['canecas']);

    const query = h.queries.find((q) => q.table === 'products');
    expect(query?.cols).toContain('stock_quantity');
    expect(query?.filters).toEqual([{ op: 'eq', col: 'is_active', val: true }]);
  });

  it('no fallback para o catálogo recente (contato sem interesse que casa) o estoque também é respeitado', async () => {
    const produtos = await renderProducts(['brindes-corporativos']);

    expect(produtos.map((p) => p.id)).toEqual(['p1', 'p3']);
  });

  // SL-217 (refazer 1). Antes o filtro de estoque rodava DEPOIS de escolher entre
  // "casa com o interesse" e "catálogo recente": com toda a categoria do contato
  // esgotada, o match ocupava as vagas, o filtro esvaziava tudo e o atendente
  // recebia lista vazia em vez dos recentes disponíveis (que a versão anterior
  // mostrava). Aqui o único item da categoria pedida está esgotado.
  it('com toda a categoria pedida esgotada, cai para o catálogo recente disponível em vez de devolver lista vazia', async () => {
    h.tables = {
      products: {
        rows: [
          { id: 'e1', name: 'Caneca branca', price: 18.5, currency: 'BRL', image_url: null, category: 'Canecas', stock_quantity: 0, is_active: true },
          { id: 'e2', name: 'Caneca esmaltada', price: 22, currency: 'BRL', image_url: null, category: 'Canecas', stock_quantity: 0, is_active: true },
          { id: 'd1', name: 'Mochila executiva', price: 89, currency: 'BRL', image_url: null, category: 'Mochilas', stock_quantity: 7, is_active: true },
        ],
        error: null,
      },
    };

    const produtos = await renderProducts(['canecas']);

    expect(produtos.map((p) => p.id)).toEqual(['d1']);
    expect(produtos).not.toHaveLength(0);
  });

  it('match esgotado não "rouba" a vaga: o item disponível da categoria pedida prevalece sobre o recente de outra categoria', async () => {
    h.tables = {
      products: {
        rows: [
          { id: 'e1', name: 'Caneca branca', price: 18.5, currency: 'BRL', image_url: null, category: 'Canecas', stock_quantity: 0, is_active: true },
          { id: 'd1', name: 'Mochila executiva', price: 89, currency: 'BRL', image_url: null, category: 'Mochilas', stock_quantity: 7, is_active: true },
          { id: 'p1', name: 'Caneca térmica', price: 31, currency: 'BRL', image_url: null, category: 'Canecas', stock_quantity: 4, is_active: true },
        ],
        error: null,
      },
    };

    const produtos = await renderProducts(['canecas']);

    expect(produtos.map((p) => p.id)).toEqual(['p1']);
  });
});
