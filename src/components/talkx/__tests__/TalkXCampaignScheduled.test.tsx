import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

/**
 * X137 (TL-149) — Tela 10: Data, horário, fuso, janela, throttle e supressão; salvar.
 *
 * O que estes casos fixam, e o defeito que cada um pega:
 *
 * 1. A data e o horário vêm em CAMPOS SEPARADOS, derivados do instante gravado
 *    no fuso da campanha. Antes havia um único `datetime-local` cujo `min` saía
 *    de `new Date().toISOString()` (relógio UTC): numa campanha em America/Manaus
 *    (UTC-4) o operador podia escolher um dia já passado, e a parede local só
 *    era reconstruída depois do save.
 * 2. "Salvar agendamento" grava pela RPC `save_talkx_campaign_draft` (revisão
 *    otimista) e não por UPDATE parcial direto — o instante e o fuso voltam
 *    idênticos aos que foram lidos.
 * 3. Conflito de revisão NÃO anuncia sucesso: a tela pede para recarregar.
 * 4. O cartão do throttle mostra o intervalo real do perfil escolhido e o
 *    payload leva exatamente esse par (ms), como o motor lê.
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
  saveDraft: vi.fn(),
  updateAsync: vi.fn(),
  startCampaign: vi.fn(),
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
    isError: false,
    error: null,
    isFetching: false,
    refetchCampaigns: h.refetch,
    updateCampaign: { mutateAsync: h.updateAsync },
    saveDraftCampaign: { mutateAsync: h.saveDraft },
    startCampaign: h.startCampaign,
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
  objective: 'vendas',
  audience_source: 'contacts',
  audience_filters: { search: '', contact_ids: ['c1'] },
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
  h.saveDraft.mockReset();
  h.saveDraft.mockResolvedValue({ campaignId: 'camp-agendada-1', revision: 8, creationReplayed: false });
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

    expect(dateField().value).toBe('2030-06-09');
    expect(timeField().value).toBe('22:30');
    // A data/hora UTC (10/06 02:30) NÃO pode aparecer como se fosse a local.
    expect(dateField().value).not.toBe('2030-06-10');
    expect(timeField().value).not.toBe('02:30');
  });

  it('o mínimo da data é hoje NO FUSO DA CAMPANHA, não hoje em UTC', () => {
    // 10/06/2030 02:30 UTC = 09/06/2030 no relógio da campanha (UTC-4).
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2030-06-10T02:30:00.000Z'));
      render(view());

      expect(dateField().getAttribute('min')).toBe('2030-06-09');
      expect(dateField().getAttribute('min')).not.toBe('2030-06-10');
    } finally {
      vi.useRealTimers();
    }
  });

  it('salvar grava o mesmo instante e o mesmo fuso que foram lidos, com a revisão corrente', async () => {
    render(view());
    fireEvent.click(screen.getByRole('button', { name: /Salvar agendamento/i }));

    await waitFor(() => expect(h.saveDraft).toHaveBeenCalledTimes(1));
    const chamada = h.saveDraft.mock.calls[0][0];
    expect(chamada.campaignId).toBe('camp-agendada-1');
    expect(chamada.expectedRevision).toBe(7);
    expect(chamada.payload.scheduled_at).toBe(MANAUS_UTC_INSTANT);
    expect(chamada.payload.schedule_timezone).toBe('America/Manaus');
    // O que a RPC sobrescreve veio junto: sem isso os DEFAULTs da função
    // apagariam mensagem, público e limites gravados.
    expect(chamada.payload.message_template).toBe(CAMPAIGN.message_template);
    expect(chamada.payload.audience_filters).toEqual(CAMPAIGN.audience_filters);
    expect(chamada.payload.typing_delay_min).toBe(1500);
    expect(chamada.payload.speed_profile).toBe('slow');
    // X137: "Editar no wizard" reabre pelo `draft_step` gravado — deixá-lo em 3
    // (entrega) faz o botão desta tela cair exatamente na coluna ajustada aqui.
    expect(chamada.payload.draft_step).toBe(3);
    expect(h.toastSuccess).toHaveBeenCalledWith('Agendamento atualizado.');
  });

  it('depois de salvar, o próximo save usa a revisão que o banco devolveu', async () => {
    render(view());
    fireEvent.click(screen.getByRole('button', { name: /Salvar agendamento/i }));
    await waitFor(() => expect(h.saveDraft).toHaveBeenCalledTimes(1));
    // O mock da RPC devolve a revisão 8 para a linha lida na revisão 7.
    expect(h.saveDraft.mock.calls[0][0].expectedRevision).toBe(7);

    fireEvent.click(screen.getByRole('button', { name: /Salvar agendamento/i }));
    await waitFor(() => expect(h.saveDraft).toHaveBeenCalledTimes(2));
    expect(h.saveDraft.mock.calls[1][0].expectedRevision).toBe(8);
  });

  it('conflito de revisão pede para recarregar e não anuncia sucesso', async () => {
    h.saveDraft.mockRejectedValueOnce(new Error('talkx_campaign_stale_revision'));
    render(view());
    fireEvent.click(screen.getByRole('button', { name: /Salvar agendamento/i }));

    await waitFor(() => expect(h.toastError).toHaveBeenCalled());
    expect(await screen.findByRole('alert')).toHaveTextContent(/recarregue/i);
    expect(h.toastSuccess).not.toHaveBeenCalled();
    expect(h.toastError).toHaveBeenCalledWith(expect.stringMatching(/recarregue/i));
  });

  it('o cartão do throttle mostra o intervalo real do perfil escolhido', async () => {
    render(view());
    expect(screen.getByText(/15–30s entre mensagens/)).toBeTruthy();

    escolherVelocidade('Rápida');
    expect(screen.getByText(/3–8s entre mensagens/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Salvar agendamento/i }));
    await waitFor(() => expect(h.saveDraft).toHaveBeenCalledTimes(1));
    const payload = h.saveDraft.mock.calls[0][0].payload;
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

  it('a supressão aparece marcada e travada, e o consentimento é editável', () => {
    render(view());

    const supressao = document.getElementById('talkx-respect-suppression') as HTMLInputElement;
    expect(supressao).toBeTruthy();
    expect(supressao.hasAttribute('disabled')).toBe(true);
    expect(supressao.getAttribute('aria-checked')).toBe('true');

    const consentimento = document.getElementById('talkx-confirm-consent') as HTMLElement;
    expect(consentimento.getAttribute('aria-checked')).toBe('true');
    expect(consentimento.hasAttribute('disabled')).toBe(false);
  });

  it('"Iniciar agora" usa o modal do kit e só dispara ao confirmar', async () => {
    render(view());
    fireEvent.click(screen.getByRole('button', { name: /Iniciar agora/i }));

    const modal = await screen.findByRole('alertdialog');
    expect(modal).toHaveTextContent('Iniciar campanha agora?');
    // O modal do kit detalha o alvo do disparo (o AlertDialog antigo só repetia o texto).
    expect(modal).toHaveTextContent('Destinatários');
    expect(modal).toHaveTextContent('1.200 contatos');
    expect(h.startCampaign).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Confirmar e iniciar/i }));
    await waitFor(() => expect(h.startCampaign).toHaveBeenCalledWith('camp-agendada-1'));
  });
});
