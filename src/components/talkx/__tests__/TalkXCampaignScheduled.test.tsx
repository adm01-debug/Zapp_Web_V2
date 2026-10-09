import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

/**
 * X139 (T10-001…T10-005, T10-043, T10-044) — cabeçalho, Resumo da Campanha com
 * dados reais e estado "pronta para envio" da tela Agendada.
 *
 * O que estava errado antes desta correção:
 *  - o topo mostrava "Campanhas / {nome}" em vez do breadcrumb do módulo
 *    ("Campanhas › Talk X › Campanha Agendada") e o nome da campanha aparecia
 *    como subtítulo, sem o título "Campanha Agendada • <nome>" nem o subtítulo
 *    do mock;
 *  - o selo "Agendada para ..." era formatado por `fmtDateTime`, no fuso do
 *    NAVEGADOR — não no fuso salvo na campanha (`schedule_timezone`);
 *  - a frase "Campanha pronta para ser enviada." aparecia sempre, mesmo com a
 *    linha WhatsApp caída;
 *  - a linha "Linha WhatsApp" era o texto FIXO "Linha WhatsApp conectada"
 *    sempre que havia id, sem ler o estado real da conexão;
 *  - não havia duração estimada com o ritmo previsto.
 *
 * Os testes abaixo renderizam o componente REAL (o editor montado pelo
 * `TalkXCampaignScheduled` quando a consulta devolve a campanha) e olham o que
 * o operador vê.
 */

type QueryState = {
  campaigns: Array<Record<string, unknown>>;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isFetching: boolean;
};

type ConnectionState = { status: string | null; label: string | null; loading: boolean };

const h = vi.hoisted(() => ({
  state: {
    campaigns: [] as Array<Record<string, unknown>>,
    isLoading: false,
    isError: false,
    error: null as Error | null,
    isFetching: false,
  } as QueryState,
  connection: { status: null, label: null, loading: false } as ConnectionState,
  onBack: vi.fn(),
  onEdit: vi.fn(),
  onStatusChange: vi.fn(),
}));

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: h.state.campaigns,
    isLoading: h.state.isLoading,
    isError: h.state.isError,
    error: h.state.error,
    isFetching: h.state.isFetching,
    refetchCampaigns: vi.fn(),
    updateCampaign: { mutateAsync: vi.fn() },
    startCampaign: vi.fn(),
  }),
}));

