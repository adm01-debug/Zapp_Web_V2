import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

/**
 * X137 (TL-149) — Tela 10: data, horário, fuso, janela, throttle e supressão;
 * salvar.
 *
 * O que estes casos fixam, e o defeito que cada um pega:
 *
 * 1. A data e o horário vêm em CAMPOS SEPARADOS, derivados do instante gravado
 *    na parede local do fuso da campanha. Antes havia um único `datetime-local`
 *    cujo `min` saía de `new Date().toISOString()` (relógio UTC): numa campanha
 *    em America/Manaus (UTC-4) o operador podia escolher um dia já passado.
 * 2. O `min` da data é "hoje" NO FUSO DA CAMPANHA, não hoje em UTC.
 * 3. "Salvar agendamento" leva ao banco o MESMO instante e o MESMO fuso que
 *    foram lidos, mais o perfil de velocidade, o intervalo real (ms) e a
 *    supressão/consentimento — o que a coluna edita é o que a tela grava.
 * 4. O cartão do throttle mostra o intervalo real do perfil escolhido e o
 *    payload leva exatamente esse par, como o motor o lê.
 * 5. A janela de envio passa a mostrar o cartão do período, citando o horário
 *    do próprio campo (não um texto fixo).
 * 6. A supressão aparece marcada e travada (quem libera é o banco) e o
 *    consentimento é editável.
 *
 * A tela continua derivando o disparo do controlador único de ciclo de vida
 * (X051) — o comportamento do diálogo "Iniciar agora" fica travado em
 * `TalkXCampaignScheduled.lifecycle.test.tsx`; aqui só se prova a COLUNA.
 */

// O jsdom não implementa captura de ponteiro; o gatilho do Select (Radix) chama
// `hasPointerCapture` no pointerdown que o abre.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

const h = vi.hoisted(() => ({
  campaigns: [] as Array<Record<string, unknown>>,
  refetch: vi.fn(),
  updateAsync: vi.fn(),
  startCampaign: vi.fn(),
  pauseCampaign: vi.fn(),
  cancelCampaign: vi.fn(),
  onBack: vi.fn(),
  onEdit: vi.fn(),
  onStatusChange: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
}));

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: h.campaigns,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetchCampaigns: h.refetch,
    updateCampaign: { mutateAsync: h.updateAsync },
    startCampaign: h.startCampaign,
    pauseCampaign: h.pauseCampaign,
    cancelCampaign: h.cancelCampaign,
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: h.toastSuccess, error: h.toastError, info: h.toastInfo },
}));

import { TalkXCampaignScheduled } from '../TalkXCampaignScheduled';

// Manaus é UTC-4: 10/06/2030 02:30 UTC é 09/06/2030 22:30 na campanha.
const MANAUS_UTC_INSTANT = '2030-06-10T02:30:00.000Z';

const CAMPAIGN = {
  id: 'camp-agendada-1',
  name: 'Promoção de Outubro',
  message_template: 'Olá {{nome}}, chegou a promoção!',
  variables_config: [],
  typing_delay_min: 1500,
  typing_delay_max: 4500,
  send_interval_min: 15000,
  send_interval_max: 30000,
  status: 'scheduled',
  total_recipients: 1200,
  sent_count: 0,
  failed_count: 0,
  delivered_count: 0,
  whatsapp_connection_id: 'conn-1',
  created_by: 'user-1',
  started_at: null,
  completed_at: null,
  created_at: '2030-06-01T10:00:00.000Z',
  updated_at: '2030-06-01T10:00:00.000Z',
  media_url: null,
  media_type: null,
  scheduled_at: MANAUS_UTC_INSTANT,
  schedule_timezone: 'America/Manaus',
  send_window_start: null,
  send_window_end: null,
  business_hours_only: false,
  speed_profile: 'slow',
  respect_suppression: true,
  confirm_consent: true,
  revision: 7,
};

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

function dateField() {
  return document.getElementById('talkx-schedule-date') as HTMLInputElement;
}

function timeField() {
  return document.getElementById('talkx-schedule-time') as HTMLInputElement;
}

/** Abre o Select real do perfil de velocidade e escolhe o rótulo pedido. */
function escolherVelocidade(rotulo: string) {
  fireEvent.pointerDown(document.getElementById('talkx-speed-profile') as HTMLElement, {
    button: 0, ctrlKey: false, pointerType: 'mouse',
  });
  fireEvent.click(screen.getByRole('option', { name: rotulo }));
}

beforeEach(() => {
  h.campaigns = [CAMPAIGN];
  h.refetch.mockClear();
  h.updateAsync.mockReset();
  h.updateAsync.mockResolvedValue({});
  h.startCampaign.mockReset();
  h.startCampaign.mockResolvedValue(true);
  h.onBack.mockClear();
  h.onEdit.mockClear();
  h.onStatusChange.mockClear();
  h.toastSuccess.mockClear();
  h.toastError.mockClear();
  h.toastInfo.mockClear();
});

