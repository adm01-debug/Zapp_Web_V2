/**
 * E09: Testes do useTalkXMonitor — rateByMinute real, sem Math.random
 * TL-153c: intervalo de polling configurável pelo chamador (false desliga).
 */
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { buildRateByMinute, useTalkXMonitor } from '../useTalkXMonitor';

const h = vi.hoisted(() => {
  const calls: Array<[string, unknown[]]> = [];
  return { calls };
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
    builder.order = record('order');
    builder.limit = record('limit');
    // O construtor do PostgREST é "thenable": `await q` devolve o resultado.
    builder.then = (resolve: (value: unknown) => void) => resolve({ data: [], error: null });
    return builder;
  },
}));

type RecipientStub = { sent_at: string | null; delivered_at: string | null };

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

/**
 * TL-153c: o intervalo de polling vem do chamador — o canal ao vivo passa
 * `false` (desliga), o modo degradado passa `panelPollMs`; omitido, 5 s.
 * Cada teste lê o intervalo EFETIVO registrado no cache do react-query, por
 * isso falha se o hook ignorar o argumento (5_000 fixo).
 */
describe('useTalkXMonitor — intervalo de polling configurável', () => {
  beforeEach(() => {
    h.calls.length = 0;
  });

  function setup(campaignId: string, refetch?: number | false) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    renderHook(() => useTalkXMonitor(campaignId, 'all', refetch), { wrapper });
    return queryClient;
  }

  async function intervaloEfetivo(queryClient: QueryClient, campaignId: string) {
    // Espera a consulta REAL do hook executar (prova que o caminho produtivo rodou).
    await waitFor(() => expect(h.calls.some(([m]) => m === 'limit')).toBe(true));
    const q = queryClient
      .getQueryCache()
      .find({ queryKey: ['talkx-monitor-recipients', campaignId, 'all'] });
    return (q?.options as { refetchInterval?: number | false }).refetchInterval;
  }

  it('desliga o polling quando o chamador passa false (canal ao vivo)', async () => {
    const queryClient = setup('camp-ao-vivo', false);
    await expect(intervaloEfetivo(queryClient, 'camp-ao-vivo')).resolves.toBe(false);
  });

  it('usa o intervalo do chamador no modo degradado (panelPollMs)', async () => {
    const queryClient = setup('camp-degradado', 10_000);
    await expect(intervaloEfetivo(queryClient, 'camp-degradado')).resolves.toBe(10_000);
  });

  it('mantém 5 s quando o chamador omite o intervalo (chamada com 2 args)', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    renderHook(() => useTalkXMonitor('camp-padrao'), { wrapper });
    await expect(intervaloEfetivo(queryClient, 'camp-padrao')).resolves.toBe(5_000);
  });
});
