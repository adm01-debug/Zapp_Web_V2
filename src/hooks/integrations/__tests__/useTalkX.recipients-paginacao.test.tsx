import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * HZ2-012 — destinatários da campanha acima do teto do PostgREST.
 *
 * A consulta de `talkx_recipients` não pedia fatia (`.range()`): o PostgREST
 * corta a resposta no teto de linhas do projeto (1000) SEM erro e SEM aviso, e
 * a tela mostrava uma campanha com 1500 destinatários como se tivesse 1000.
 *
 * Prova: com 1500 linhas no servidor emulado (que respeita o teto de 1000 por
 * resposta), o hook entrega as 1500 — em duas fatias, sem repetir nem perder
 * linha. Vermelho antes do fix: a primeira resposta (1000) era a lista inteira.
 */

const CAP = 1000;
const ROWS = 1500;

const h = vi.hoisted(() => {
  const state = {
    rows: [] as Array<Record<string, unknown>>,
    ranges: [] as Array<[number, number]>,
  };
  const chain = (): Record<string, unknown> => {
    const self: Record<string, unknown> = {};
    // Sem `.range()` o PostgREST devolve só o teto (e sem avisar) — é o defeito.
    let pediuFatia = false;
    self.select = () => self;
    self.eq = () => self;
    self.order = () => self;
    self.range = (from: number, to: number) => {
      pediuFatia = true;
      state.ranges.push([from, to]);
      return Promise.resolve({
        data: state.rows.slice(from, Math.min(to + 1, from + CAP, state.rows.length)),
        error: null,
      });
    };
    self.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve({ data: pediuFatia ? state.rows : state.rows.slice(0, CAP), error: null }).then(res, rej);
    return self;
  };
  const channel = { on: () => channel, subscribe: () => channel };
  const supabase = {
    from: () => chain(),
    channel: () => channel,
    removeChannel: () => Promise.resolve('ok'),
    auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
  };
  return { state, supabase };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: h.supabase }));

vi.mock('@/lib/supabaseHelpers', () => {
  const self: Record<string, unknown> = {};
  const same = () => self;
  self.select = same;
  self.eq = same;
  self.in = same;
  self.is = same;
  self.not = same;
  self.order = same;
  self.limit = same;
  self.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
  return { fromTable: () => self };
});

import { useTalkX } from '../useTalkX';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe('useTalkX — destinatários acima do teto do PostgREST (HZ2-012)', () => {
  beforeEach(() => {
    h.state.ranges.length = 0;
    h.state.rows = Array.from({ length: ROWS }, (_, i) => ({
      id: `r-${i}`,
      campaign_id: 'camp-1',
      contact_id: null,
      status: 'pending',
      created_at: new Date(Date.UTC(2026, 8, 1) + i * 1000).toISOString(),
    }));
  });

  it('entrega os 1500 destinatários em duas fatias, não só os 1000 da primeira resposta', async () => {
    const { result } = renderHook(() => useTalkX(), { wrapper });

    act(() => {
      result.current.setSelectedCampaignId('camp-1');
    });

    await waitFor(() => expect(result.current.recipients).toHaveLength(ROWS));

    const ids = new Set(result.current.recipients.map((r) => r.id));
    expect(ids.size).toBe(ROWS);
    expect(h.state.ranges).toEqual([
      [0, CAP - 1],
      [CAP, CAP * 2 - 1],
    ]);
  });
});
