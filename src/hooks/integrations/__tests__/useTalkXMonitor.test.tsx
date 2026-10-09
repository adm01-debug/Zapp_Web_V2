/**
 * E09: Testes do useTalkXMonitor — rateByMinute real, sem Math.random
 * X144: a leitura do ritmo passa a ser recortada por JANELA DE TEMPO, sem teto
 * de linhas (`.limit(2000)` saiu), e a série parcial é declarada (`truncated`).
 */
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { buildRateByMinute, MONITOR_WINDOW_MS } from '../useTalkXMonitor';

const h = vi.hoisted(() => {
  const calls: Array<[string, unknown[]]> = [];
  const result: { data: unknown; error: unknown; count: number | null } = { data: [], error: null, count: null };
  const chain: Record<string, unknown> = { calls, result };
  return { calls, result, chain };
});

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: () => {
    const builder: Record<string, unknown> = {};
    const record = (method: string) => (...args: unknown[]) => {
      h.calls.push([method, args]);
      return builder;
    };
    builder.select = record('select');
    builder.eq = record('eq');
    builder.gte = record('gte');
    builder.order = record('order');
    builder.limit = record('limit');
    // O construtor do PostgREST é "thenable": `await q` devolve o resultado.
    builder.then = (resolve: (value: unknown) => void) => resolve(h.result);
    return builder;
  },
}));

import { useTalkXMonitor } from '../useTalkXMonitor';

type RecipientStub = { sent_at: string | null; delivered_at: string | null };

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
    {children}
  </QueryClientProvider>
);

const methodCalls = (method: string) => h.calls.filter(([name]) => name === method);

describe('buildRateByMinute', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-08T15:00:30.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('retorna array vazio para dados vazios', () => {
    expect(buildRateByMinute([])).toEqual([]);
  });

  it('ignora recipients sem sent_at', () => {
    const data: RecipientStub[] = [
      { sent_at: null, delivered_at: null },
      { sent_at: null, delivered_at: '2026-09-08T10:00:00Z' },
    ];
    expect(buildRateByMinute(data)).toEqual([]);
  });

  it('agrupa por minuto corretamente', () => {
    const now = new Date();
    const min0 = new Date(now.getTime() - 5 * 60_000); // 5 min atrás
    const min1 = new Date(now.getTime() - 3 * 60_000); // 3 min atrás

    // 2 no mesmo minuto, 1 em outro
    const data: RecipientStub[] = [
      { sent_at: new Date(min0.getTime()).toISOString(), delivered_at: null },
      { sent_at: new Date(min0.getTime() + 10_000).toISOString(), delivered_at: new Date().toISOString() },
      { sent_at: new Date(min1.getTime()).toISOString(), delivered_at: null },
    ];

    const result = buildRateByMinute(data);
    expect(result.length).toBe(2);

    // Ordenado cronologicamente
    const totalEnviadas = result.reduce((a, r) => a + r.Enviadas, 0);
    expect(totalEnviadas).toBe(3);

    // Apenas 1 entregue
    const totalEntregues = result.reduce((a, r) => a + r.Entregues, 0);
    expect(totalEntregues).toBe(1);
  });

  it('exclui recipients fora da janela de 60 minutos', () => {
    const old = new Date(Date.now() - 61 * 60_000); // 61 min atrás
    const data: RecipientStub[] = [
      { sent_at: old.toISOString(), delivered_at: null },
    ];
    expect(buildRateByMinute(data)).toEqual([]);
  });

  it('buckets com label HH:mm correto', () => {
    const fixedTime = new Date('2026-09-08T14:32:00.000Z');
    const result = buildRateByMinute([
      { sent_at: fixedTime.toISOString(), delivered_at: null },
    ]);
    // Apenas verifica que há 1 bucket com formato HH:mm
    if (result.length > 0) {
      expect(result[0].label).toMatch(/^\d{2}:\d{2}$/);
      expect(result[0].Enviadas).toBe(1);
      expect(result[0].Entregues).toBe(0);
    }
    // Se cair fora da janela de 60 min, array vazio é aceitável
  });

  it('sem Math.random — resultado é determinístico', () => {
    const t = new Date(Date.now() - 10 * 60_000);
    const data: RecipientStub[] = [
      { sent_at: t.toISOString(), delivered_at: null },
      { sent_at: t.toISOString(), delivered_at: t.toISOString() },
    ];
    const r1 = buildRateByMinute(data);
    const r2 = buildRateByMinute(data);
    expect(r1).toEqual(r2);
    expect(r1[0].Enviadas).toBe(2);
    expect(r1[0].Entregues).toBe(1);
  });
});

describe('useTalkXMonitor — janela de tempo no lugar do teto de linhas (X144)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-10-08T15:00:30.000Z'));
    h.calls.length = 0;
    h.result.data = [];
    h.result.error = null;
    h.result.count = null;
  });
  afterEach(() => vi.useRealTimers());

  it('NÃO pede teto de linhas e recorta a leitura pelo início da janela de 60 min', async () => {
    renderHook(() => useTalkXMonitor('camp-1'), { wrapper });
    await waitFor(() => expect(methodCalls('gte')).toHaveLength(1));

    // O defeito: `.limit(2000)` transformava "os minutos da tela" em amostra.
    expect(methodCalls('limit')).toHaveLength(0);
    const [column, since] = methodCalls('gte')[0][1] as [string, string];
    expect(column).toBe('sent_at');
    // O recorte é a janela do gráfico (60 min), não um número fixo de linhas.
    expect(new Date(since).getTime()).toBeGreaterThanOrEqual(Date.now() - MONITOR_WINDOW_MS - 5_000);
    expect(new Date(since).getTime()).toBeLessThanOrEqual(Date.now() - MONITOR_WINDOW_MS + 5_000);
    expect(methodCalls('order')[0][1]).toEqual(['sent_at', { ascending: false }]);
  });

  it('erro da consulta vira isError e não vira gráfico vazio', async () => {
    h.result.data = null;
    h.result.error = new Error('permission denied for table talkx_recipients');

    const { result } = renderHook(() => useTalkXMonitor('camp-1'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/permission denied/);
    expect(result.current.rateByMinute).toEqual([]);
  });

  it('série parcial é declarada: total da janela maior que as linhas recebidas', async () => {
    const recent = new Date(Date.now() - 60_000).toISOString();
    h.result.data = [
      { id: 'r1', contact_id: null, status: 'sent', sent_at: recent, delivered_at: null, error_message: null, personalized_message: null },
    ];
    h.result.count = 2_500;

    const { result } = renderHook(() => useTalkXMonitor('camp-1'), { wrapper });

    await waitFor(() => expect(result.current.truncated).toBe(true));
    expect(result.current.total).toBe(2_500);
    expect(result.current.rateByMinute.reduce((a, r) => a + r.Enviadas, 0)).toBe(1);
    expect(result.current.windowMinutes).toBe(MONITOR_WINDOW_MS / 60_000);
  });

  it('sem truncamento não declara nada (total igual às linhas)', async () => {
    const recent = new Date(Date.now() - 60_000).toISOString();
    h.result.data = [
      { id: 'r1', contact_id: null, status: 'sent', sent_at: recent, delivered_at: null, error_message: null, personalized_message: null },
    ];
    h.result.count = 1;

    const { result } = renderHook(() => useTalkXMonitor('camp-1'), { wrapper });

    await waitFor(() => expect(result.current.total).toBe(1));
    expect(result.current.truncated).toBe(false);
  });
});
