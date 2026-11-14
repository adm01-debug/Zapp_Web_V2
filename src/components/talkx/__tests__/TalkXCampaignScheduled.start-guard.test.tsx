import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

/**
 * QA (X140) — varredura adversarial achou 3 defeitos no mesmo fluxo de
 * "Iniciar agora" / "Salvar agendamento" da Tela 10 (`TalkXCampaignScheduled`):
 *
 * 1. "Iniciar agora" disparava direto pelo controlador de ciclo de vida, SEM
 *    passar pela edição que o operador tinha feito na tela e não salvou (data,
 *    hora, janela, repetição) — a campanha era lançada com os dados antigos,
 *    descartando a edição em silêncio.
 * 2. "Salvar agendamento" não tinha nenhum controle de concorrência: duas
 *    abas/usuários editando a mesma campanha agendada podiam se sobrescrever
 *    sem aviso (last-write-wins silencioso).
 * 3. "Iniciar agora" ficava clicável mesmo com pendência real visível no selo
 *    de status (linha desconectada, público vazio, mensagem vazia).
 *
 * Os 3 casos abaixo provam que cada um FICA bloqueado com aviso — e que o
 * fluxo "limpo" (sem edição pendente, sem pendência) continua funcionando.
 */

const h = vi.hoisted(() => ({
  campaigns: [] as Array<Record<string, unknown>>,
  startCampaign: vi.fn(),
  pauseCampaign: vi.fn(),
  cancelCampaign: vi.fn(),
  updateCampaign: { mutateAsync: vi.fn() },
  connection: { status: 'connected', label: 'Conectada', loading: false } as {
    status: string | null;
    label: string | null;
    loading: boolean;
  },
}));

const onBack = vi.fn();
const onEdit = vi.fn();
const onStatusChange = vi.fn();

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: h.campaigns,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetchCampaigns: vi.fn(),
    updateCampaign: h.updateCampaign,
    startCampaign: h.startCampaign,
    pauseCampaign: h.pauseCampaign,
    cancelCampaign: h.cancelCampaign,
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/hooks/integrations/useTalkXConnectionStatus', () => ({
  useTalkXConnectionStatus: () => h.connection,
}));

import { TalkXCampaignScheduled } from '../TalkXCampaignScheduled';
import { toast } from 'sonner';

const BASE_CAMPAIGN = {
  id: 'camp-agendada-1',
  name: 'Promoção de Outubro',
  message_template: 'Olá {{nome}}, chegou a promoção!',
  variables_config: [],
  typing_delay_min: 1500,
  typing_delay_max: 4000,
  send_interval_min: 8000,
  send_interval_max: 20000,
  status: 'scheduled',
  total_recipients: 1200,
  sent_count: 0,
  failed_count: 0,
  delivered_count: 0,
  whatsapp_connection_id: 'conn-1',
  created_by: 'user-1',
  started_at: null,
  completed_at: null,
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T10:00:00.000Z',
  media_url: null,
  media_type: null,
  scheduled_at: '2026-12-01T15:00:00.000Z',
  schedule_timezone: 'America/Sao_Paulo',
  send_window_start: null,
  send_window_end: null,
  business_hours_only: false,
  speed_profile: 'moderate',
  revision: 1,
};

function view() {
  return (
    <TalkXCampaignScheduled
      campaignId="camp-agendada-1"
      onBack={onBack}
      onEdit={onEdit}
      onStatusChange={onStatusChange}
    />
  );
}

function abrirTela(overrides: Record<string, unknown> = {}) {
  h.campaigns = [{ ...BASE_CAMPAIGN, ...overrides }];
  return render(view());
}

function timeField() {
  return document.getElementById('talkx-schedule-time') as HTMLInputElement;
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  h.updateCampaign.mutateAsync.mockResolvedValue({ ...BASE_CAMPAIGN, updated_at: '2026-10-02T00:00:00.000Z' });
  h.startCampaign.mockResolvedValue(true);
  h.connection = { status: 'connected', label: 'Conectada', loading: false };
});

describe('Agendada — "Iniciar agora" / "Salvar agendamento" não descartam nem sobrescrevem em silêncio (QA X140)', () => {
  it('bug 1: edição não salva bloqueia "Iniciar agora" (não abre o diálogo de disparo)', () => {
    abrirTela();

    // Operador mexe no horário e NÃO clica em "Salvar agendamento".
    fireEvent.change(timeField(), { target: { value: '23:45' } });

    fireEvent.click(screen.getByRole('button', { name: /Iniciar agora/ }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(h.startCampaign).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Salve o agendamento'));
  });

  it('sem edição pendente e sem pendência, "Iniciar agora" continua abrindo o diálogo normalmente', () => {
    abrirTela();

    fireEvent.click(screen.getByRole('button', { name: /Iniciar agora/ }));

    expect(screen.getByRole('alertdialog').textContent).toContain('Confirmar disparo?');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('bug 3: pendência real (mensagem vazia) bloqueia "Iniciar agora" sem abrir o diálogo', () => {
    abrirTela({ message_template: '' });

    fireEvent.click(screen.getByRole('button', { name: /Iniciar agora/ }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(h.startCampaign).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('mensagem da campanha está vazia'));
  });

  it('bug 2: campanha alterada em outra aba/sessão bloqueia "Salvar agendamento" (concorrência otimista)', () => {
    const rendered = abrirTela();

    // Outra sessão salva a MESMA campanha nesse meio tempo: o `updated_at`
    // chega atualizado por realtime, sem a tela ser remontada (mesmo `id`).
    h.campaigns = [{ ...BASE_CAMPAIGN, send_interval_min: 9000, updated_at: '2026-10-01T11:00:00.000Z' }];
    rendered.rerender(view());

    fireEvent.click(screen.getByRole('button', { name: /Salvar agendamento/i }));

    expect(h.updateCampaign.mutateAsync).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('alterada em outra aba'));
  });

  it('sem alteração concorrente, "Salvar agendamento" continua salvando normalmente', () => {
    abrirTela();

    fireEvent.click(screen.getByRole('button', { name: /Salvar agendamento/i }));

    expect(h.updateCampaign.mutateAsync).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });
});
