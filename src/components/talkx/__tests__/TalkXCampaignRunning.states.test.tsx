import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * X047 — matriz de estados, linha da tela Em andamento (`TalkXCampaignRunning`).
 *
 * A regra da etapa: consulta que FALHA mostra o ERRO, nunca o vazio. Antes desta correção a
 * tela decidia os estados à mão e, pior, os `queryFn` engoliam o erro (`data ?? []` /
 * `if (!data?.length) return []`): uma falha de rede virava "Nenhuma campanha em andamento",
 * "Mostrando 0 recentes" ou "Aguardando eventos de envio…" — o sistema mentia sobre a falha.
 *
 * Aqui cada caso é o defeito real da tela:
 * 1. consulta de campanhas falhou (lista vazia) -> erro, não o vazio (cabeçalho e corpo);
 * 2. consulta de campanhas carregando -> esqueleto com `aria-busy`, não o vazio;
 * 3. consulta dos destinatários falhou -> erro com "Tentar novamente" que refaz SÓ aquela
 *    consulta e mantém a campanha e a aba selecionadas;
 * 4. consulta das mensagens falhou -> erro e retry sem perder campanha/aba;
 * 5. consulta do histórico de envios falhou -> erro na Visão Geral, não o card vazio;
 * 6. carga inicial dos logs falhou -> erro, não "Aguardando eventos de envio…".
 *
 * O teste fica em arquivo próprio porque mocka o hook `useTalkX` inteiro (o
 * `TalkXCampaignRunning.limits.test.tsx` já usa esse padrão).
 */

const { state, refetchCampaigns, mockCampaign } = vi.hoisted(() => {
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
    mockCampaign: campaign,
    refetchCampaigns: vi.fn(),
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
    error: state.campaignsIsError ? new Error('falha X047 — consulta de campanhas') : null,
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

// Cadeia thenable genérica: o componente só lê listas via .select().eq().order().limit(n).
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
      <TalkXCampaignRunning onBack={() => {}} onViewMonitor={() => {}} />
    </QueryClientProvider>,
  );
}

const RECIPIENT_ROW = {
  status: 'sent',
  sent_at: '2026-10-05T12:00:00.000Z',
  delivered_at: null,
  error_message: null,
  contacts: { name: 'Contato Retry X047', phone: '+5511999990000' },
};

const MESSAGE_ROW = {
  id: 'r1',
  status: 'sent',
  personalized_message: 'Mensagem recuperada no retry X047',
  sent_at: '2026-10-05T12:00:00.000Z',
  delivered_at: null,
  error_message: null,
  contacts: { name: 'Contato Retry X047', phone: 'telefone-sintetico' },
};

const HISTORY_ROW = {
  sent_at: new Date().toISOString(),
  delivered_at: null,
};

const LOG_ROW = {
  id: 'log-1',
  status: 'sent',
  updated_at: '2026-10-05T12:00:00.000Z',
  error_message: null,
  contacts: { name: 'Atividade recuperada X047', phone: 'telefone-sintetico' },
};

