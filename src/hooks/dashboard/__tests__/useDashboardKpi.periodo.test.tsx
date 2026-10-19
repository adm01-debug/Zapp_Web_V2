import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Prova o contrato do cartão no FRONT: o período escolhido no filtro do topo
// chega à RPC dashboard_kpi como p_from/p_until (janela [from, until), fim
// exclusivo) — antes o hook mandava só p_since com janelas fixas em hoje/ontem
// (E34) e o período era ignorado. A RPC devolve, para `resolvedYesterday` e
// `answeredYesterdayCount`, o período anterior de MESMO TAMANHO, que é o que o
// guard de amostra mínima usa para o delta.
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

import { useDashboardKpi } from '../useDashboardKpi';

const payload = {
  resolvedToday: 10,
  resolvedYesterday: 8,
  resolvedHourly8: [0, 0, 0, 0, 0, 0, 0, 0],
  avgResponseToday: 100,
  avgResponseYesterday: 120,
  p90ResponseToday: 150,
  responseHourly8: [0, 0, 0, 0, 0, 0, 0, 0],
  slaBreachedToday: 0,
  answeredTodayCount: 6,
  answeredYesterdayCount: 7,
};

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: payload, error: null });
});

describe('useDashboardKpi — período escolhido (E34)', () => {
  it('manda p_from e p_until junto de fila e agente', async () => {
    const from = new Date('2026-10-06T03:00:00.000Z');
    const until = new Date('2026-10-13T02:59:59.999Z');

    const { result } = renderHook(() => useDashboardKpi({ from, until, queueId: 'q1', agentId: 'a1' }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpc).toHaveBeenCalledWith('dashboard_kpi', {
      p_from: '2026-10-06T03:00:00.000Z',
      p_until: '2026-10-13T02:59:59.999Z',
      p_queue: 'q1',
      p_agent: 'a1',
    });
  });

  it('sem período, manda todos os parâmetros como undefined (a RPC cai no dia atual em America/Sao_Paulo)', async () => {
    const { result } = renderHook(() => useDashboardKpi(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpc).toHaveBeenCalledWith('dashboard_kpi', {
      p_from: undefined,
      p_until: undefined,
      p_queue: undefined,
      p_agent: undefined,
    });
  });

  it('calcula o delta contra o período anterior devolvido pela RPC (amostra >= 5)', async () => {
    const { result } = renderHook(() => useDashboardKpi({ from: new Date('2026-10-06T03:00:00.000Z'), until: new Date('2026-10-13T02:59:59.999Z') }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // resolvedToday 10 x resolvedYesterday 8 (período anterior de mesmo tamanho)
    expect(result.current.data?.deltaResolvedPct).toBe(25);
    // avgResponse 100 x 120, com 6 e 7 respondidas (>= 5)
    expect(result.current.data?.deltaResponsePct).toBe(-17);
  });

  it('trocar o período muda a chave e refaz a consulta (período novo não reaproveita cache)', async () => {
    const from = new Date('2026-10-06T03:00:00.000Z');
    const { rerender } = renderHook(({ u }: { u: Date }) => useDashboardKpi({ from, until: u }), {
      wrapper,
      initialProps: { u: new Date('2026-10-13T02:59:59.999Z') },
    });

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    rerender({ u: new Date('2026-10-31T02:59:59.999Z') });

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    expect(rpc.mock.calls[0][1].p_until).toBe('2026-10-13T02:59:59.999Z');
    expect(rpc.mock.calls[1][1].p_until).toBe('2026-10-31T02:59:59.999Z');
  });

  it('erro da RPC vira erro da query (não é engolido nem vira zero)', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('rpc dashboard_kpi falhou') });

    const { result } = renderHook(() => useDashboardKpi({ from: new Date('2026-10-06T03:00:00.000Z'), until: new Date('2026-10-13T02:59:59.999Z') }), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });
});