describe('Tela 10 — configurações de agendamento (X137)', () => {
  it('separa data e horário na parede local do fuso da campanha', () => {
    render(view());

    expect(dateField()).toBeTruthy();
    expect(dateField().value).toBe('2030-06-09');
    expect(timeField().value).toBe('22:30');
    // A data/hora UTC (10/06 02:30) NÃO pode aparecer como se fosse a local.
    expect(dateField().value).not.toBe('2030-06-10');
    expect(timeField().value).not.toBe('02:30');
  });

  it('o mínimo da data é hoje NO FUSO DA CAMPANHA, não hoje em UTC', () => {
    vi.useFakeTimers();
    try {
      // 10/06/2030 02:30 UTC = 09/06/2030 no relógio da campanha (UTC-4).
      vi.setSystemTime(new Date('2030-06-10T02:30:00.000Z'));
      render(view());

      expect(dateField().getAttribute('min')).toBe('2030-06-09');
      expect(dateField().getAttribute('min')).not.toBe('2030-06-10');
    } finally {
      vi.useRealTimers();
    }
  });

  it('salvar grava o mesmo instante e o mesmo fuso que foram lidos, com o perfil e a supressão', async () => {
    render(view());
    fireEvent.click(screen.getByRole('button', { name: /Salvar agendamento/i }));

    await waitFor(() => expect(h.updateAsync).toHaveBeenCalledTimes(1));
    const payload = h.updateAsync.mock.calls[0][0];
    expect(payload.id).toBe('camp-agendada-1');
    expect(payload.scheduled_at).toBe(MANAUS_UTC_INSTANT);
    expect(payload.schedule_timezone).toBe('America/Manaus');
    // X137: a coluna edita velocidade, intervalo e supressão — o save leva isso.
    expect(payload.speed_profile).toBe('slow');
    expect(payload.send_interval_min).toBe(15000);
    expect(payload.send_interval_max).toBe(30000);
    expect(payload.respect_suppression).toBe(true);
    expect(payload.confirm_consent).toBe(true);
    expect(h.toastSuccess).toHaveBeenCalledWith('Agendamento atualizado.');
  });

  it('editar o horário de início muda o instante gravado (mesma parede local)', async () => {
    render(view());
    fireEvent.change(timeField(), { target: { value: '23:45' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar agendamento/i }));

    await waitFor(() => expect(h.updateAsync).toHaveBeenCalledTimes(1));
    // 09/06/2030 23:45 em Manaus (UTC-4) = 10/06/2030 03:45 UTC.
    expect(h.updateAsync.mock.calls[0][0].scheduled_at).toBe('2030-06-10T03:45:00.000Z');
  });

  it('o cartão do throttle mostra o intervalo real do perfil escolhido', async () => {
    render(view());
    expect(screen.getByText(/15–30s entre mensagens/)).toBeTruthy();

    escolherVelocidade('Rápida');
    expect(screen.getByText(/3–8s entre mensagens/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Salvar agendamento/i }));
    await waitFor(() => expect(h.updateAsync).toHaveBeenCalledTimes(1));
    const payload = h.updateAsync.mock.calls[0][0];
    expect(payload.speed_profile).toBe('fast');
    expect(payload.send_interval_min).toBe(3000);
    expect(payload.send_interval_max).toBe(8000);
  });

  it('a janela de envio passa a mostrar o cartão do período', () => {
    render(view());
    expect(screen.queryByText(/Envios apenas neste período/)).toBeNull();

    const linhaJanela = screen.getByText('Janela de envio').closest('div')?.parentElement as HTMLElement;
    fireEvent.click(linhaJanela.querySelector('[role="switch"]') as HTMLElement);

    // O cartão diz o horário do próprio campo (08:00), não um texto fixo.
    expect(screen.getByText(/Envios apenas neste período/)).toBeTruthy();
    expect(screen.getByText(/próximo início \(08:00\)/)).toBeTruthy();
  });

  it('a supressão aparece marcada e travada, e o consentimento é editável', async () => {
    render(view());

    const supressao = document.getElementById('talkx-respect-suppression') as HTMLElement;
    expect(supressao).toBeTruthy();
    expect(supressao.hasAttribute('disabled')).toBe(true);
    expect(supressao.getAttribute('aria-checked')).toBe('true');

    const consentimento = document.getElementById('talkx-confirm-consent') as HTMLElement;
    expect(consentimento.getAttribute('aria-checked')).toBe('true');
    expect(consentimento.hasAttribute('disabled')).toBe(false);

    // Desmarcar o consentimento é do operador: o payload acompanha o campo.
    fireEvent.click(consentimento);
    await waitFor(() => expect(consentimento.getAttribute('aria-checked')).toBe('false'));

    fireEvent.click(screen.getByRole('button', { name: /Salvar agendamento/i }));
    await waitFor(() => expect(h.updateAsync).toHaveBeenCalledTimes(1));
    expect(h.updateAsync.mock.calls[0][0].confirm_consent).toBe(false);
  });
});

describe('Tela 10 — cabeçalho, selo e estado pronta para envio (TL-151)', () => {
  it('mostra o breadcrumb "Campanhas › Talk X › Campanha Agendada"', () => {
    const { container } = render(view());
    expect(container.textContent).toContain('Campanhas › Talk X › Campanha Agendada');
  });

  it('mostra o título "Campanha Agendada • {nome}"', () => {
    render(view());
    expect(screen.getByText('Campanha Agendada • Promoção de Outubro')).toBeTruthy();
  });

  it('mostra a descrição da campanha como subtítulo quando existe', () => {
    h.campaigns = [{ ...CAMPAIGN, description: 'Campanha de verão' }];
    render(view());
    expect(screen.getByText('Campanha de verão')).toBeTruthy();
  });

  it('mostra o selo com data no fuso da campanha (dd/mm • HH:mm)', () => {
    render(view());
    expect(screen.getByText(/Agendada para 09\/06 • 22:30/)).toBeTruthy();
  });

  it('mostra "pronta para ser enviada" quando não há bloqueio', () => {
    render(view());
    expect(screen.getByText(/Campanha pronta para ser enviada/)).toBeTruthy();
  });
});
