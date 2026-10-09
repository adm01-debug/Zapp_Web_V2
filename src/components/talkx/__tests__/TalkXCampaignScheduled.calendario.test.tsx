import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import React from 'react';

/**
 * X138 (TL-150) — coluna central da tela 10.
 *
 * Antes desta correção o calendário não recebia `locale` (o cabeçalho saía
 * "October 2026" e os dias da semana em inglês), aceitava qualquer data passada
 * (o único limite era o `min` do campo de texto, calculado em UTC) e o
 * "Resumo da Programação" eram cinco linhas soltas, sem o marco "configurada" e
 * sem previsão de conclusão.
 *
 * O relógio fica congelado em 09/10/2026 12:00 em São Paulo para que o limite
 * "antes de hoje" seja verificável, e o caso Manaus 23:30 amarra o dia marcado à
 * parede local da CAMPANHA — o processo de teste roda em outro fuso.
 */

const h = vi.hoisted(() => ({
  state: { campaigns: [] as Array<Record<string, unknown>> },
  onBack: vi.fn(),
  onEdit: vi.fn(),
  onStatusChange: vi.fn(),
}));

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: h.state.campaigns,
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetchCampaigns: vi.fn(),
    updateCampaign: { mutateAsync: vi.fn() },
    startCampaign: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { TalkXCampaignScheduled } from '../TalkXCampaignScheduled';

const BASE_CAMPAIGN = {
  id: 'camp-agendada-x138',
  name: 'Black Friday VIP',
  message_template: 'Olá {{nome}}, a Black Friday chegou!',
  variables_config: [],
  typing_delay_min: 1500,
  typing_delay_max: 4000,
  send_interval_min: 8000,
  send_interval_max: 20000,
  status: 'scheduled',
  total_recipients: 1180,
  sent_count: 0,
  failed_count: 0,
  delivered_count: 0,
  whatsapp_connection_id: 'conn-1',
  created_by: 'user-1',
  started_at: null,
  completed_at: null,
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-08T21:00:00.000Z',
  media_url: null,
  media_type: null,
  scheduled_at: '2026-10-20T12:00:00.000Z',
  schedule_timezone: 'America/Sao_Paulo',
  send_window_start: null,
  send_window_end: null,
  business_hours_only: false,
  speed_profile: 'moderate',
  revision: 2,
};

function view() {
  return (
    <TalkXCampaignScheduled
      campaignId="camp-agendada-x138"
      onBack={h.onBack}
      onEdit={h.onEdit}
      onStatusChange={h.onStatusChange}
    />
  );
}

/** Botão de um dia do calendário (`name="day"` no react-day-picker 8). */
function dayButton(label: string): HTMLButtonElement {
  const matches = Array.from(document.querySelectorAll<HTMLButtonElement>('button[name="day"]'))
    .filter((button) => button.textContent === label);
  if (matches.length !== 1) throw new Error(`esperava 1 botão para o dia ${label}, achei ${matches.length}`);
  return matches[0];
}

describe('X138 — calendário em português e resumo em linha do tempo (tela 10)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-09T15:00:00.000Z')); // 09/10/2026 12:00 em São Paulo
    h.state.campaigns = [BASE_CAMPAIGN];
    h.onBack.mockClear();
    h.onEdit.mockClear();
    h.onStatusChange.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mostra o mês por extenso e os dias da semana em português', () => {
    render(view());

    expect(screen.getByText('Outubro de 2026')).toBeTruthy();
    // Abreviações do próprio locale pt-BR do date-fns (sábado sai "Sab").
    for (const dia of ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']) {
      expect(screen.getByText(dia)).toBeTruthy();
    }
  });

  it('desabilita os dias anteriores a hoje no fuso da campanha e mantém hoje clicável', () => {
    render(view());

    expect(dayButton('8').disabled).toBe(true);
    expect(dayButton('7').disabled).toBe(true);
    expect(dayButton('9').disabled).toBe(false);
  });

  it('marca o dia do horário local da campanha (23:30 em Manaus) mesmo com o navegador em outro fuso', () => {
    h.state.campaigns = [{
      ...BASE_CAMPAIGN,
      schedule_timezone: 'America/Manaus',
      // 21/10 03:30 UTC = 20/10 23:30 em Manaus (UTC-4).
      scheduled_at: '2026-10-21T03:30:00.000Z',
    }];
    render(view());

    expect(dayButton('20').getAttribute('aria-selected')).toBe('true');
    expect(dayButton('21').getAttribute('aria-selected')).not.toBe('true');
    // o mesmo dia e a mesma hora aparecem no marco da linha do tempo
    expect(screen.getByText(/20\/10\/2026 • 23:30/)).toBeTruthy();
  });

  it('troca o resumo em linhas soltas pela linha do tempo com os marcos do mock', () => {
    h.state.campaigns = [{
      ...BASE_CAMPAIGN,
      scheduled_at: '2026-11-27T12:00:00.000Z',
      schedule_timezone: 'America/Sao_Paulo',
      updated_at: '2026-11-26T21:00:00.000Z',
      send_window_start: '09:00:00',
      send_window_end: '18:00:00',
    }];
    const { container } = render(view());

    const timeline = container.querySelector('[data-talkx-schedule-timeline]') as HTMLElement;
    expect(timeline).toBeTruthy();
    const configured = document.querySelector('[data-talkx-milestone="configured"]') as HTMLElement;
    const start = document.querySelector('[data-talkx-milestone="start"]') as HTMLElement;
    const window_ = document.querySelector('[data-talkx-milestone="window"]') as HTMLElement;

    expect(configured.textContent).toContain('26/11/2026 • 18:00');
    expect(configured.textContent).toContain('Campanha configurada e aguardando início');
    expect(start.textContent).toContain('27/11/2026 • 09:00');
    expect(start.textContent).toContain('Início dos envios');
    expect(start.textContent).toContain('Black Friday VIP');
    expect(window_.textContent).toContain('27/11/2026 • 09:00 - 18:00');
    expect(window_.textContent).toContain('Janela de envio ativa');
    // nada do que a coluna mostrava antes saiu da tela
    expect(within(timeline).getByText('Fuso')).toBeTruthy();
    expect(within(timeline).getByText('America/Sao_Paulo')).toBeTruthy();
    expect(within(timeline).getByText('1.180 contatos')).toBeTruthy();
  });
});
