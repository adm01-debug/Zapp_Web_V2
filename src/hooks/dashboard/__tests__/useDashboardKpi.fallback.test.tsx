import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// A migration da assinatura nova só chega à produção depois do front (Vercel é automática,
// db-migrate é com aprovação humana). Enquanto não chega, o PostgREST responde PGRST202 e o
// hook precisa cair na assinatura antiga (p_since) — sem quebrar o card do Dashboard.
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

import { useDashboardKpi } from '../useDashboardKpi';

const payload = {
  resolvedToday: 3, resolvedYesterday: 2, resolvedHourly8: [0, 0, 0, 0, 0, 0, 0, 0],
  avgResponseToday: 10, avgResponseYesterday: 12, p90ResponseToday: 20,
  responseHourly8: [0, 0, 0, 0, 0, 0, 0, 0], slaBreachedToday: 0,
  answeredTodayCount: 1, answeredYesterdayCount: 1,
};

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => rpc.mockReset());

describe('useDashboardKpi — migration do período ainda não aplicada', () => {
  it('PGRST202 na assinatura nova cai na antiga (p_since) e o card funciona', async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.dashboard_kpi(p_agent, p_from, p_queue, p_until)' } })
      .mockResolvedValueOnce({ data: payload, error: null });
    const from = new Date('2026-10-06T03:00:00.000Z');

    const { result } = renderHook(() => useDashboardKpi({ from, queueId: 'q1' }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpc).toHaveBeenNthCalledWith(1, 'dashboard_kpi', { p_from: '2026-10-06T03:00:00.000Z', p_until: null, p_queue: 'q1', p_agent: null });
    expect(rpc).toHaveBeenNthCalledWith(2, 'dashboard_kpi', { p_since: '2026-10-06T03:00:00.000Z', p_queue: 'q1', p_agent: undefined });
    expect(result.current.data?.resolvedToday).toBe(3);
  });

  it('outro erro da assinatura nova (ex.: permissão) NÃO é engolido nem mascarado pelo fallback', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied for function dashboard_kpi' } });

    const { result } = renderHook(() => useDashboardKpi(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