describe('matriz de estados — TalkXCampaignRunning / Em andamento (X047)', () => {
  beforeEach(() => {
    state.campaignList = [mockCampaign];
    state.campaignsLoading = false;
    state.campaignsIsError = false;
    state.rows = {
      2000: { data: [], error: null },
      200: { data: [], error: null },
      100: { data: [], error: null },
      50: { data: [], error: null },
    };
    refetchCampaigns.mockClear();
  });

  it('erro na consulta de campanhas: mostra o erro, NÃO o vazio e permite refetch', () => {
    state.campaignList = [];
    state.campaignsIsError = true;

    const { container } = renderView();

    expect(screen.getByText(/Não foi possível carregar as campanhas/)).toBeTruthy();
    expect(screen.queryByText('Nenhuma campanha em andamento no momento.')).toBeNull();
    expect(container.querySelector('[data-talkx-query="empty"]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(refetchCampaigns).toHaveBeenCalledTimes(1);
  });

  it('erro na consulta de campanhas: o cabeçalho não anuncia "Nenhuma campanha ativa"', () => {
    state.campaignList = [];
    state.campaignsIsError = true;

    renderView();

    expect(screen.getByRole('option', { name: 'Campanhas indisponíveis' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Nenhuma campanha ativa' })).toBeNull();
  });

  it('carregando as campanhas: esqueleto com aria-busy, sem vazio e sem erro', () => {
    state.campaignList = [];
    state.campaignsLoading = true;

    const { container } = renderView();

    expect(container.querySelector('[data-talkx-query="loading"]')).toBeTruthy();
    expect(container.querySelector('[data-talkx-query="loading"]')?.getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByText('Nenhuma campanha em andamento no momento.')).toBeNull();
    expect(screen.queryByText(/Não foi possível carregar/)).toBeNull();
  });

  it('erro nos destinatários: erro, e "Tentar novamente" refaz a consulta sem perder campanha e aba', async () => {
    state.rows[200] = { data: null, error: { message: 'falha X047 — destinatários' } };

    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Destinatários' }));

    expect(await screen.findByText(/Não foi possível carregar as informações dos destinatários/)).toBeTruthy();
    expect(screen.queryByText('Nenhum destinatário nesta campanha.')).toBeNull();

    // A consulta volta a responder: o retry tem de rebuscar e reidratar a MESMA aba.
    state.rows[200] = { data: [RECIPIENT_ROW], error: null };
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByText('Contato Retry X047')).toBeTruthy();
    const select = screen.getByLabelText('Selecionar campanha') as HTMLSelectElement;
    expect(select.value).toBe('c1');
    expect(screen.getByRole('button', { name: 'Destinatários' }).className).toContain('border-primary');
  });

  it('erro nas mensagens: erro, e "Tentar novamente" refaz a consulta sem perder campanha e aba', async () => {
    state.rows[100] = { data: null, error: { message: 'falha X047 — mensagens' } };

    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Mensagens' }));

    expect(await screen.findByText(/Não foi possível carregar as mensagens/)).toBeTruthy();
    expect(screen.queryByText('Nenhum destinatário nesta campanha.')).toBeNull();

    state.rows[100] = { data: [MESSAGE_ROW], error: null };
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByText('Mensagem recuperada no retry X047')).toBeTruthy();
    const select = screen.getByLabelText('Selecionar campanha') as HTMLSelectElement;
    expect(select.value).toBe('c1');
    expect(screen.getByRole('button', { name: 'Mensagens' }).className).toContain('border-primary');
  });

  it('erro no histórico: retry recupera a Visão Geral sem perder campanha e aba', async () => {
    state.rows[2000] = { data: null, error: { message: 'falha X047 — histórico' } };

    renderView();

    expect(await screen.findByText(/Não foi possível carregar as estatísticas de envio/)).toBeTruthy();
    expect(screen.queryByText('Nenhum envio registrado nesta campanha ainda.')).toBeNull();

    state.rows[2000] = { data: [HISTORY_ROW], error: null };
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByText('Ritmo de Envio')).toBeTruthy();
    const select = screen.getByLabelText('Selecionar campanha') as HTMLSelectElement;
    expect(select.value).toBe('c1');
    expect(screen.getByRole('button', { name: 'Visão Geral' }).className).toContain('border-primary');
  });

  it('erro nos logs: retry recupera atividades sem perder campanha e aba', async () => {
    state.rows[50] = { data: null, error: { message: 'falha X047 — logs' } };

    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Logs em Tempo Real' }));

    expect(await screen.findByText(/Não foi possível carregar as atividades em tempo real/)).toBeTruthy();
    expect(screen.queryByText('Aguardando eventos de envio…')).toBeNull();

    state.rows[50] = { data: [LOG_ROW], error: null };
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByText(/Atividade recuperada X047/)).toBeTruthy();
    const select = screen.getByLabelText('Selecionar campanha') as HTMLSelectElement;
    expect(select.value).toBe('c1');
    expect(screen.getByRole('button', { name: 'Logs em Tempo Real' }).className).toContain('border-primary');
  });
});
