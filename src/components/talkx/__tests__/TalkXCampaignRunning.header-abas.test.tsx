import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * X153 — cabeçalho, seletor, abas e Visão Geral da tela 12 (inventário T12-001…T12-006,
 * T12-028…T12-033, T12-041…T12-044).
 *
 * O que estava errado na tela e é provado aqui:
 *  1. não existia breadcrumb "Campanhas › <nome> › Em andamento" (T12-001);
 *  2. o subtítulo era "Acompanhe e gerencie envios ativos", não o do mock (T12-003);
 *  3. o `<select>` nativo mostrava o status cru `[sending]` (T12-004);
 *  4. "Início: <dia>, HH:mm" só existia dentro da aba Configurações (T12-005);
 *  5. "→ Ver monitor" vivia só no card de ações, não no cabeçalho (T12-006);
 *  6. as abas eram `<button>` sem `role="tab"` e sem teclado (T12-008…T12-013);
 *  7. não havia anel com as cinco contagens nem "Pico de Respostas" (T12-028…T12-044).
 *
 * Arquivo próprio porque mocka o hook `useTalkX` inteiro (mesmo padrão de
 * `TalkXCampaignRunning.states.test.tsx`).
 */

const { state, refetchCampaigns, onViewMonitor } = vi.hoisted(() => {
  const campaign = {
    id: 'c1',
    name: 'Campanha Verão 2026',
    message_template: 'Olá {{nome}}',
    variables_config: [],
    typing_delay_min: 1500,
    typing_delay_max: 4000,
    send_interval_min: 8000,
    send_interval_max: 20000,
    status: 'sending',
    total_recipients: 5000,
    sent_count: 1250,
    failed_count: 42,
    delivered_count: 1180,
    read_count: 40,
    replied_count: 289,
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
    refetchCampaigns: vi.fn(),
    onViewMonitor: vi.fn(),
    state: {
      campaignList: [campaign] as unknown[],
      campaignsLoading: false,
      campaignsIsError: false,
      // Resposta por `limit(n)`: 200 = destinatários, 100 = mensagens, 50 = logs, 2000 = histórico.
      rows: {} as Record<number, { data: unknown; error: { message: string } | null }>,
    },
  };
});

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: state.campaignList,
    isLoading: state.campaignsLoading,
    isFetching: state.campaignsLoading,
    isError: state.campaignsIsError,
    error: state.campaignsIsError ? new Error('falha X153 — consulta de campanhas') : null,
    refetchCampaigns,
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

const chain = (limitKey: number): Record<string, unknown> => ({
  select: () => chain(limitKey),
  eq: () => chain(limitKey),
  order: () => chain(limitKey),
  not: () => chain(limitKey),
  limit: (n: number) => chain(n),
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
      <TalkXCampaignRunning onBack={() => {}} onViewMonitor={onViewMonitor} />
    </QueryClientProvider>,
  );
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

describe('TalkXCampaignRunning · cabeçalho, seletor e abas (X153)', () => {
  beforeEach(() => {
    state.rows = { 2000: { data: [], error: null }, 200: { data: [], error: null }, 100: { data: [], error: null }, 50: { data: [], error: null } };
    refetchCampaigns.mockClear();
    onViewMonitor.mockClear();
  });

  it('monta o cabeçalho do mock: breadcrumb, título, subtítulo, chip de início e "Ver monitor"', () => {
    renderView();

    const breadcrumb = screen.getByRole('navigation', { name: 'Trilha de navegação' });
    expect(within(breadcrumb).getByText('Campanhas')).toBeTruthy();
    expect(within(breadcrumb).getByText('Campanha Verão 2026')).toBeTruthy();
    expect(within(breadcrumb).getByText('Em andamento')).toBeTruthy();

    expect(screen.getByRole('heading', { name: 'Campanha em Andamento' })).toBeTruthy();
    expect(screen.getByText('A campanha está enviando mensagens para os destinatários selecionados.')).toBeTruthy();

    // chip "Início: <dia>, HH:mm" — hora local do navegador, derivada de `started_at`
    const started = new Date('2026-10-05T12:00:00.000Z');
    const hhmm = `${String(started.getHours()).padStart(2, '0')}:${String(started.getMinutes()).padStart(2, '0')}`;
    expect(screen.getByText(new RegExp(`^Início: \\S+, \\d{2} de \\w+ de \\d{4}, ${hhmm}$`))).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Ver monitor' }));
    expect(onViewMonitor).toHaveBeenCalledWith('c1');
  });

  it('o seletor do kit mostra "Campanha: <nome>" com a pílula traduzida e nunca o status cru', () => {
    renderView();

    const trigger = screen.getByLabelText('Selecionar campanha');
    expect(trigger).toHaveTextContent('Campanha: Campanha Verão 2026');
    expect(within(trigger).getByText('Em andamento')).toBeTruthy();
    expect(screen.queryByText(/\[sending\]/)).toBeNull();
    expect(screen.queryByText(/\[paused\]/)).toBeNull();
  });

  it('as abas são as do kit: role="tab" e as setas do teclado trocam de aba', async () => {
    renderView();

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Visão Geral', 'Destinatários', 'Mensagens', 'Configurações', 'Resultados', 'Logs em Tempo Real',
    ]);
    expect(screen.getByRole('tab', { name: 'Visão Geral' })).toHaveAttribute('aria-selected', 'true');

    // Seta para a direita na aba ativa: a seleção anda para "Destinatários" e a aba
    // passa a pedir a própria lista (não é só o rótulo que muda). O grupo de abas move
    // o foco no próximo tick, por isso a espera.
    const active = screen.getByRole('tab', { name: 'Visão Geral' });
    active.focus();
    fireEvent.keyDown(active, { key: 'ArrowRight' });

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Destinatários' })).toHaveAttribute('aria-selected', 'true');
    });
    expect(screen.getByRole('tab', { name: 'Visão Geral' })).toHaveAttribute('aria-selected', 'false');
    expect(await screen.findByText('Nenhum destinatário nesta campanha.')).toBeTruthy();
  });

  it('a Visão Geral traz o anel do mock (25% · 1.250 de 5.000) e o card "Pico de Respostas"', () => {
    renderView();

    expect(screen.getByText('25%')).toBeTruthy();
    expect(screen.getByText('1.250 de 5.000')).toBeTruthy();
    expect(screen.getByText('(94%)')).toBeTruthy();
    expect(screen.getByText('3.750')).toBeTruthy();
    // sem envios na janela, o card do pico declara que ainda não há base de comparação
    expect(screen.getByText('Pico de Respostas')).toBeTruthy();
    expect(screen.getByText('Ainda sem respostas suficientes')).toBeTruthy();
  });

  it('com respostas nas duas janelas de 10 min o "Pico de Respostas" mostra a variação', async () => {
    const sent = minutesAgo(30);
    state.rows[2000] = {
      data: [
        ...Array.from({ length: 6 }, () => ({ sent_at: sent, delivered_at: null, replied_at: minutesAgo(15) })),
        ...Array.from({ length: 9 }, () => ({ sent_at: sent, delivered_at: null, replied_at: minutesAgo(2) })),
      ],
      error: null,
    };

    renderView();

    // 9 respostas agora contra 6 na janela anterior: +50%
    expect(await screen.findByText('+50% nas respostas')).toBeTruthy();
    expect(screen.queryByText('Ainda sem respostas suficientes')).toBeNull();
    // sem média histórica (CAP-083 sem dado) o card não afirma "Ótimo engajamento"
    expect(screen.queryByText(/Ótimo engajamento/)).toBeNull();
  });
});
