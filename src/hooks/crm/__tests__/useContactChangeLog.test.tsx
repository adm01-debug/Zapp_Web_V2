import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * useContactChangeLog — trilha de alteração de contato (t_ba716533, banco).
 *
 * A tabela grava SÓ os NOMES das colunas alteradas (`campos text[]`), nunca os valores,
 * e a operação pode ser insert/update/soft_delete/restore. O que este teste trava:
 *
 * 1. Os campos chegam em pt-BR ("Telefone"), não como a coluna do banco ("phone").
 * 2. Exclusão e restauração aparecem como "Excluído"/"Restaurado", não como "update".
 * 3. Leitura PAGINADA: sem `.range()` o PostgREST corta na primeira página (teto 1000)
 *    e a trilha mais antiga some em silêncio. O mock reproduz esse teto.
 * 4. Leitura incompleta NÃO vira "total": erro sobe em vez de devolver lista parcial.
 * 5. Ator: nome resolvido em `profiles`; ator excluído (perfil sumido) não derruba a
 *    entrada — o nome some, a linha fica.
 * 6. Vazio devolve [] sem lançar.
 */
const h = vi.hoisted(() => {
  const PAGE_CAP = 1000;

  const makeRow = (i: number, total: number) => {
    const performedAt = new Date(Date.UTC(2026, 2, 1) + (total - i) * 60_000).toISOString();
    return {
      id: total - i, // 1 = mais recente
      contact_id: 'c1',
      operation: 'update' as string,
      campos: ['phone'],
      performed_by: 'user-1',
      performed_by_profile: 'prof-1',
      performed_by_db_role: 'authenticated',
      performed_at: performedAt,
    };
  };

  const state = {
    total: 3,
    rows: [] as Array<Record<string, unknown>>,
    mode: 'ok' as 'ok' | 'empty' | 'error',
    errorMessage: 'sem permissão de leitura',
    pageSizeCap: PAGE_CAP,
    rangeCalls: 0,
    orders: [] as string[],
    profiles: [] as Array<{ id: string; name: string | null }>,
    profilesError: null as string | null,
  };

  function builder(table: string) {
    let from: number | null = null;
    let to: number | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = {
      select: () => q,
      eq: () => q,
      in: () => q,
      order: (col: string) => { state.orders.push(col); return q; },
      range: (f: number, t: number) => { state.rangeCalls += 1; from = f; to = t; return q; },
      then: (resolve: (value: unknown) => unknown) => {
        if (table === 'profiles') {
          return Promise.resolve(resolve(
            state.profilesError
              ? { data: null, error: { message: state.profilesError } }
              : { data: state.profiles, error: null },
          ));
        }
        if (state.mode === 'error') {
          return Promise.resolve(resolve({ data: null, error: { message: state.errorMessage } }));
        }
        if (state.mode === 'empty') {
          return Promise.resolve(resolve({ data: null, error: null }));
        }
        const data = from === null
          ? state.rows.slice(0, state.pageSizeCap)
          : state.rows.slice(from, (to ?? 0) + 1);
        return Promise.resolve(resolve({ data, error: null }));
      },
    };
    return q;
  }

  return { builder, state, makeRow, PAGE_CAP };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (table: string) => h.builder(table) },
}));

import { useContactChangeLog } from '../useContactChangeLog';

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.state.mode = 'ok';
  h.state.total = 3;
  h.state.rows = Array.from({ length: 3 }, (_, i) => h.makeRow(i, 3));
  h.state.rangeCalls = 0;
  h.state.orders = [];
  h.state.profiles = [{ id: 'prof-1', name: 'Ana' }];
  h.state.profilesError = null;
});

describe('useContactChangeLog — campos em pt-BR', () => {
  it('traduz os nomes das colunas e não vaza o nome em inglês', async () => {
    h.state.total = 1;
    h.state.rows = [{
      ...h.makeRow(0, 1),
      campos: ['phone', 'assigned_to', 'postal_code', 'deleted_at'],
    }];

    const { result } = renderHook(() => useContactChangeLog('c1'), { wrapper });
    await waitFor(() => expect(result.current.entries.length).toBe(1));

    const entry = result.current.entries[0];
    expect(entry.fieldLabels).toEqual(['Telefone', 'Responsável', 'CEP', 'Exclusão']);
    expect(entry.fieldLabels).not.toContain('phone');
    expect(entry.fields).toEqual(['phone', 'assigned_to', 'postal_code', 'deleted_at']);
  });
});

