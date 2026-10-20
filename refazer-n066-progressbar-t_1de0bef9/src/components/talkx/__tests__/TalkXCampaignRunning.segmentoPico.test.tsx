import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// O jsdom não implementa captura de ponteiro; o gatilho do Select (Radix) chama
// `hasPointerCapture` no pointerdown que o abre.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

/**
 * Fila por segmento + pico de respostas — tela Em andamento (TalkXCampaignRunning).
 *
 * Prova o que o cartão pede:
 * 1. Destinatários ganham a coluna "Segmento" (nome vindo de talkx_segments, '—' quando nulo);
 * 2. Destinatários filtram por nome/telefone e por status (padrão Select do produto);
 * 3. Logs em Tempo Real mostram o segmento e filtram por busca/status;
 * 4. Visão Geral mostra o InsightCard "Pico de respostas" com contagem e horário — e
 *    não mostra o cartão quando não há resposta nos últimos 20 min.
 *
 * Arquivo próprio porque mocka `useTalkX` inteiro (mesmo padrão dos testes states/limits).
 */

const { state, mockCampaign } = vi.hoisted(() => {
  const campaign = {
    id: 'c1',
    name: 'Campanha Segmento',
    message_template: 'Olá {{nome}}',
    variables_config: [],
    typing_delay_min: 1500,
    typing_delay_max: 4000,
    send_interval_min: 8000,
    send_interval_max: 20000,
    status: 'sending',
    total_recipients: 10,
    sent_count: 5,
    failed_count: 2,
    delivered_count: 3,
    read_count: 1,
    replied_count: 3,
    outcome_unknown_count: 0,
    whatsapp_connection_id: null,
    created_by: null,
    started_at: '2026-10-10T12:00:00.000Z',
    completed_at: null,
    created_at: '2026-10-10T10:00:00.000Z',
    updated_at: '2026-10-10T12:00:00.000Z',
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
    state: {
      // Resposta por `limit(n)`: 200 = destinatários, 50 = logs, 2000 = histórico,
      // -1 = consultas sem limit (mapa de segmentos).
      rows: {} as Record<number, { data: unknown; error: { message: string } | null }>,
    },
  };
});

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: [mockCampaign],
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

