import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

/**
 * TL-054/5 (X051) — a tela "Agendada" (`TalkXCampaignScheduled`) resolve o
 * DISPARO pelo controlador ÚNICO de ciclo de vida (`useTalkXLifecycle`): saíram
 * o `AlertDialog` local de "Iniciar agora" e os estados `launchOpen`/`launching`
 * /`handleLaunch`.
 *
 * O teste renderiza o componente REAL com o hook REAL (só `useTalkX`, a porta
 * das operações, é espiado) e clica como o usuário clica. O que prova a troca é
 * o comportamento que só o diálogo do kit tem:
 *  - o título e o confirmar do kit ("Confirmar disparo?" / "Confirmar envio")
 *    no lugar do diálogo local ("Iniciar campanha agora?" / "Confirmar e iniciar");
 *  - abrir a confirmação NÃO dispara: quem dispara é o confirmar;
 *  - o confirmar fica PENDENTE ("Iniciando…") e trava os botões do diálogo;
 *  - a recusa do envio (`startCampaign` devolve `false`) vira alerta DENTRO do
 *    diálogo aberto, em vez de fechar como se tivesse dado certo.
 *
 * O "Cancelar agendamento" (devolve a campanha para Rascunhos) segue no fluxo
 * local porque o hook não expõe essa ação; o último caso trava esse
 * comportamento para a metade que NÃO mudou neste cartão.
 */

const h = vi.hoisted(() => ({
  campaigns: [] as Array<Record<string, unknown>>,
  startCampaign: vi.fn(),
  pauseCampaign: vi.fn(),
  cancelCampaign: vi.fn(),
  updateCampaign: { mutateAsync: vi.fn() },
  refetchCampaigns: vi.fn(),
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
    refetchCampaigns: h.refetchCampaigns,
    updateCampaign: h.updateCampaign,
    startCampaign: h.startCampaign,
    pauseCampaign: h.pauseCampaign,
    cancelCampaign: h.cancelCampaign,
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { TalkXCampaignScheduled } from '../TalkXCampaignScheduled';

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

/** Abre a tela com a campanha agendada carregada. */
function abrirTela() {
  h.campaigns = [BASE_CAMPAIGN];
  return render(
    <TalkXCampaignScheduled
      campaignId="camp-agendada-1"
      onBack={onBack}
      onEdit={onEdit}
      onStatusChange={onStatusChange}
    />,
  );
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  h.updateCampaign.mutateAsync.mockResolvedValue({});
});

describe('Agendada — disparo pelo controlador único (X051)', () => {
  it('"Iniciar agora" abre o diálogo do kit e o confirmar dispara pela `startCampaign`', async () => {
    h.startCampaign.mockResolvedValue(true);
    abrirTela();
    expect(screen.getByText(/Agendada para/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Iniciar agora/ }));

    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo.textContent).toContain('Confirmar disparo?');
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    // o diálogo local da tela saiu de cena
    expect(screen.queryByText('Iniciar campanha agora?')).toBeNull();
    expect(within(dialogo).queryByRole('button', { name: 'Confirmar e iniciar' })).toBeNull();
    // abrir a confirmação não é disparar
    expect(h.startCampaign).not.toHaveBeenCalled();

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar envio' }));

    await waitFor(() => expect(h.startCampaign).toHaveBeenCalledWith('camp-agendada-1'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('disparo em andamento: o confirmar vira "Iniciando…", trava os botões e mantém o diálogo aberto', async () => {
    let liberar: (v: unknown) => void = () => {};
    h.startCampaign.mockImplementation(
      () => new Promise((resolve) => { liberar = resolve; }),
    );
    abrirTela();

    fireEvent.click(screen.getByRole('button', { name: /Iniciar agora/ }));
    const dialogo = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar envio' }));

    const pendente = await within(dialogo).findByRole('button', { name: /Iniciando/ });
    expect(pendente).toHaveProperty('disabled', true);
    expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toHaveProperty('disabled', true);
    // o botão da tela também reflete a pendência do controlador (diálogo + tela);
    // o diálogo modal esconde o resto da página da árvore de acessibilidade,
    // por isso `hidden: true` na contagem
    expect(screen.getAllByRole('button', { name: /Iniciando/, hidden: true })).toHaveLength(2);
    // e o diálogo não fecha no meio da ação
    expect(screen.getByRole('alertdialog')).toBe(dialogo);

    await act(async () => { liberar(true); });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('recusa do envio (startCampaign devolve false) vira alerta no diálogo aberto, sem voltar de tela', async () => {
    h.startCampaign.mockResolvedValue(false);
    abrirTela();

    fireEvent.click(screen.getByRole('button', { name: /Iniciar agora/ }));
    const dialogo = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar envio' }));

    await waitFor(() =>
      expect(within(dialogo).getByRole('alert').textContent).toContain('O envio não foi aceito'),
    );
    expect(screen.getByRole('alertdialog')).toBe(dialogo);
    expect(onStatusChange).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('"Cancelar agendamento" (metade que NÃO mudou) segue devolvendo a campanha para rascunho', async () => {
    abrirTela();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar agendamento' }));
    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo.textContent).toContain('Cancelar agendamento?');

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar agendamento' }));

    await waitFor(() =>
      expect(h.updateCampaign.mutateAsync).toHaveBeenCalledWith({
        id: 'camp-agendada-1',
        scheduled_at: null,
        status: 'draft',
      }),
    );
    await waitFor(() => expect(onBack).toHaveBeenCalled());
  });
});