vi.mock('@/hooks/integrations/useTalkXConnectionStatus', () => ({
  useTalkXConnectionStatus: () => h.connection,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { TalkXCampaignScheduled } from '../TalkXCampaignScheduled';

const BASE_CAMPAIGN = {
  id: 'camp-agendada-1',
  name: 'Black Friday VIP',
  message_template: 'Olá {{nome}}, chegou a Black Friday VIP!',
  variables_config: [],
  // 16,75 s por mensagem → 1.200 contatos em ~5h 35min a ~3,6 msg/min
  typing_delay_min: 1500,
  typing_delay_max: 4000,
  send_interval_min: 8000,
  send_interval_max: 20000,
  status: 'scheduled',
  total_recipients: 1200,
  sent_count: 0,
  failed_count: 0,
  delivered_count: 0,
  // `string | null` de propósito: um dos cenários é a campanha SEM linha.
  whatsapp_connection_id: 'conn-1' as string | null,
  created_by: 'user-1',
  started_at: null,
  completed_at: null,
  created_at: '2026-11-25T17:32:00.000Z',
  updated_at: '2026-11-25T17:32:00.000Z',
  media_url: null,
  media_type: null,
  // 15:00 UTC — 12:00 em São Paulo (UTC-3) e 11:00 em Manaus (UTC-4)
  scheduled_at: '2026-12-01T15:00:00.000Z',
  schedule_timezone: 'America/Sao_Paulo',
  send_window_start: null,
  send_window_end: null,
  business_hours_only: false,
  speed_profile: 'moderate',
  revision: 1,
};

function setCampaign(over: Partial<typeof BASE_CAMPAIGN> = {}) {
  h.state = {
    campaigns: [{ ...BASE_CAMPAIGN, ...over }],
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
  };
}

function setConnection(over: Partial<ConnectionState>) {
  h.connection = { status: null, label: null, loading: false, ...over };
}

function view() {
  return (
    <TalkXCampaignScheduled
      campaignId="camp-agendada-1"
      onBack={h.onBack}
      onEdit={h.onEdit}
      onStatusChange={h.onStatusChange}
    />
  );
}

describe('X139 — tela Agendada: cabeçalho, resumo real e estado de prontidão', () => {
  beforeEach(() => {
    h.onBack.mockClear();
    h.onEdit.mockClear();
    h.onStatusChange.mockClear();
    setCampaign();
    setConnection({ status: 'connected', label: 'Conectada' });
  });

  it('T10-001/003/004: breadcrumb do módulo, título "Campanha Agendada • <nome>" e subtítulo do mock', () => {
    render(view());

    // breadcrumb do módulo (o antigo era "Campanhas / Black Friday VIP")
    expect(screen.getByText('Campanhas')).toBeTruthy();
    expect(screen.getByText('Talk X')).toBeTruthy();
    expect(screen.getByText('Campanha Agendada')).toBeTruthy();

    const titulo = screen.getByRole('heading', { level: 1 });
    expect(titulo.textContent).toBe('Campanha Agendada • Black Friday VIP');
    expect(screen.getByText('Configure o agendamento e revise os detalhes antes de ativar o envio.')).toBeTruthy();
  });

  it('T10-005: o selo mostra o horário no fuso DA CAMPANHA (mesmo instante, fusos diferentes)', () => {
    const rendered = render(view());
    expect(screen.getByText('Agendada para 01/12 • 12:00')).toBeTruthy();

    // mesmo instante (15:00 UTC), campanha em Manaus (UTC-4)
    setCampaign({ schedule_timezone: 'America/Manaus' });
    rendered.rerender(view());

    expect(screen.getByText('Agendada para 01/12 • 11:00')).toBeTruthy();
    expect(screen.queryByText('Agendada para 01/12 • 12:00')).toBeNull();
  });

  it('T10-043: lê o estado REAL da linha e não diz "conectada" com a conexão caída', () => {
    setConnection({ status: 'disconnected', label: 'Desconectada' });
    render(view());

    expect(screen.getByText('Desconectada')).toBeTruthy();
    expect(screen.queryByText('Linha WhatsApp conectada')).toBeNull();
  });

  it('T10-005: esconde "Campanha pronta para ser enviada." com checagem bloqueante e leva ao wizard', () => {
    setConnection({ status: 'disconnected', label: 'Desconectada' });
    render(view());

    expect(screen.queryByText(/Campanha pronta para ser enviada/)).toBeNull();
    expect(screen.getByText(/1 pendência antes do envio/)).toBeTruthy();
    expect(screen.getByText('A linha WhatsApp está desconectada.')).toBeTruthy();

    const botoes = screen.getAllByRole('button', { name: /Revisar no wizard/ });
    expect(botoes.length).toBeGreaterThan(0);
    fireEvent.click(botoes[0]);
    expect(h.onEdit).toHaveBeenCalledTimes(1);
    expect(h.onEdit.mock.calls[0][0]).toMatchObject({ id: 'camp-agendada-1' });
  });

  it('T10-005: anuncia o envio quando não há pendência bloqueante', () => {
    render(view());

    expect(screen.getByText(/Campanha pronta para ser enviada\./)).toBeTruthy();
    expect(screen.getByText('Tudo pronto para o envio!')).toBeTruthy();
    expect(screen.getByText('Conectada')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Revisar no wizard/ })).toBeNull();
  });

  it('T10-005: público sem contatos, mensagem vazia e linha ausente somam 3 pendências', () => {
    setCampaign({
      whatsapp_connection_id: null,
      total_recipients: 0,
      message_template: '',
    });
    setConnection({ status: null, label: null });
    render(view());

    expect(screen.getByText(/3 pendências antes do envio/)).toBeTruthy();
    expect(screen.getByText('Nenhuma linha WhatsApp selecionada.')).toBeTruthy();
    expect(screen.getByText('O público não tem contatos elegíveis.')).toBeTruthy();
    expect(screen.getByText('A mensagem da campanha está vazia.')).toBeTruthy();
    expect(screen.queryByText(/Campanha pronta para ser enviada/)).toBeNull();
  });

  it('T10-044: mostra a duração estimada com o ritmo previsto', () => {
    render(view());

    expect(screen.getByText('~5h 35min')).toBeTruthy();
    expect(screen.getByText(/~3\.6 msg\/min/)).toBeTruthy();
  });

  it('conexão ainda carregando não vira pendência (não se inventa bloqueio sem dado)', () => {
    setConnection({ status: null, label: null, loading: true });
    render(view());

    expect(screen.getByText(/Campanha pronta para ser enviada\./)).toBeTruthy();
  });
});