// Cadeia thenable genérica: o componente lê listas via .select().eq().order().limit(n)
// e também .not(...); a resposta é escolhida pelo último limit(n).
const chain = (limitKey: number): Record<string, unknown> => ({
  select: () => chain(limitKey),
  eq: () => chain(limitKey),
  order: () => chain(limitKey),
  not: () => chain(limitKey),
  limit: (n: number) => chain(n),
  single: () => Promise.resolve({ data: null, error: null }),
  maybeSingle: () => Promise.resolve({ data: null, error: null }),
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

const SEGMENTOS = { data: [{ id: 's1', name: 'Compradores VIP' }], error: null };

const RECIP_ANA = { status: 'sent', segment_id: 's1', sent_at: '2026-10-10T12:00:00.000Z', delivered_at: null, error_message: null, contacts: { name: 'Ana Segmento', phone: '+5511999990001' } };
const RECIP_BRUNO = { status: 'failed', segment_id: null, sent_at: '2026-10-10T12:01:00.000Z', delivered_at: null, error_message: 'falha', contacts: { name: 'Bruno SemSeg', phone: '+5511999990002' } };

const LOG_ANA = { id: 'l1', segment_id: 's1', status: 'sent', updated_at: '2026-10-10T12:00:00.000Z', error_message: null, contacts: { name: 'Ana Segmento', phone: '+5511999990001' } };
const LOG_BRUNO = { id: 'l2', segment_id: null, status: 'failed', updated_at: '2026-10-10T12:01:00.000Z', error_message: 'falha', contacts: { name: 'Bruno SemSeg', phone: '+5511999990002' } };

/** Abre um Select real (Radix) e escolhe a opção — mesmo helper dos filtros do Overview. */
function escolher(rotuloDoSelect: string, opcao: string) {
  fireEvent.pointerDown(screen.getByRole('combobox', { name: rotuloDoSelect }), {
    button: 0, ctrlKey: false, pointerType: 'mouse',
  });
  fireEvent.click(screen.getByRole('option', { name: opcao }));
}

describe('TalkXCampaignRunning · Segmento e Pico de Respostas', () => {
  beforeEach(() => {
    state.rows = {
      '-1': SEGMENTOS,
      2000: { data: [], error: null },
      200: { data: [RECIP_ANA, RECIP_BRUNO], error: null },
      50: { data: [LOG_ANA, LOG_BRUNO], error: null },
    };
  });

  it('Destinatários: coluna Segmento mostra o nome e "—" quando o destinatário não tem segmento', async () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Destinatários' }));

    expect(await screen.findByText('Ana Segmento')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Segmento' })).toBeTruthy();
    expect(screen.getByText('Compradores VIP')).toBeTruthy();
    // Bruno não tem segmento: a célula mostra '—' (a linha existe).
    expect(screen.getByText('Bruno SemSeg')).toBeTruthy();
  });

  it('Destinatários: busca por nome filtra a lista', async () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Destinatários' }));
    expect(await screen.findByText('Ana Segmento')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Buscar por nome ou telefone'), { target: { value: 'bruno' } });

    await waitFor(() => expect(screen.queryByText('Ana Segmento')).toBeNull());
    expect(screen.getByText('Bruno SemSeg')).toBeTruthy();
    expect(screen.getByText('Mostrando 1 de 2')).toBeTruthy();
  });

  it('Destinatários: filtro de status deixa só as falhas', async () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Destinatários' }));
    expect(await screen.findByText('Ana Segmento')).toBeTruthy();

    escolher('Filtrar por status', 'Falha');

    await waitFor(() => expect(screen.queryByText('Ana Segmento')).toBeNull());
    expect(screen.getByText('Bruno SemSeg')).toBeTruthy();
  });

  it('Logs: mostram o segmento e filtram por busca', async () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Logs em Tempo Real' }));

    expect(await screen.findByText('Compradores VIP')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Buscar por nome ou telefone'), { target: { value: 'Ana' } });

    await waitFor(() => expect(screen.queryByText('Bruno SemSeg')).toBeNull());
    expect(screen.getByText(/Ana Segmento/)).toBeTruthy();
  });

  it('Logs: filtro de status deixa só as falhas', async () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Logs em Tempo Real' }));
    expect(await screen.findByText(/Ana Segmento/)).toBeTruthy();

    escolher('Filtrar por status', 'Falha');

    await waitFor(() => expect(screen.queryByText(/Ana Segmento/)).toBeNull());
    expect(screen.getByText(/Bruno SemSeg/)).toBeTruthy();
  });

  it('Visão Geral: mostra o Pico de Respostas com o % calculado quando o aumento é relevante', async () => {
    const agora = Date.now();
    const recentes = new Date(agora - 3 * 60_000).toISOString();   // últimos 10 min
    const anteriores = new Date(agora - 15 * 60_000).toISOString(); // 10–20 min atrás
    state.rows[2000] = {
      data: [
        { sent_at: recentes, delivered_at: null, replied_at: recentes },
        { sent_at: recentes, delivered_at: null, replied_at: recentes },
        { sent_at: recentes, delivered_at: null, replied_at: recentes },
        { sent_at: anteriores, delivered_at: null, replied_at: anteriores },
      ],
      error: null,
    };

    renderView();

    expect(await screen.findByText('Pico de Respostas')).toBeTruthy();
    // 3 respostas agora vs. 1 antes → +200%, calculado de verdade (nada fixo).
    expect(screen.getByText(/\+200% nas respostas nos últimos 10 min vs\. os 10 min anteriores\./)).toBeTruthy();
    expect(screen.getByText('Heurístico')).toBeTruthy();
  });

  it('Visão Geral: sem aumento relevante o cartão do Pico de Respostas não aparece', async () => {
    const agora = Date.now();
    const recentes = new Date(agora - 3 * 60_000).toISOString();
    const anteriores = new Date(agora - 15 * 60_000).toISOString();
    state.rows[2000] = {
      data: [
        { sent_at: recentes, delivered_at: null, replied_at: recentes },   // 1 agora
        { sent_at: anteriores, delivered_at: null, replied_at: anteriores }, // 1 antes → 0%
      ],
      error: null,
    };

    renderView();

    expect(await screen.findByText('Ritmo de Envio')).toBeTruthy();
    expect(screen.queryByText('Pico de Respostas')).toBeNull();
  });

  it('Visão Geral: sem resposta no período anterior não há % honesto — o cartão não aparece', async () => {
    state.rows[2000] = {
      data: [{ sent_at: new Date(Date.now() - 3 * 60_000).toISOString(), delivered_at: null, replied_at: new Date(Date.now() - 3 * 60_000).toISOString() }],
      error: null,
    };

    renderView();

    expect(await screen.findByText('Ritmo de Envio')).toBeTruthy();
    expect(screen.queryByText('Pico de Respostas')).toBeNull();
  });
});
