import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * R2-MOD-033 — janela e ritmo do histórico da aba "Resultados" (item #135).
 *
 * O defeito medido na auditoria: a série de envios era lida em ordem CRESCENTE com
 * teto de 2000 (os PRIMEIROS envios), agrupava só os minutos que tiveram evento e o
 * "ritmo médio dos últimos 10 min" dividia pelos grupos esparsos. Resultado: o envio
 * 2001+ não entrava na série e dez minutos sem envio ainda produziam prazo otimista.
 *
 * Aceite coberto aqui (o que faltava de prova):
 *  1. "Envio 2001 e posteriores alteram a série recente" — a consulta pede os envios
 *     MAIS RECENTES (`sent_at` decrescente, teto 2000), não os primeiros.
 *  2. "Dez minutos sem envio resultam em ritmo zero/indisponível, sem previsão
 *     otimista" — com envios só fora da janela dos últimos 10 minutos o prazo sai
 *     INDISPONÍVEL, nunca um número.
 *
 * Arquivo próprio porque mocka o hook `useTalkX` e captura a cadeia do PostgREST
 * (mesmo padrão de `TalkXCampaignRunning.states.test.tsx`).
 */

const { state, captured } = vi.hoisted(() => {
  const campaign = {
    id: 'c1',
    name: 'Campanha Teste',
    message_template: 'Olá {{nome}}',
    variables_config: [],
    typing_delay_min: 1500,
    typing_delay_max: 4000,
    send_interval_min: 8000,
    send_interval_max: 20000,
    status: 'sending',
    total_recipients: 10,
    sent_count: 5,
    failed_count: 0,
    delivered_count: 5,
    read_count: 1,
    replied_count: 0,
    outcome_unknown_count: 0,
    whatsapp_connection_id: null,
    created_by: null,
    started_at: '2026-10-05T12:00:00.000Z',
    completed_at: null,
    created_at: '2026-10-05T10:00:00.000Z',
    updated_at: '2026-10-05T12:00:00.000Z',
    media_url: null,
    media_type: null,
    scheduled_at: null,
    speed_profile: 'moderate',
    send_window_start: null,
    send_window_end: null,
    business_hours_only: false,
    revision: 1,
  };
  return {
    state: {
      campaignList: [campaign] as unknown[],
      // Resposta por `limit(n)`: 2000 = histórico de envios.
      rows: {} as Record<number, { data: unknown; error: null }>,
    },
    // O que o componente PEDE ao servidor: colunas/window do `order` e os `limit`.
    captured: { orders: [] as Array<[string, unknown]>, limits: [] as number[] },
  };
});

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: state.campaignList,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetchCampaigns: vi.fn(),
    updateCampaign: { mutateAsync: vi.fn() },
    updateCampaignLimits: { mutateAsync: vi.fn() },
    pauseCampaign: vi.fn(),
    cancelCampaign: vi.fn(),
    startCampaign: vi.fn(),
  }),
}));

vi.mock('recharts', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const SvgBox = ({ children }: { children?: React.ReactNode }) => <svg>{children}</svg>;
  return {
    AreaChart: SvgBox,
    Area: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    ResponsiveContainer: Box,
  };
});

vi.mock('@/components/dashboard/overview/DashboardKpiCard', () => ({
  DashboardKpiCard: () => <div data-testid="kpi-card" />,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

// Cadeia thenable: registra `order`/`limit` e responde pela chave do `limit`.
const chain = (limitKey: number): Record<string, unknown> => ({
  select: () => chain(limitKey),
  eq: () => chain(limitKey),
  order: (col: string, opts?: unknown) => {
    captured.orders.push([col, opts]);
    return chain(limitKey);
  },
  not: () => chain(limitKey),
  limit: (n: number) => {
    captured.limits.push(n);
    return chain(n);
  },
  single: () => Promise.resolve({ data: null, error: null }),
  then: (resolve: (value: unknown) => void) => resolve(state.rows[limitKey] ?? { data: [], error: null }),
});

vi.mock('@/lib/supabaseHelpers', () => {
  const realtimeChannel = () => {
    const channel = { on: () => channel, subscribe: () => channel };
    return channel;
  };
  return {
    fromTable: () => chain(-1),
    supabase: {
      from: () => chain(-1),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      channel: realtimeChannel,
      removeChannel: vi.fn(),
    },
    invokeEdge: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
});

import { TalkXCampaignRunning } from '@/components/talkx/TalkXCampaignRunning';

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TalkXCampaignRunning onBack={() => {}} onViewMonitor={() => {}} />
    </QueryClientProvider>,
  );
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

describe('janela e ritmo do histórico — TalkXCampaignRunning / Resultados (R2-MOD-033)', () => {
  beforeEach(() => {
    state.campaignList = state.campaignList.length ? state.campaignList : [];
    state.rows = { 2000: { data: [], error: null } };
    captured.orders = [];
    captured.limits = [];
  });

  it('pede os envios MAIS RECENTES (sent_at decrescente, teto 2000) — o envio 2001+ entra na série', async () => {
    state.rows[2000] = { data: [{ sent_at: new Date().toISOString(), delivered_at: null }], error: null };

    renderView();

    await waitFor(() => expect(captured.limits).toContain(2000));
    const porSentAt = captured.orders.filter(([col]) => col === 'sent_at');
    expect(porSentAt.length).toBeGreaterThan(0);
    for (const [, opts] of porSentAt) {
      expect(opts).toEqual({ ascending: false });
    }
  });

  it('dez minutos sem envio: ritmo zero e prazo INDISPONÍVEL, sem previsão otimista', async () => {
    // Dois minutos com envio, ambos FORA da janela dos últimos 10 minutos.
    state.rows[2000] = {
      data: [
        { sent_at: minutesAgo(45), delivered_at: null },
        { sent_at: minutesAgo(46), delivered_at: null },
      ],
      error: null,
    };

    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Resultados' }));

    expect(await screen.findByText('Tempo estimado para concluir')).toBeTruthy();
    expect(screen.getByText('0 msgs/min')).toBeTruthy();
    expect(screen.getByText('Indisponível')).toBeTruthy();
    expect(screen.queryByText(/^Baseado no ritmo atual/)).toBeNull();
  });

  it('envios no minuto atual: ritmo medido sobre 10 minutos consecutivos e prazo calculado', async () => {
    const agora = new Date();
    state.rows[2000] = {
      data: Array.from({ length: 20 }, () => ({ sent_at: agora.toISOString(), delivered_at: null })),
      error: null,
    };

    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Resultados' }));

    expect(await screen.findByText('Tempo estimado para concluir')).toBeTruthy();
    // 20 envios num minuto / janela de 10 minutos = 2 msgs/min (não 20); 5 pendentes / 2 = 3 min.
    expect(screen.getByText('2 msgs/min')).toBeTruthy();
    expect(screen.getByText('Baseado no ritmo atual (2 msgs/min)')).toBeTruthy();
    expect(screen.getByText('3 min')).toBeTruthy();
  });
});
