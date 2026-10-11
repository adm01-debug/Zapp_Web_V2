/**
 * Refazer 2, Ponto 2 — updateCampaign blindado contra a migration canônica
 * ausente.
 *
 * Sem a migration, o update com recurrence_* falharia e derrubaria junto o
 * agendamento simples (mesma chamada). Prova:
 *   1. backend diz "coluna não existe" → retenta UMA vez sem recurrence_* e resolve;
 *   2. com migration (sem erro) → envia recurrence_* de primeira, sem segunda chamada;
 *   3. colunas gerenciadas pelo servidor (série/próximo/encerramento) nunca saem do front.
 *
 * Rede mockada (fromTable + cliente); o código chamado é o real (renderHook).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mocks = vi.hoisted(() => ({
  fromTable: vi.fn(),
  supabaseFrom: vi.fn(),
}));

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: mocks.fromTable,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mocks.supabaseFrom,
    channel: () => {
      const chan: { on: (...args: unknown[]) => unknown; subscribe: (cb: (s: string) => void) => unknown } = {
        on: (..._args: unknown[]) => chan,
        subscribe: (cb: (s: string) => void) => {
          cb('CLOSED');
          return chan;
        },
      };
      return chan;
    },
    removeChannel: () => {},
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { useTalkX } from '../useTalkX';

type SingleResult = { data: unknown; error: { message: string } | null };

/** Payloads de update capturados, na ordem das tentativas. */
let captured: unknown[];
/** Fila de respostas do `.single()` do update. */
let singleQueue: SingleResult[];

function mockUpdateChain() {
  mocks.fromTable.mockImplementation((_table: string) => ({
    update: (body: unknown) => {
      captured.push(body);
      return {
        eq: () => ({
          select: () => ({
            single: () => Promise.resolve(singleQueue.shift() ?? { data: null, error: null }),
          }),
        }),
      };
    },
  }));
}

function mockCampaignsSelect() {
  mocks.supabaseFrom.mockImplementation(() => {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.order = () => b;
    b.eq = () => b;
    (b as { then: unknown }).then = (res: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(res);
    return b;
  });
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  captured = [];
  singleQueue = [];
  mockUpdateChain();
  mockCampaignsSelect();
});

describe('useTalkX.updateCampaign sem a migration canônica (refazer 2, Ponto 2)', () => {
  it('retenta sem recurrence_* quando o backend diz que a coluna não existe', async () => {
    singleQueue = [
      {
        data: null,
        error: {
          message:
            "Could not find the 'recurrence_frequency' column of 'talkx_campaigns' in the schema cache",
        },
      },
      { data: { id: 'c1', scheduled_at: '2026-10-03T12:00:00Z' }, error: null },
    ];

    const { result } = renderHook(() => useTalkX(), { wrapper });
    const saved = await result.current.updateCampaign.mutateAsync({
      id: 'c1',
      scheduled_at: '2026-10-03T12:00:00Z',
      recurrence_frequency: 'daily',
    } as never);

    expect((saved as { id: string }).id).toBe('c1');
    expect(captured.length).toBe(2);
    expect(captured[0]).toMatchObject({ recurrence_frequency: 'daily' });
    const retry = captured[1] as Record<string, unknown>;
    expect(retry).not.toHaveProperty('recurrence_frequency');
    expect(retry).not.toHaveProperty('recurrence_weekdays');
    expect(retry).not.toHaveProperty('recurrence_end_at');
    expect(retry).toMatchObject({ scheduled_at: '2026-10-03T12:00:00Z' });
  });

  it('com migration aplicada envia recurrence_* de primeira, sem retentativa', async () => {
    singleQueue = [{ data: { id: 'c1' }, error: null }];

    const { result } = renderHook(() => useTalkX(), { wrapper });
    await result.current.updateCampaign.mutateAsync({
      id: 'c1',
      recurrence_frequency: 'weekly',
      recurrence_weekdays: [1, 3],
    } as never);

    expect(captured.length).toBe(1);
    expect(captured[0]).toMatchObject({ recurrence_frequency: 'weekly', recurrence_weekdays: [1, 3] });
  });

  it('nunca envia colunas gerenciadas pelo servidor (série/próximo/encerramento)', async () => {
    singleQueue = [{ data: { id: 'c1' }, error: null }];

    const { result } = renderHook(() => useTalkX(), { wrapper });
    await result.current.updateCampaign.mutateAsync({
      id: 'c1',
      scheduled_at: '2026-10-03T12:00:00Z',
      recurrence_series_id: 's1',
      recurrence_next_campaign_id: 'n1',
      recurrence_closed_at: '2026-10-01T00:00:00Z',
      recurrence_closed_reason: 'series_ended',
    } as never);

    expect(captured.length).toBe(1);
    const sent = captured[0] as Record<string, unknown>;
    expect(sent).not.toHaveProperty('recurrence_series_id');
    expect(sent).not.toHaveProperty('recurrence_next_campaign_id');
    expect(sent).not.toHaveProperty('recurrence_closed_at');
    expect(sent).not.toHaveProperty('recurrence_closed_reason');
    expect(sent).toMatchObject({ scheduled_at: '2026-10-03T12:00:00Z' });
  });

  it('erro que não é de coluna ausente continua lançando (sem retentativa cega)', async () => {
    singleQueue = [{ data: null, error: { message: 'permission denied for table talkx_campaigns' } }];

    const { result } = renderHook(() => useTalkX(), { wrapper });
    await expect(
      result.current.updateCampaign.mutateAsync({ id: 'c1', scheduled_at: 'x' } as never),
    ).rejects.toThrow('permission denied');
    expect(captured.length).toBe(1);
    await waitFor(() => expect(result.current.updateCampaign.isError).toBe(true));
  });
});
