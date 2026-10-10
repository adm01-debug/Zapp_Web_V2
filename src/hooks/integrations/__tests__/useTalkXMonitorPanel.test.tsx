/**
 * X144 — o painel do monitor sai da RPC, e erro da RPC NÃO vira painel zerado.
 *
 * Aceite da etapa (F11-acompanhar-campanha.md, X144): "erro da RPC vira `isError`".
 * Antes, sem RPC nenhuma, a conta era feita no navegador sobre até 2.000 linhas
 * baixadas: número errado com cara de certo (sem zero nos minutos vazios).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const rpcMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: rpcMock } }));

import { useTalkXMonitorPanel, monitorPanelFromServer } from '../useTalkXMonitorPanel';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
    {children}
  </QueryClientProvider>
);

beforeEach(() => {
  rpcMock.mockReset();
});

describe('useTalkXMonitorPanel — painel do servidor (X144/X140)', () => {
  it('erro da RPC vira isError com a mensagem do servidor (nunca painel vazio)', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'function public.talkx_monitor_panel(uuid, integer, text, date, uuid) does not exist' },
    });

    const { result } = renderHook(() => useTalkXMonitorPanel({ campaignId: 'camp-1' }), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/does not exist/);
    // Sem dado do servidor, nada de KPI fabricado na tela.
    expect(result.current.panel).toBeNull();
    expect(result.current.series).toEqual([]);
    expect(result.current.health.worker_state).toBeNull();
  });

  it('resposta da RPC alimenta série, saúde e comparativos', async () => {
    rpcMock.mockResolvedValue({
      data: {
        kpis: { enviadas: 120, entregues: 110 },
        vs_yesterday: { respondidas: 3 },
        series: [
          { bucket: '2026-10-08T10:00:00Z', sent: 10, delivered: 8, replied: 1 },
          { bucket: '2026-10-08T10:01:00Z', sent: 0, delivered: 0, replied: 0 },
        ],
        health: {
          worker_state: 'stalled',
          last_activity_at: '2026-10-08T09:40:00Z',
          rate_per_minute: 0,
          recommendation_code: 'stalled',
        },
      },
      error: null,
    });

    const { result } = renderHook(
      () => useTalkXMonitorPanel({ campaignId: 'camp-1', windowMinutes: 15, segmentId: 'seg-1' }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.series).toHaveLength(2));
    expect(result.current.health.worker_state).toBe('stalled');
    expect(result.current.health.rate_per_minute).toBe(0);
    expect(result.current.kpis).toEqual({ enviadas: 120, entregues: 110 });
    expect(result.current.vsYesterday).toEqual({ respondidas: 3 });
    expect(rpcMock).toHaveBeenCalledWith('talkx_monitor_panel', expect.objectContaining({
      p_campaign_id: 'camp-1',
      p_window_minutes: 15,
      p_bucket: 'minute',
      p_segment_id: 'seg-1',
    }));
  });

  it('sem campanha não chama a RPC (nem pisca erro)', () => {
    const { result } = renderHook(() => useTalkXMonitorPanel({ campaignId: null }), { wrapper });

    expect(rpcMock).not.toHaveBeenCalled();
    expect(result.current.isError).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('a mesma janela não vira consulta nova quando só o objeto muda', async () => {
    rpcMock.mockResolvedValue({ data: { series: [], kpis: {} }, error: null });
    const { rerender } = renderHook(({ day }: { day: string }) => useTalkXMonitorPanel({ campaignId: 'camp-1', day }), {
      wrapper,
      initialProps: { day: '2026-10-08' },
    });
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));

    rerender({ day: '2026-10-08' });
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});

describe('monitorPanelFromServer', () => {
  it('resposta inesperada não quebra a tela', () => {
    expect(monitorPanelFromServer(null).series).toEqual([]);
    expect(monitorPanelFromServer('nao-e-jsonb').health.worker_state).toBeNull();
    expect(monitorPanelFromServer({ series: [null, 'x', { bucket: 'a' }] }).series).toEqual([{ bucket: 'a' }]);
  });
});
