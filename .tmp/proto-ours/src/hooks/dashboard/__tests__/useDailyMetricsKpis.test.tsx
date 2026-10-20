import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// A RPC vem do supabase e o papel de staff vem de useCRMAdminAccess; os dois
// mockados para o teste chamar o hook REAL (não uma cópia da lógica).
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

const { useCRMAdminAccess } = vi.hoisted(() => ({ useCRMAdminAccess: vi.fn() }));
vi.mock('@/hooks/crm/useCRMAdminAccess', () => ({ useCRMAdminAccess }));

import { normalizeDailyMetricRows, useDailyMetricsKpis } from '../useDailyMetricsKpis';

function wrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

// O PostgREST devolve `numeric` como STRING (evita perda de precisão) e as contagens
// como número; a mediana nula (dia sem amostra de SLA) chega como null. É o shape
// real de uma linha da RPC dashboard_daily_series.
const rawRow = (over: Record<string, unknown> = {}) => ({
  metric_date: '2026-06-15',
  messages_received: 41,
  messages_sent: 38,
  new_contacts: 3,
  conversations_opened: 5,
  conversations_resolved: 4,
  active_contacts: 12,
  median_response_time_seconds: '105',
  ...over,
});

describe('normalizeDailyMetricRows', () => {
  it('converte numeric em string (mediana) para número e mantém null quando não há amostra', () => {
    const rows = normalizeDailyMetricRows([
      rawRow({ median_response_time_seconds: '105' }),
      rawRow({ metric_date: '2026-06-16', median_response_time_seconds: null }),
    ]);
    expect(rows[0].median_response_time_seconds).toBe(105);
    expect(typeof rows[0].median_response_time_seconds).toBe('number');
    expect(rows[1].median_response_time_seconds).toBeNull();
  });

  it('ordena por metric_date em ordem crescente, mesmo se a RPC devolver fora de ordem', () => {
    const rows = normalizeDailyMetricRows([
      rawRow({ metric_date: '2026-06-17' }),
      rawRow({ metric_date: '2026-06-15' }),
      rawRow({ metric_date: '2026-06-16' }),
    ]);
    expect(rows.map((r) => r.metric_date)).toEqual(['2026-06-15', '2026-06-16', '2026-06-17']);
  });

  it('resposta vazia, nula ou fora do formato (objeto/erro) vira lista vazia, sem lançar', () => {
    expect(normalizeDailyMetricRows(null)).toEqual([]);
    expect(normalizeDailyMetricRows(undefined)).toEqual([]);
    expect(normalizeDailyMetricRows([])).toEqual([]);
    expect(normalizeDailyMetricRows({ message: '42501' })).toEqual([]);
  });

  it('descarta linha sem metric_date e completa contador ausente com 0', () => {
    const rows = normalizeDailyMetricRows([
      { messages_received: 9 },
      rawRow({ metric_date: '2026-06-15', new_contacts: undefined }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].new_contacts).toBe(0);
  });
});

describe('useDailyMetricsKpis', () => {
  beforeEach(() => {
    rpc.mockReset();
    useCRMAdminAccess.mockReset();
  });

  it('para staff, consulta a RPC com p_days do período e devolve a série normalizada', async () => {
    useCRMAdminAccess.mockReturnValue(true);
    rpc.mockResolvedValue({
      data: [rawRow({ metric_date: '2026-06-15' }), rawRow({ metric_date: '2026-06-14' })],
      error: null,
    });
    const { result } = renderHook(() => useDailyMetricsKpis(30), { wrapper: wrapper(newClient()) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpc).toHaveBeenCalledWith('dashboard_daily_series', { p_days: 30 });
    expect(result.current.data?.map((r) => r.metric_date)).toEqual(['2026-06-14', '2026-06-15']);
    expect(result.current.isStaff).toBe(true);
  });

  it('sem staff (false), a consulta nem sai do navegador', async () => {
    useCRMAdminAccess.mockReturnValue(false);
    const { result } = renderHook(() => useDailyMetricsKpis(), { wrapper: wrapper(newClient()) });

    // dá tempo de um fetch indevido acontecer, se houvesse
    await waitFor(() => expect(result.current.isStaff).toBe(false));
    expect(rpc).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  it('papel ainda não conferido (null) também não consulta', async () => {
    useCRMAdminAccess.mockReturnValue(null);
    const { result } = renderHook(() => useDailyMetricsKpis(), { wrapper: wrapper(newClient()) });

    await waitFor(() => expect(result.current.isStaff).toBeNull());
    expect(rpc).not.toHaveBeenCalled();
  });

  it('trocar o período refaz a consulta (o cache de 7 dias não serve para 90)', async () => {
    useCRMAdminAccess.mockReturnValue(true);
    rpc.mockResolvedValue({ data: [], error: null });
    const { rerender } = renderHook(({ days }) => useDailyMetricsKpis(days), {
      wrapper: wrapper(newClient()),
      initialProps: { days: 7 },
    });

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('dashboard_daily_series', { p_days: 7 }));

    rerender({ days: 90 });

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('dashboard_daily_series', { p_days: 90 }));
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('erro da RPC (ex.: 42501 de não-staff) vira isError, não série vazia silenciosa', async () => {
    useCRMAdminAccess.mockReturnValue(true);
    rpc.mockResolvedValue({ data: null, error: { message: 'dashboard_daily_series_requires_staff' } });
    const { result } = renderHook(() => useDailyMetricsKpis(), { wrapper: wrapper(newClient()) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
