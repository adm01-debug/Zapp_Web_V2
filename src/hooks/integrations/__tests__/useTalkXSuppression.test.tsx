/**
 * TL-165 · Talk X — testes de `fetchSuppressionPage` e `fetchSuppressionContactOptions`.
 *
 * Cada teste usa um mock encadeável do cliente Supabase que registra as
 * chamadas (`select`, `is`, `eq`, `ilike`, `or`, `order`, `range`) e afirma
 * diretamente que a consulta gerada contém os filtros e a ordenação corretos.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockChain = vi.hoisted(() => {
  const calls = {
    select: [] as [string, unknown][],
    is: [] as [string, unknown][],
    eq: [] as [string, unknown][],
    ilike: [] as [string, unknown][],
    or: [] as [string, unknown][],
    order: [] as [string, { ascending?: boolean } | undefined][],
    range: [] as [number, number][],
  };
  const state: { table: string; results: Record<string, unknown> } = { table: '', results: {} };
  const chain = {
    select: vi.fn((cols: string, opts?: unknown) => { calls.select.push([cols, opts]); return chain; }),
    is: vi.fn((col: string, val: unknown) => { calls.is.push([col, val]); return chain; }),
    eq: vi.fn((col: string, val: unknown) => { calls.eq.push([col, val]); return chain; }),
    ilike: vi.fn((col: string, val: unknown) => { calls.ilike.push([col, val]); return chain; }),
    or: vi.fn((filter: string, opts?: unknown) => { calls.or.push([filter, opts]); return chain; }),
    order: vi.fn((col: string, opts?: { ascending?: boolean }) => { calls.order.push([col, opts]); return chain; }),
    range: vi.fn((from: number, to: number) => { calls.range.push([from, to]); return chain; }),
    not: vi.fn(() => chain),
    in: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    from: vi.fn((table: string) => { state.table = table; return chain; }),
    // A cadeia é "awaitable": cada tabela resolve com o resultado configurado no teste.
    then: (resolve: (value: unknown) => unknown) =>
      resolve(state.results[state.table] ?? { data: [], error: null, count: 0 }),
  };
  return { calls, chain, state };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mockChain.chain.from },
}));

import { fetchSuppressionContactOptions, fetchSuppressionPage } from '@/hooks/integrations/useTalkXSuppression';

beforeEach(() => {
  for (const list of Object.values(mockChain.calls)) list.length = 0;
  mockChain.state.results = {};
});

describe('fetchSuppressionPage', () => {
  it('filtra removidos com .is(removed_at, null) — falha sem ele', async () => {
    await fetchSuppressionPage({ page: 1, pageSize: 10 });
    expect(mockChain.calls.is).toContainEqual(['removed_at', null]);
  });

  it('aplica eq(origin, valor) quando origin é diferente de all', async () => {
    await fetchSuppressionPage({ page: 1, pageSize: 10, origin: 'lgpd' });
    expect(mockChain.calls.eq).toContainEqual(['origin', 'lgpd']);
  });

  it('não filtra origem nem motivo com all', async () => {
    await fetchSuppressionPage({ page: 1, pageSize: 10, origin: 'all', reason: 'all' });
    expect(mockChain.calls.eq).toEqual([]);
    expect(mockChain.calls.ilike).toEqual([]);
  });

  it('aplica ilike(reason, valor) quando reason é diferente de all', async () => {
    await fetchSuppressionPage({ page: 1, pageSize: 10, reason: 'spam' });
    expect(mockChain.calls.ilike).toContainEqual(['reason', '%spam%']);
  });

  it('ordena pela coluna pedida e desempata por id na direção descendente', async () => {
    await fetchSuppressionPage({ page: 1, pageSize: 10, order: 'created_at', dir: 'desc' });
    expect(mockChain.calls.order).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
  });

  it('ordena pela coluna pedida e desempata por id na direção ascendente', async () => {
    await fetchSuppressionPage({ page: 1, pageSize: 10, order: 'origin', dir: 'asc' });
    expect(mockChain.calls.order).toEqual([
      ['origin', { ascending: true }],
      ['id', { ascending: true }],
    ]);
  });

  it('aplica range com os offsets corretos da página', async () => {
    await fetchSuppressionPage({ page: 2, pageSize: 10 });
    expect(mockChain.calls.range).toEqual([[10, 19]]);
  });

  it('sem busca: embed sem !inner e nenhum .or()', async () => {
    await fetchSuppressionPage({ page: 1, pageSize: 10, search: '   ' });
    expect(mockChain.calls.select[0][0]).not.toContain('!inner');
    expect(mockChain.calls.or).toEqual([]);
  });

  it('com busca: embed contacts!inner e um único .or() restrito ao embed por referencedTable', async () => {
    await fetchSuppressionPage({ page: 1, pageSize: 10, search: '119' });
    expect(mockChain.calls.select[0][0]).toContain('contacts:contact_id!inner(');
    expect(mockChain.calls.or).toHaveLength(1);
    const [filter, opts] = mockChain.calls.or[0];
    expect(opts).toEqual({ referencedTable: 'contacts' });
    expect(filter).toContain('name.ilike."%119%"');
    expect(filter).toContain('email.ilike."%119%"');
    expect(filter).toContain('phone.ilike."%119%"');
    // Nada de coluna do pai nem prefixo de embed misturado no mesmo .or().
    expect(filter).not.toContain('reason.');
    expect(filter).not.toContain('contacts.');
  });
});

describe('fetchSuppressionContactOptions', () => {
  it('propaga o erro da consulta de bloqueados — falha sem o `error` desestruturado', async () => {
    mockChain.state.results = {
      contacts: { data: [{ id: 'c1', name: 'Ana', phone: '11999990000', company: null }], error: null },
      talkx_blacklist: { data: null, error: new Error('falha ao ler bloqueados') },
    };
    // Sem o `throw`, o contato já bloqueado voltaria como disponível (falha aberta).
    await expect(fetchSuppressionContactOptions('ana')).rejects.toThrow('falha ao ler bloqueados');
  });

  it('remove da lista quem já está bloqueado', async () => {
    mockChain.state.results = {
      contacts: {
        data: [
          { id: 'c1', name: 'Ana', phone: '11999990000', company: null },
          { id: 'c2', name: 'Bia', phone: '11999991111', company: null },
        ],
        error: null,
      },
      talkx_blacklist: { data: [{ contact_id: 'c1' }], error: null },
    };
    const options = await fetchSuppressionContactOptions('');
    expect(options.map((o) => o.id)).toEqual(['c2']);
  });
});
