/**
 * TL-165 · Talk X — testes de integração para `fetchSuppressionPage` e
 * `fetchSuppressionContactOptions`.
 *
 * Cada teste constrói um mock encadeável do cliente Supabase que registra
 * todas as chamadas (`is`, `eq`, `or`/`ilike`, `order`, `range`) e afirma
 * diretamente que a query gerada contém os filtros e a ordenação corretos.
 *
 * O mock é criado com `vi.hoisted` para que as funções importem a instância
 * mockada antes de qualquer teste.
 */
import { describe, expect, it, vi } from 'vitest';

const mockChain = vi.hoisted(() => {
  const calls: {
    is: [string, unknown][];
    eq: [string, unknown][];
    ilike: [string, unknown][];
    or: [string][];
    order: [string, { ascending?: boolean } | undefined][];
    range: [number, number][];
  } = {
    is: [],
    eq: [],
    ilike: [],
    or: [],
    order: [],
    range: [],
  };
  const state: { table: string; results: Record<string, unknown> } = { table: '', results: {} };
  const chain = {
    is: vi.fn((col: string, val: unknown) => { calls.is.push([col, val]); return chain; }),
    eq: vi.fn((col: string, val: unknown) => { calls.eq.push([col, val]); return chain; }),
    ilike: vi.fn((col: string, val: unknown) => { calls.ilike.push([col, val]); return chain; }),
    or: vi.fn((filter: string) => { calls.or.push([filter]); return chain; }),
    order: vi.fn((col: string, opts?: { ascending?: boolean }) => { calls.order.push([col, opts]); return chain; }),
    range: vi.fn((from: number, to: number) => { calls.range.push([from, to]); return chain; }),
    not: vi.fn(() => chain),
    in: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    select: vi.fn(() => chain),
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

describe('fetchSuppressionPage', () => {
  it('filtra removidos com .is(removed_at, null) — falha sem ele', async () => {
    const { calls } = mockChain;
    calls.is.length = 0;
    await fetchSuppressionPage({ page: 1, pageSize: 10 });
    expect(calls.is).toContainEqual(['removed_at', null]);
  });

  it('aplica eq(origin, valor) quando origin é diferente de all', async () => {
    const { calls } = mockChain;
    calls.eq.length = 0;
    await fetchSuppressionPage({ page: 1, pageSize: 10, origin: 'lgpd' });
    expect(calls.eq).toContainEqual(['origin', 'lgpd']);
  });

  it('aplica ilike(reason, valor) quando reason é diferente de all', async () => {
    const { calls } = mockChain;
    calls.ilike.length = 0;
    await fetchSuppressionPage({ page: 1, pageSize: 10, reason: 'spam' });
    expect(calls.ilike).toContainEqual(['reason', '%spam%']);
  });

  it('ordena pela coluna mapeada e desempata por id na mesma direção', async () => {
    const { calls } = mockChain;
    calls.order.length = 0;
    await fetchSuppressionPage({ page: 1, pageSize: 10, order: 'created_at', dir: 'desc' });
    expect(calls.order).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
  });

  it('ordena pela coluna mapeada e desempata por id na direção ascendente', async () => {
    const { calls } = mockChain;
    calls.order.length = 0;
    await fetchSuppressionPage({ page: 1, pageSize: 10, order: 'origin', dir: 'asc' });
    expect(calls.order).toEqual([
      ['origin', { ascending: true }],
      ['id', { ascending: true }],
    ]);
  });

  it('aplica range com os offsets corretos da página', async () => {
    const { calls } = mockChain;
    calls.range.length = 0;
    await fetchSuppressionPage({ page: 2, pageSize: 10 });
    expect(calls.range).toEqual([[10, 19]]);
  });

  it('chamada de busca com search gera dois .or() — pai e embed separados', async () => {
    const { calls } = mockChain;
    calls.or.length = 0;
    await fetchSuppressionPage({ page: 1, pageSize: 10, search: '119' });
    expect(calls.or).toHaveLength(2);
    const pai = calls.or[0][0] as string;
    const embed = calls.or[1][0] as string;
    expect(pai).toContain('phone.ilike');
    expect(pai).toContain('reason.ilike');
    expect(embed).toContain('contacts.name.ilike');
    expect(embed).toContain('contacts.email.ilike');
    expect(embed).toContain('contacts.phone.ilike');
  });
});

describe('fetchSuppressionContactOptions', () => {
  it('propaga o erro da consulta de bloqueados — falha sem o `error` desestruturado', async () => {
    const { state } = mockChain;
    state.results = {
      contacts: { data: [{ id: 'c1', name: 'Ana', phone: '11999990000', company: null }], error: null },
      talkx_blacklist: { data: null, error: new Error('falha ao ler bloqueados') },
    };
    // Sem o `throw`, o contato já bloqueado voltaria como disponível (falha aberta).
    await expect(fetchSuppressionContactOptions('ana')).rejects.toThrow('falha ao ler bloqueados');
    state.results = {};
  });

  it('remove da lista quem já está bloqueado', async () => {
    const { state } = mockChain;
    state.results = {
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
    state.results = {};
  });
});
