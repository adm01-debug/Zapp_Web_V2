// A14/TZ: o fuso do PROCESSO (o "navegador" do teste) fica fixo em São Paulo
// ANTES de qualquer `Date`, para que o piso do campo de data tenha de vir da
// parede da CAMPANHA e não do relógio local — sem isso os dois fusos
// coincidiriam e o teste não provaria nada.
process.env.TZ = 'America/Sao_Paulo';

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

/**
 * TL-150 — cobertura que faltava nos dois caminhos de produção da tela 10:
 *   1. o `min` do CAMPO de data (não só o piso do calendário) tem de ser "hoje"
 *      na parede local da campanha: antes o limite saía do relógio em UTC, o que
 *      liberava um dia já passado quando a campanha estava em fuso à frente;
 *   2. a linha do tempo nunca fica vazia (A12): sem `scheduled_at`, sem
 *      `updated_at`, sem janela e sem público, ainda aparece o marco que diz que
 *      a campanha espera data e horário.
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

vi.mock('@/hooks/integrations/useTalkXConnectionStatus', () => ({
  useTalkXConnectionStatus: () => ({ status: 'connected', label: 'Conectada', loading: false }),
}));

import { TalkXCampaignScheduled } from '../TalkXCampaignScheduled';

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

const BASE_CAMPAIGN = {
  id: 'camp-agendada-tl150',
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
      campaignId="camp-agendada-tl150"
      onBack={h.onBack}
      onEdit={h.onEdit}
      onStatusChange={h.onStatusChange}
    />
  );
}

function milestone(key: string): HTMLElement {
  const el = document.querySelector(`[data-talkx-milestone="${key}"]`) as HTMLElement | null;
  if (!el) throw new Error(`marco ${key} ausente na linha do tempo`);
  return el;
}

describe('TL-150 — piso do campo de data e linha do tempo nunca vazia (tela 10)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-09T23:30:00.000Z'));
    h.state.campaigns = [BASE_CAMPAIGN];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('A14: o min do campo de data é hoje na parede da CAMPANHA, não a do navegador', () => {
    // 09/10/2026 23:30 UTC = 10/10 00:30 em Londres (BST) e 09/10 20:30 em São
    // Paulo. O navegador está no dia 09; a campanha, no dia 10 — o limite do
    // campo tem de ser o dia da CAMPANHA.
    expect(new Date('2026-10-09T23:30:00.000Z').getHours()).toBe(20);
    h.state.campaigns = [{ ...BASE_CAMPAIGN, schedule_timezone: 'Europe/London' }];

    render(view());

    const dateInput = document.getElementById('talkx-schedule-date') as HTMLInputElement;
    expect(dateInput.min).toBe('2026-10-10');
    expect(dateInput.min).not.toBe('2026-10-09');
    expect(dateInput.value).toBe('2026-10-20');
    expect(screen.getByLabelText('Data de início')).toBe(dateInput);
  });

  it('A12: sem data gravada, sem edição e sem público, a linha do tempo não fica vazia', () => {
    h.state.campaigns = [{
      ...BASE_CAMPAIGN,
      scheduled_at: null,
      updated_at: null,
      total_recipients: 0,
    }];

    render(view());

    const marco = milestone('configured');
    expect(marco.textContent).toContain('aguardando data e horário');
    expect(marco.textContent).toContain('America/Sao_Paulo');
    expect(document.querySelector('[data-talkx-milestone="start"]')).toBeNull();
    expect(document.querySelector('[data-talkx-milestone="eta"]')).toBeNull();
  });
});
