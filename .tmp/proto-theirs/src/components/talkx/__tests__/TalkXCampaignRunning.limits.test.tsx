import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// X006 — prova de fio do modal "Editar Limites" (tela 12):
// digitar "10" no intervalo mínimo deve chamar updateCampaignLimits com
// send_interval_min = 10000 (ms), nunca 10.
//
// Vermelho antes do fix: handleSaveLimits gravava o número digitado sem
// converter (send_interval_min = 10 ms). Verde depois: secondsToMs(10) = 10000.
//
// Fica em arquivo próprio (não em TalkX.test.tsx) porque este mocka o hook
// useTalkX inteiro; TalkX.test.tsx exercita o useTalkX real via renderHook.

const { mutateAsync, mockCampaign } = vi.hoisted(() => ({
  mutateAsync: vi.fn().mockResolvedValue({ campaign_id: 'c1', revision: 2 }),
  mockCampaign: {
    id: 'c1',
    name: 'Campanha Teste',
    message_template: 'Olá {{nome}}',
    variables_config: [],
    typing_delay_min: 1500,
    typing_delay_max: 4000,
    send_interval_min: 8000, // ms — abre como 8 s
    send_interval_max: 20000, // ms — abre como 20 s
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
    started_at: '2026-10-01T12:00:00.000Z',
    completed_at: null,
    created_at: '2026-10-01T10:00:00.000Z',
    updated_at: '2026-10-01T12:00:00.000Z',
    media_url: null,
    media_type: null,
    scheduled_at: null,
    speed_profile: 'moderate',
    send_window_start: null,
    send_window_end: null,
    business_hours_only: false,
    revision: 1,
  },
}));

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: [mockCampaign],
    updateCampaign: { mutateAsync: vi.fn() },
    updateCampaignLimits: { mutateAsync },
    pauseCampaign: vi.fn(),
    cancelCampaign: vi.fn(),
    startCampaign: vi.fn(),
    refetchCampaigns: vi.fn(),
  }),
}));

vi.mock('recharts', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    AreaChart: Box,
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

// Cadeia thenable genérica para `fromTable` (o componente só lê listas via
// .select().eq().order().limit(), todas terminando em `await`).
const queryChain = () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.order = () => chain;
  chain.limit = () => chain;
  chain.single = () => Promise.resolve({ data: null, error: null });
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
  return chain;
};

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: () => queryChain(),
  supabase: {
    from: () => queryChain(),
    rpc: vi.fn().mockResolvedValue({ data: { campaign_id: 'c1', revision: 2 }, error: null }),
  },
  invokeEdge: vi.fn().mockResolvedValue({ data: null, error: null }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { TalkXCampaignRunning } from '@/components/talkx/TalkXCampaignRunning';

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TalkXCampaignRunning onBack={() => {}} onViewMonitor={() => {}} />
    </QueryClientProvider>,
  );
}

describe('TalkXCampaignRunning · Editar limites (X006)', () => {
  beforeEach(() => {
    mutateAsync.mockClear();
  });

  it('digitar 10 chama updateCampaignLimits com send_interval_min=10000', async () => {
    renderView();

    fireEvent.click(await screen.findByRole('button', { name: /Editar Limites/i }));

    // Campos de intervalo (mínimo e máximo) são inputs type=number (role spinbutton).
    const spinbuttons = screen.getAllByRole('spinbutton');
    const minInput = spinbuttons[0];
    fireEvent.change(minInput, { target: { value: '10' } });

    fireEvent.click(screen.getByRole('button', { name: /Salvar Limites/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const payload = mutateAsync.mock.calls[0][0] as {
      limits: { send_interval_min: number; send_interval_max: number };
    };
    expect(payload.limits.send_interval_min).toBe(10000);
    expect(payload.limits.send_interval_max).toBe(20000);
  });
});
