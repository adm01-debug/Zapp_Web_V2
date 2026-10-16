/**
 * TL-162 (X159) — fio do "Checklist para retomar" na tela que hoje mostra a
 * campanha pausada (TalkXCampaignRunning, aba "Visão Geral").
 *
 * O cartão pede o checklist da campanha pausada; a tela própria da tela 13
 * (`TalkXCampaignPaused.tsx`, X156) ainda não existe nesta base, então o bloco
 * entra onde a pausa é exibida hoje — e SÓ na pausa: campanha em envio não monta
 * checklist nenhum.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const campaign = {
    id: 'c1',
    name: 'Campanha Teste',
    message_template: 'Olá {{nome}}',
    variables_config: [],
    typing_delay_min: 1500,
    typing_delay_max: 4000,
    send_interval_min: 8000,
    send_interval_max: 20000,
    status: 'paused',
    total_recipients: 10,
    sent_count: 5,
    failed_count: 0,
    delivered_count: 5,
    read_count: 1,
    replied_count: 0,
    outcome_unknown_count: 0,
    whatsapp_connection_id: 'conn-1',
    created_by: null,
    started_at: '2026-10-09T01:00:00.000Z',
    completed_at: null,
    created_at: '2026-10-09T00:30:00.000Z',
    updated_at: '2026-10-09T01:00:00.000Z',
    media_url: null,
    media_type: null,
    scheduled_at: null,
    template_id: 'tpl-1',
    paused_at: '2026-10-09T01:00:00.000Z',
    speed_profile: 'moderate',
    send_window_start: null,
    send_window_end: null,
    business_hours_only: false,
    revision: 1,
  };
  const state = {
    status: 'paused' as string,
    campaign,
    rows: {} as Record<string, { data?: unknown; count?: number | null; error?: unknown }>,
  };
  const chainFor = (table: string): Record<string, unknown> => {
    const q: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'gte', 'not', 'order', 'limit', 'single', 'maybeSingle']) {
      q[method] = () => q;
    }
    q.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve(state.rows[table] ?? { data: [], count: null, error: null }).then(resolve);
    return q;
  };
  return { state, chainFor };
});

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: [{ ...h.state.campaign, status: h.state.status }],
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
    setSelectedCampaignId: vi.fn(),
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

vi.mock('@/lib/supabaseHelpers', () => {
  const channel = { on: () => channel, subscribe: () => channel };
  return {
    fromTable: (table: string) => h.chainFor(table),
    supabase: {
      from: () => h.chainFor(''),
      rpc: () => Promise.resolve({ data: false, error: null }),
      channel: () => channel,
      removeChannel: vi.fn(),
    },
    invokeEdge: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
});

import { TalkXCampaignRunning } from '@/components/talkx/TalkXCampaignRunning';

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TalkXCampaignRunning onBack={vi.fn()} onViewMonitor={vi.fn()} initialCampaignId="c1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.state.status = 'paused';
  h.state.rows = {
    talkx_campaign_segments: { data: [{ status: 'pending' }], error: null },
    talkx_templates: { data: { status: 'approved' }, error: null },
    whatsapp_connections: { data: { status: 'connected' }, error: null },
    talkx_settings: { data: { value: '"Pare para sair"' }, error: null },
    talkx_optout_keywords: { data: null, count: 2, error: null },
    talkx_campaign_events: { data: [], error: null },
  };
});

describe('TalkXCampaignRunning — checklist na campanha pausada (X159)', () => {
  it('campanha pausada mostra o "Checklist para retomar" na Visão Geral', async () => {
    renderScreen();
    expect(await screen.findByText('Checklist para retomar')).toBeInTheDocument();
    expect(await screen.findByText('1 segmento pendente')).toBeInTheDocument();
  });

  it('campanha em envio não mostra o checklist', async () => {
    h.state.status = 'sending';
    renderScreen();
    // A tela monta: o título da campanha aparece e o checklist não.
    expect(await screen.findByText(/Campanha Teste/)).toBeInTheDocument();
    expect(screen.queryByText('Checklist para retomar')).toBeNull();
  });

  it('o atalho do item leva à aba onde ele se resolve', async () => {
    renderScreen();
    const atalho = await screen.findByRole('button', { name: /Ver limites/ });
    fireEvent.click(atalho);
    expect(await screen.findByText('Configurações da Campanha')).toBeInTheDocument();
  });
});