describe('useContactChangeLog — operação', () => {
  it('mostra exclusão e restauração como Excluído/Restaurado, e edição como Alterado', async () => {
    h.state.total = 3;
    h.state.rows = [
      { ...h.makeRow(0, 3), id: 3, operation: 'soft_delete', campos: ['deleted_at'] },
      { ...h.makeRow(1, 3), id: 2, operation: 'restore', campos: ['deleted_at'] },
      { ...h.makeRow(2, 3), id: 1, operation: 'insert', campos: ['name'] },
    ];

    const { result } = renderHook(() => useContactChangeLog('c1'), { wrapper });
    await waitFor(() => expect(result.current.entries.length).toBe(3));

    const byId = new Map(result.current.entries.map((e) => [e.id, e]));
    expect(byId.get(3)?.operationLabel).toBe('Excluído');
    expect(byId.get(2)?.operationLabel).toBe('Restaurado');
    expect(byId.get(1)?.operationLabel).toBe('Criado');
  });

  it('não reescreve a data: performedAt é exatamente o que o banco devolveu', async () => {
    h.state.total = 2;
    h.state.rows = [
      { ...h.makeRow(0, 2), id: 2 },
      { ...h.makeRow(1, 2), id: 1 },
    ];

    const { result } = renderHook(() => useContactChangeLog('c1'), { wrapper });
    await waitFor(() => expect(result.current.entries.length).toBe(2));

    expect(result.current.entries.map((e) => e.performedAt)).toEqual([
      h.state.rows[0].performed_at,
      h.state.rows[1].performed_at,
    ]);
  });
});

describe('useContactChangeLog — leitura', () => {
  it('vazio devolve lista vazia sem lançar', async () => {
    h.state.mode = 'empty';
    const { result } = renderHook(() => useContactChangeLog('c1'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.entries).toEqual([]);
    expect(result.current.isEmpty).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('erro na leitura sobe como erro da query, não como trilha vazia', async () => {
    h.state.mode = 'error';
    const { result } = renderHook(() => useContactChangeLog('c1'), { wrapper });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.entries).toEqual([]);
    expect(result.current.isEmpty).toBe(false);
  });

  it('lê além do teto de 1000: 1500 linhas, em ordem, sem repetir nem perder', async () => {
    h.state.total = 1500;
    h.state.rows = Array.from({ length: 1500 }, (_, i) => h.makeRow(i, 1500));

    const { result } = renderHook(() => useContactChangeLog('c1'), { wrapper });
    await waitFor(() => expect(result.current.entries.length).toBe(1500));

    const ids = result.current.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(1500);
    expect(ids).toEqual(h.state.rows.map((r) => r.id));
    expect(h.state.rangeCalls).toBeGreaterThanOrEqual(2);
    // Ordem determinística: performed_at desc com id como desempate (vale em toda página).
    expect(h.state.orders.slice(0, 2)).toEqual(['performed_at', 'id']);
  });
});

describe('useContactChangeLog — ator', () => {
  it('resolve o nome do ator em profiles', async () => {
    h.state.total = 1;
    h.state.rows = [{ ...h.makeRow(0, 1), performed_by_profile: 'prof-1' }];

    const { result } = renderHook(() => useContactChangeLog('c1'), { wrapper });
    await waitFor(() => expect(result.current.entries.length).toBe(1));

    expect(result.current.entries[0].actorName).toBe('Ana');
    expect(result.current.entries[0].actorProfileId).toBe('prof-1');
  });

  it('ator excluído (perfil sumido) não derruba a entrada: nome some, linha fica', async () => {
    h.state.total = 1;
    h.state.rows = [{ ...h.makeRow(0, 1), performed_by_profile: 'prof-sumido', performed_by: 'user-x' }];
    h.state.profiles = []; // perfil do ator não existe mais

    const { result } = renderHook(() => useContactChangeLog('c1'), { wrapper });
    await waitFor(() => expect(result.current.entries.length).toBe(1));

    const entry = result.current.entries[0];
    expect(entry.actorName).toBeNull();
    expect(entry.hasActor).toBe(false);
    expect(entry.actorProfileId).toBe('prof-sumido');
  });

  it('falha ao resolver o ator sobe como erro em vez de marcar todos como excluídos', async () => {
    h.state.total = 1;
    h.state.rows = [{ ...h.makeRow(0, 1), performed_by_profile: 'prof-1' }];
    h.state.profilesError = 'permission denied for table profiles';

    const { result } = renderHook(() => useContactChangeLog('c1'), { wrapper });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.entries).toEqual([]);
  });

  it('campo fora da lista branca cai no próprio nome, sem inventar rótulo', async () => {
    h.state.total = 1;
    h.state.rows = [{ ...h.makeRow(0, 1), campos: ['campo_novo'] }];

    const { result } = renderHook(() => useContactChangeLog('c1'), { wrapper });
    await waitFor(() => expect(result.current.entries.length).toBe(1));

    expect(result.current.entries[0].fieldLabels).toEqual(['campo_novo']);
  });
});
