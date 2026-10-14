/**
 * Presets de filtro do Inbox (cartão t_c836534e).
 *
 * Cobre o que o critério de pronto pede: sincroniza por `saved_filters`
 * (entity_type='inbox_filters', dono), respeita o teto de 20, recusa nome
 * duplicado (case-insensitive) SEM tratar `%`/`_` como curinga, não ressuscita
 * preset apagado, reverte a lista quando a gravação falha e limpa o cache no
 * logout.
 *
 * O cliente Supabase é um fake com estado (linhas, erros forçados) e registra
 * as chamadas da consulta, para provar o escopo da leitura.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const harness = vi.hoisted(() => ({
  rows: [] as Array<{
    id: string;
    name: string;
    filters: unknown;
    created_at: string;
    user_id: string;
    entity_type: string;
  }>,
  deleteError: null as { message: string } | null,
  insertError: null as { message: string } | null,
  userId: 'u1' as string | null,
  lastRead: null as null | { entity_type?: string; user_id?: string; limit?: number },
  authCallbacks: [] as Array<(event: string) => void>,
}));

vi.mock('@/integrations/supabase/client', () => {
  const buildQuery = () => {
    const read: { entity_type?: string; user_id?: string; limit?: number } = {};
    let op: 'select' | 'insert' | 'delete' | 'update' = 'select';
    let payload: Record<string, unknown> | null = null;
    let deleteId: string | null = null;

    const resolve = () => {
      if (op === 'insert') {
        if (harness.insertError) return { data: null, error: harness.insertError };
        const row = {
          id: `id_${harness.rows.length + 1}`,
          created_at: '2026-10-13T12:00:00.000Z',
          user_id: harness.userId ?? 'u1',
          entity_type: 'inbox_filters',
          ...(payload ?? {}),
        };
        harness.rows.push(row as never);
        return { data: row, error: null };
      }
      if (op === 'delete') {
        if (harness.deleteError) return { data: null, error: harness.deleteError };
        harness.rows = harness.rows.filter((r) => r.id !== deleteId);
        return { data: null, error: null };
      }
      if (op === 'update') {
        harness.rows = harness.rows.map((r) =>
          r.id === deleteId ? ({ ...r, ...(payload ?? {}) } as never) : r
        );
        return { data: harness.rows.find((r) => r.id === deleteId) ?? null, error: null };
      }
      harness.lastRead = read;
      let rows = harness.rows.filter(
        (r) =>
          (!read.entity_type || r.entity_type === read.entity_type) &&
          (!read.user_id || r.user_id === read.user_id)
      );
      if (read.limit) rows = rows.slice(0, read.limit);
      return { data: rows, error: null };
    };

    const q: Record<string, unknown> = {};
    const self = () => q;
    q.select = vi.fn(self);
    q.eq = vi.fn((col: string, val: string) => {
      if (op === 'delete' && col === 'id') deleteId = val;
      else (read as Record<string, string>)[col] = val;
      return q;
    });
    q.or = vi.fn(() => q);
    q.order = vi.fn(() => q);
    q.limit = vi.fn((n: number) => {
      read.limit = n;
      return q;
    });
    q.insert = vi.fn((row: Record<string, unknown>) => {
      op = 'insert';
      payload = row;
      return q;
    });
    q.update = vi.fn((row: Record<string, unknown>) => {
      op = 'update';
      payload = row;
      return q;
    });
    q.delete = vi.fn(() => {
      op = 'delete';
      return q;
    });
    q.single = vi.fn(async () => resolve());
    q.maybeSingle = vi.fn(async () => resolve());
    q.then = (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resolve()).then(onFulfilled);
    return q;
  };

  return {
    supabase: {
      from: vi.fn(() => buildQuery()),
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: harness.userId ? { id: harness.userId } : null },
        })),
        onAuthStateChange: vi.fn((cb: (event: string) => void) => {
          harness.authCallbacks.push(cb);
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        }),
      },
    },
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from 'sonner';
import {
  useInboxFilterPresets,
  MAX_INBOX_FILTER_PRESETS,
  INBOX_FILTER_PRESETS_QUERY_KEY,
} from '../useInboxFilterPresets';

const presetRow = (n: number, name: string) => ({
  id: `p${n}`,
  name,
  filters: { mainTab: 'open', subTab: 'attending', contactType: null, queueId: null },
  created_at: `2026-10-13T12:00:${String(n).padStart(2, '0')}.000Z`,
  user_id: 'u1',
  entity_type: 'inbox_filters',
});

const conteudo = (queueId: string | null = null) => ({
  mainTab: 'open' as const,
  subTab: 'attending' as const,
  contactType: null,
  queueId,
});

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, refetchOnMount: false } },
  });
}

function wrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useInboxFilterPresets — presets do inbox sincronizados', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.rows = [];
    harness.deleteError = null;
    harness.insertError = null;
    harness.userId = 'u1';
    harness.lastRead = null;
    harness.authCallbacks.length = 0;
  });

  it('lê só os presets do próprio usuário e do entity_type do inbox, com teto', async () => {
    harness.rows = [presetRow(1, 'Meu preset')];
    const qc = makeClient();
    const { result } = renderHook(() => useInboxFilterPresets(), { wrapper: wrapper(qc) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.presets.map((p) => p.name)).toEqual(['Meu preset']);
    expect(harness.lastRead?.entity_type).toBe('inbox_filters');
    expect(harness.lastRead?.user_id).toBe('u1');
    expect(harness.lastRead?.limit).toBe(MAX_INBOX_FILTER_PRESETS);
  });

  it('recusa o 21º preset e não grava nada', async () => {
    harness.rows = Array.from({ length: MAX_INBOX_FILTER_PRESETS }, (_, i) => presetRow(i + 1, `Preset ${i + 1}`));
    const qc = makeClient();
    const { result } = renderHook(() => useInboxFilterPresets(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.presets).toHaveLength(MAX_INBOX_FILTER_PRESETS));

    await act(async () => {
      await expect(result.current.savePreset({ name: 'O 21º', filters: conteudo() })).rejects.toThrow(
        /Limite de 20/
      );
    });

    expect(harness.rows).toHaveLength(MAX_INBOX_FILTER_PRESETS);
    expect(toast.error).toHaveBeenCalled();
  });

  it('recusa nome duplicado sem diferenciar maiúsculas', async () => {
    harness.rows = [presetRow(1, 'Promoções')];
    const qc = makeClient();
    const { result } = renderHook(() => useInboxFilterPresets(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.presets).toHaveLength(1));

    await act(async () => {
      await expect(result.current.savePreset({ name: 'promoções', filters: conteudo() })).rejects.toThrow(
        /Já existe um filtro/
      );
    });

    expect(harness.rows).toHaveLength(1);
  });

  it('NÃO trata % como curinga: "Promo 50%" não conflita com "Promo 50x"', async () => {
    harness.rows = [presetRow(1, 'Promo 50x')];
    const qc = makeClient();
    const { result } = renderHook(() => useInboxFilterPresets(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.presets).toHaveLength(1));

    await act(async () => {
      await result.current.savePreset({ name: 'Promo 50%', filters: conteudo('q1') });
    });

    await waitFor(() => expect(result.current.presets).toHaveLength(2));
    expect(result.current.presets.map((p) => p.name)).toContain('Promo 50%');
  });

  it('exclusão não ressuscita: a lista volta do servidor sem o preset apagado', async () => {
    harness.rows = [presetRow(1, 'Fica'), presetRow(2, 'Sai')];
    const qc = makeClient();
    const { result } = renderHook(() => useInboxFilterPresets(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.presets).toHaveLength(2));

    await act(async () => {
      await result.current.deletePreset('p2');
    });

    await waitFor(() => expect(result.current.presets.map((p) => p.name)).toEqual(['Fica']));
    // A fonte é o servidor: nada foi re-inserido no cache local.
    expect(harness.rows.map((r) => r.name)).toEqual(['Fica']);
  });

  it('erro na exclusão devolve a lista anterior e avisa', async () => {
    harness.rows = [presetRow(1, 'Fica'), presetRow(2, 'Sai')];
    const qc = makeClient();
    const { result } = renderHook(() => useInboxFilterPresets(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.presets).toHaveLength(2));

    harness.deleteError = { message: 'permissão negada' };
    await act(async () => {
      await expect(result.current.deletePreset('p2')).rejects.toBeTruthy();
    });

    await waitFor(() =>
      expect(result.current.presets.map((p) => p.name).sort()).toEqual(['Fica', 'Sai'])
    );
    expect(toast.error).toHaveBeenCalled();
  });

  it('erro na gravação reverte o otimista e avisa', async () => {
    const qc = makeClient();
    const { result } = renderHook(() => useInboxFilterPresets(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.presets).toHaveLength(0);

    harness.insertError = { message: 'falha no banco' };
    await act(async () => {
      await expect(result.current.savePreset({ name: 'Novo', filters: conteudo() })).rejects.toBeTruthy();
    });

    await waitFor(() => expect(result.current.presets).toHaveLength(0));
    expect(toast.error).toHaveBeenCalled();
  });

  it('limpa o cache de presets no logout', async () => {
    harness.rows = [presetRow(1, 'Meu preset')];
    const qc = makeClient();
    renderHook(() => useInboxFilterPresets(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(qc.getQueryData(INBOX_FILTER_PRESETS_QUERY_KEY)).toBeDefined());

    await act(async () => {
      harness.authCallbacks.forEach((cb) => cb('SIGNED_OUT'));
    });

    expect(qc.getQueryData(INBOX_FILTER_PRESETS_QUERY_KEY)).toBeUndefined();
  });
});
