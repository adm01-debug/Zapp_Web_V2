import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * X154 (TL-161) — "Ações da campanha", "Configurações Atuais" e a aba Configurações.
 *
 * O que este arquivo prova:
 * 1. o card "Configurações Atuais" mostra a janela de envio no formato "08:00 - 18:00";
 * 2. linha sem coluna no banco NÃO renderiza (A9) — sem `respect_dnd` no payload, a
 *    linha "Respeitar DND" não existe (e existe quando a coluna chega);
 * 3. as quatro ações existem e chamam o handler do seu botão;
 * 4. a aba Configurações da tela mostra o NOME da conexão e nunca o UUID dela.
 *
 * Vermelho antes do fix: as ações eram uma faixa horizontal sem "Configurações Atuais"
 * e a aba Configurações imprimia `whatsapp_connection_id` (UUID) na linha
 * "Canal WhatsApp".
 */

const CONNECTION_UUID = 'a1b2c3d4-1111-4222-8333-444455556666';

const campaignBase: TalkXCampaignWithRules = {
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
  whatsapp_connection_id: CONNECTION_UUID,
  created_by: null,
  started_at: '2026-10-01T12:00:00.000Z',
  completed_at: null,
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T12:00:00.000Z',
  media_url: null,
  media_type: null,
  scheduled_at: null,
  speed_profile: 'moderate',
  send_window_start: '08:00:00',
  send_window_end: '18:00:00',
  business_hours_only: false,
  schedule_timezone: 'America/Sao_Paulo',
  revision: 1,
  max_per_minute: 20,
};

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: [{ ...campaignBase }],
    updateCampaign: { mutateAsync: vi.fn() },
    updateCampaignLimits: { mutateAsync: vi.fn().mockResolvedValue({ campaign_id: 'c1', revision: 2 }) },
    pauseCampaign: vi.fn(),
    cancelCampaign: vi.fn(),
    startCampaign: vi.fn(),
    refetchCampaigns: vi.fn(),
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
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

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

// Cadeia thenable genérica para leituras de lista (o componente termina sempre em `await`).
const listChain = () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.order = () => chain;
  chain.limit = () => chain;
  chain.not = () => chain;
  chain.single = () => Promise.resolve({ data: null, error: null });
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
  return chain;
};

// X154: a conexão da campanha é lida por nome e número.
const connectionChain = () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.maybeSingle = () => Promise.resolve({
    data: { name: 'WhatsApp Principal', phone_number: '+55 11 90000-0000' },
    error: null,
  });
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
  return chain;
};

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: (table: string) => (table === 'whatsapp_connections' ? connectionChain() : listChain()),
  supabase: {
    from: () => listChain(),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
  invokeEdge: vi.fn().mockResolvedValue({ data: null, error: null }),
}));

import { TalkXCampaignActionsCard } from '@/components/talkx/tracking/TalkXCampaignActionsCard';
import type { TalkXCampaignWithRules } from '@/components/talkx/tracking/talkxCampaignRules';
import { TalkXCampaignRunning } from '@/components/talkx/TalkXCampaignRunning';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TalkXCampaignRunning onBack={() => {}} onViewMonitor={() => {}} />
    </QueryClientProvider>,
  );
}

const handlers = () => ({
  onPause: vi.fn(), onResume: vi.fn(), onCancel: vi.fn(), onEditLimits: vi.fn(), onViewMonitor: vi.fn(),
});

describe('TalkXCampaignActionsCard · Configurações Atuais (X154)', () => {
  it('mostra a janela de envio da campanha como "08:00 - 18:00"', () => {
    render(<TalkXCampaignActionsCard campaign={campaignBase} {...handlers()} />);

    expect(screen.getByText('Configurações Atuais')).toBeTruthy();
    expect(screen.getByText('08:00 - 18:00')).toBeTruthy();
    expect(screen.getByText('Horário de envio')).toBeTruthy();
  });

  it('mostra o limite de envio em mensagens por minuto', () => {
    render(<TalkXCampaignActionsCard campaign={campaignBase} {...handlers()} />);

    expect(screen.getByText('Limite de envio')).toBeTruthy();
    expect(screen.getByText('20 mensagens/min')).toBeTruthy();
  });

  it('sem a coluna de DND no payload, a linha "Respeitar DND" não existe (A9)', () => {
    const { rerender } = render(<TalkXCampaignActionsCard campaign={campaignBase} {...handlers()} />);
    expect(screen.queryByText('Respeitar DND')).toBeNull();

    // Quando a trilha de banco criar a coluna, o campo chega no payload e a linha aparece.
    rerender(<TalkXCampaignActionsCard campaign={{ ...campaignBase, respect_dnd: false }} {...handlers()} />);
    expect(screen.getByText('Respeitar DND')).toBeTruthy();
    expect(screen.getByText('Não')).toBeTruthy();
  });

  it('sem dias de envio no payload, a linha "Dias de envio" não existe (A9)', () => {
    const { rerender } = render(<TalkXCampaignActionsCard campaign={campaignBase} {...handlers()} />);
    expect(screen.queryByText('Dias de envio')).toBeNull();

    rerender(<TalkXCampaignActionsCard campaign={{ ...campaignBase, send_days: ['mon', 'tue', 'wed', 'thu', 'fri'] }} {...handlers()} />);
    expect(screen.getByText('Dias de envio')).toBeTruthy();
    expect(screen.getByText('Dias úteis (seg a sex)')).toBeTruthy();
  });

  it('cada ação chama o handler do seu botão', () => {
    const h = handlers();
    render(<TalkXCampaignActionsCard campaign={campaignBase} {...h} />);

    fireEvent.click(screen.getByRole('button', { name: /^Pausar$/ }));
    expect(h.onPause).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /^Cancelar campanha$/ }));
    expect(h.onCancel).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /^Editar Limites$/ }));
    expect(h.onEditLimits).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /^Ver Monitor ao Vivo$/ }));
    expect(h.onViewMonitor).toHaveBeenCalledTimes(1);
  });

  it('campanha pausada troca "Pausar" por "Retomar" (a tela 13 ainda não existe)', () => {
    const h = handlers();
    render(<TalkXCampaignActionsCard campaign={{ ...campaignBase, status: 'paused' }} {...h} />);

    expect(screen.queryByRole('button', { name: /^Pausar$/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Retomar$/ }));
    expect(h.onResume).toHaveBeenCalledTimes(1);
    expect(h.onPause).not.toHaveBeenCalled();
  });
});

describe('TalkXCampaignRunning · aba Configurações (X154)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mostra o nome da conexão e nunca o UUID dela', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Configurações' }));

    expect(await screen.findByText('Configurações da Campanha')).toBeTruthy();
    // O nome vem da leitura de `whatsapp_connections` (nome · número).
    expect(await screen.findByText(/WhatsApp Principal/)).toBeTruthy();
    expect(screen.getByText(/\+55 11 90000-0000/)).toBeTruthy();

    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    expect(uuid.test(document.body.textContent ?? '')).toBe(false);
  });
});
