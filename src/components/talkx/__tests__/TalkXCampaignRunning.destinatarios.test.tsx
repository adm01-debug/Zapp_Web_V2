/**
 * X150 — tela 11 (`TalkXCampaignRunning` › Destinatários) usando a tabela ÚNICA.
 *
 * Prova o que o cartão pede para a tela 11: as colunas Contato (avatar, nome,
 * telefone), Origem, Segmento, Status, Horário e Ações; busca e filtro com efeito;
 * contagem e paginação. Antes esta aba tinha colunas fixas (Contato/Telefone/
 * Status/Enviada em/Entregue em), mapa de estado LOCAL e nenhuma busca/paginação.
 *
 * O caminho é o real da tela: consulta de campanhas -> aba Destinatários ->
 * linhas vindas da consulta (mockada na fronteira do Supabase).
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

const HORA = '2026-10-08T12:05:00.000Z';

function destinatario(i: number) {
  return {
    id: `r${i}`,
    status: i === 1 ? 'delivered' : i === 2 ? 'pending' : 'sent',
    sent_at: i === 2 ? null : HORA,
    delivered_at: i === 1 ? HORA : null,
    read_at: i === 1 ? HORA : null,
    replied_at: null,
    updated_at: HORA,
    personalized_message: `Mensagem do destinatário ${i}`,
    error_message: null,
    segment_id: 'seg-1',
    segments: { name: i === 1 ? 'Segmento VIP' : 'Segmento Base' },
    contacts: {
      name: `Contato ${i}`, nickname: null, phone: `+551197777000${i % 10}`,
      company: 'Loja', avatar_url: null, lead_origin: i === 1 ? 'CRM 360' : null,
    },
  };
}

const { state, refetchCampaigns, mockCampaign } = vi.hoisted(() => {
  const campaign = {
    id: 'c1', name: 'Campanha Teste', message_template: 'Olá {{nome}}', variables_config: [],
    typing_delay_min: 1500, typing_delay_max: 4000, send_interval_min: 8000, send_interval_max: 20000,
    status: 'sending', total_recipients: 25, sent_count: 5, failed_count: 0, delivered_count: 5,
    read_count: 1, replied_count: 0, outcome_unknown_count: 0, whatsapp_connection_id: null,
    created_by: null, started_at: '2026-10-08T12:00:00.000Z', completed_at: null,
    created_at: '2026-10-08T10:00:00.000Z', updated_at: '2026-10-08T12:00:00.000Z',
    media_url: null, media_type: null, scheduled_at: null, speed_profile: 'moderate',
    send_window_start: null, send_window_end: null, business_hours_only: false, revision: 1,
  };
  return {
    mockCampaign: campaign,
    refetchCampaigns: vi.fn(),
    state: { rows: {} as Record<number, { data: unknown; error: { message: string } | null }> },
  };
});

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: [mockCampaign],
    isLoading: false, isFetching: false, isError: false, error: null, refetchCampaigns,
    updateCampaign: { mutateAsync: vi.fn() }, updateCampaignLimits: { mutateAsync: vi.fn() },
    pauseCampaign: vi.fn(), cancelCampaign: vi.fn(), startCampaign: vi.fn(),
  }),
}));

vi.mock('recharts', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const SvgBox = ({ children }: { children?: React.ReactNode }) => <svg>{children}</svg>;
  return { AreaChart: SvgBox, Area: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null, ResponsiveContainer: Box };
});

vi.mock('@/components/dashboard/overview/DashboardKpiCard', () => ({ DashboardKpiCard: () => <div data-testid="kpi-card" /> }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

// Cadeia thenable: a tela lê listas via .select().eq().order().limit(n).
const chain = (limitKey: number): Record<string, unknown> => ({
  select: () => chain(limitKey), eq: () => chain(limitKey), order: () => chain(limitKey),
  not: () => chain(limitKey), limit: (n: number) => chain(n),
  single: () => Promise.resolve({ data: null, error: null }),
  then: (resolve: (value: unknown) => void) => resolve(state.rows[limitKey] ?? { data: [], error: null }),
});

vi.mock('@/lib/supabaseHelpers', () => {
  const realtimeChannel = () => { const c = { on: () => c, subscribe: () => c }; return c; };
  return {
    fromTable: () => chain(-1),
    supabase: { from: () => chain(-1), rpc: vi.fn().mockResolvedValue({ data: null, error: null }), channel: realtimeChannel, removeChannel: vi.fn() },
    invokeEdge: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
});

import { TalkXCampaignRunning } from '@/components/talkx/TalkXCampaignRunning';

function abrirDestinatarios() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <TalkXCampaignRunning onBack={() => {}} onViewMonitor={() => {}} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Destinatários' }));
}

beforeEach(() => {
  refetchCampaigns.mockClear();
  state.rows = {
    2000: { data: [], error: null },
    200: { data: Array.from({ length: 25 }, (_, i) => destinatario(i + 1)), error: null },
    100: { data: [], error: null },
    50: { data: [], error: null },
  };
});

describe('X150 — Destinatários da tela 11 na tabela unificada', () => {
  it('mostra as colunas da tela 11 (Contato, Origem, Segmento, Status, Horário, Ações)', async () => {
    abrirDestinatarios();

    await waitFor(() => expect(screen.getByRole('columnheader', { name: 'Contato' })).toBeTruthy());
    for (const header of ['Origem', 'Segmento', 'Status', 'Horário']) {
      expect(screen.getByRole('columnheader', { name: header })).toBeTruthy();
    }
    // Contato mostra avatar/nome/telefone; Origem vem do contato (lead_origin).
    expect(screen.getByText('Contato 1')).toBeTruthy();
    expect(screen.getByText('+5511977770001')).toBeTruthy();
    expect(screen.getByText('CRM 360')).toBeTruthy();
    expect(screen.getByText('Segmento VIP')).toBeTruthy();
    // Ações por linha (menu ⋮) — a coluna não tem cabeçalho visível.
    expect(screen.getByRole('button', { name: 'Ações de Contato 1' })).toBeTruthy();
  });

  it('usa os estados do kit, incluindo o derivado "Lida" (read_at)', async () => {
    abrirDestinatarios();

    await waitFor(() => expect(screen.getByText('Contato 1')).toBeTruthy());
    const lida = screen.getByText('Contato 1').closest('tr') as HTMLElement;
    expect(within(lida).getByText('Lida')).toBeTruthy();
    const fila = screen.getByText('Contato 2').closest('tr') as HTMLElement;
    expect(within(fila).getByText('Na fila')).toBeTruthy();
  });

  it('tem busca e filtro com efeito e contagem/paginação da lista', async () => {
    abrirDestinatarios();
    await waitFor(() => expect(screen.getByText('Contato 1')).toBeTruthy());

    // Busca (espera de 300 ms) — antes esta aba não tinha busca nenhuma.
    const busca = screen.getByPlaceholderText('Buscar destinatário…');
    fireEvent.change(busca, { target: { value: 'Contato 7' } });
    await waitFor(() => expect(screen.queryByText('Contato 1')).toBeNull());
    expect(screen.getByText('Contato 7')).toBeTruthy();
    expect(screen.getByText('Mostrando 1 a 1 de 1 destinatários')).toBeTruthy();

    fireEvent.change(busca, { target: { value: '' } });
    await waitFor(() => expect(screen.getByText('Contato 1')).toBeTruthy());

    // Paginação: 25 linhas, 10 por página.
    expect(screen.getByText('Mostrando 1 a 10 de 25 destinatários')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(screen.getByText('Mostrando 11 a 20 de 25 destinatários')).toBeTruthy();

    // Filtro por estado no select da própria tabela.
    const trigger = screen.getByRole('combobox', { name: 'Filtrar por estado' });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('option', { name: 'Lida' }));

    await waitFor(() => expect(screen.queryByText('Contato 7')).toBeNull());
    expect(screen.getByText('Contato 1')).toBeTruthy();
    expect(screen.getByText('Mostrando 1 a 1 de 1 destinatários')).toBeTruthy();
  });
});
