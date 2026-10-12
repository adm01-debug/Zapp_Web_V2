import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * Y07a — metas do Dashboard por CONTAGEM (cartão metas-periodo-count).
 *
 * As metas só precisam do NÚMERO de linhas. Este stub não devolve linhas: ele
 * REGISTRA o select de cada tabela e responde `{ count }`. Sem `head: true` o
 * banco devolveria linhas (ou nenhuma contagem) e o `current` não teria de
 * onde sair; sem `sender = agent` no filtro, mensagem de contato contaria.
 */

type CountResult = { data: null; error: null; count: number };
type SelectRecord = { table: string; columns: string; options?: { count?: string; head?: boolean } };
type FilterRecord = { col: string; val: unknown };
type ResultRecord = { table: string; data: unknown; count: number };

interface Chain {
  select: (columns: string, options?: { count?: string; head?: boolean }) => Chain;
  eq: (col: string, val: unknown) => Chain;
  gte: (col: string, val: unknown) => Chain;
  lte: (col: string, val: unknown) => Chain;
  single: () => Promise<{ data: unknown; error: unknown }>;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  then: (resolve: (v: CountResult) => unknown) => Promise<unknown>;
}

const h = vi.hoisted(() => ({
  selects: [] as SelectRecord[],
  filters: [] as Array<{ table: string; list: FilterRecord[] }>,
  resultados: [] as ResultRecord[],
  counts: {
    messages: 2,
    contacts: 1,
    conversation_analyses: 3,
    conversation_analyses_resolvido: 2,
  } as Record<string, number>,
}));

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));

vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    const list: FilterRecord[] = [];
    h.filters.push({ table, list });

    const chave = () =>
      table === 'conversation_analyses' && list.some((f) => f.col === 'status' && f.val === 'resolvido')
        ? 'conversation_analyses_resolvido'
        : table;

    const chain = {} as Chain;
    chain.select = (columns, options) => {
      h.selects.push({ table, columns, options });
      return chain;
    };
    chain.eq = (col, val) => { list.push({ col, val }); return chain; };
    chain.gte = (col, val) => { list.push({ col, val }); return chain; };
    chain.lte = (col, val) => { list.push({ col, val }); return chain; };
    chain.single = () => Promise.resolve({ data: { id: 'perfil-1', name: 'Ana' }, error: null });
    chain.maybeSingle = () => Promise.resolve({ data: { id: 'perfil-1', name: 'Ana' }, error: null });
    chain.then = (resolve) => {
      const count = h.counts[chave()] ?? 0;
      h.resultados.push({ table: chave(), data: null, count });
      return Promise.resolve({ data: null, error: null, count } as CountResult).then(resolve);
    };
    return chain;
  };

  return { supabase: { from: (table: string) => builder(table) } };
});

import { useGoalsDashboard } from '@/hooks/analytics/useGoalsDashboard';

const PERFIL = 'perfil-1';

function renderGoals() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useGoalsDashboard(), { wrapper: Wrapper });
}

async function esperarContagem() {
  const hook = renderGoals();
  await waitFor(() => expect(h.selects.some((s) => s.table === 'messages')).toBe(true));
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

function metaPorId<T extends { id: string }>(goals: T[], id: string) {
  return goals.find((g) => g.id === id);
}

describe('useGoalsDashboard — metas por contagem', () => {
  beforeEach(() => {
    h.selects = [];
    h.filters = [];
    h.resultados = [];
    h.counts = {
      messages: 2,
      contacts: 1,
      conversation_analyses: 3,
      conversation_analyses_resolvido: 2,
    };
  });

  it('consulta cada tabela de meta em modo contagem (count/head) e não recebe linhas', async () => {
    await esperarContagem();

    const contagens = h.selects.filter((s) => s.options?.head === true);
    expect(contagens.map((s) => s.table).sort()).toEqual([
      'contacts',
      'conversation_analyses',
      'conversation_analyses',
      'messages',
    ]);
    for (const s of contagens) {
      expect(s.options).toEqual({ count: 'exact', head: true });
    }

    // Nenhuma leitura de meta pode pedir colunas sem contagem (voltaria a trazer linhas).
    const semContagem = h.selects.filter(
      (s) => ['messages', 'contacts', 'conversation_analyses'].includes(s.table) && s.options === undefined,
    );
    expect(semContagem).toEqual([]);

    // O banco respondeu só com número, nunca com array de linhas.
    expect(h.resultados.length).toBeGreaterThan(0);
    expect(h.resultados.every((r) => r.data === null)).toBe(true);
  });

  it('o current de cada meta sai do count do banco (mensagens do agente, contatos e resolução)', async () => {
    const { result } = await esperarContagem();

    expect(metaPorId(result.current.goals, 'messages-sent')?.current).toBe(2);
    expect(metaPorId(result.current.goals, 'contacts-handled')?.current).toBe(1);
    // 2 de 3 análises resolvidas = 67%.
    expect(metaPorId(result.current.goals, 'resolution-rate')?.current).toBe(67);
  });

  it('o recorte do banco filtra o agente do perfil e sender = agent (não conta contato)', async () => {
    await esperarContagem();

    const mensagens = h.filters.find((f) => f.table === 'messages');
    expect(mensagens?.list).toEqual(
      expect.arrayContaining([
        { col: 'agent_id', val: PERFIL },
        { col: 'sender', val: 'agent' },
      ]),
    );
  });
});
