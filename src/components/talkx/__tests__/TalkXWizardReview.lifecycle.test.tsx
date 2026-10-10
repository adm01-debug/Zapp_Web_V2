import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

/**
 * TL-054/6 (X051) — o passo de revisão do wizard (`TalkXWizardReview`) resolve o
 * DISPARO pelo controlador ÚNICO de ciclo de vida (`useTalkXLifecycle`): o
 * `<Dialog>` azul de confirmação da própria tela saiu de cena e entrou um só
 * `<TalkXLifecycleDialog controller={lifecycle} />`.
 *
 * O teste renderiza o componente REAL com o hook REAL (só `useTalkX`, a porta
 * das operações, é espiado) e clica como o usuário clica. O que prova a troca é
 * o comportamento que só o diálogo do kit tem:
 *  - o papel de acessibilidade é `alertdialog` (o modal próprio da tela era
 *    `dialog`), com o confirmar do kit ("Confirmar envio") no lugar do antigo
 *    ("Confirmar lançamento");
 *  - abrir a confirmação NÃO salva nem dispara: quem dispara é o confirmar;
 *  - o confirmar chama o executor PRÓPRIO do wizard (`ed.handleSave`, que salva
 *    o rascunho e gera o snapshot) e NUNCA a `startCampaign` direta — chamá-la
 *    pularia o salvamento;
 *  - a recusa (`handleSave` devolvendo `null`/`undefined`) e o erro lançado
 *    viram alerta DENTRO do diálogo aberto, em vez de fechar como se tivesse
 *    dado certo;
 *  - o diálogo não fecha enquanto o salvamento está pendente.
 */

const h = vi.hoisted(() => ({
  startCampaign: vi.fn(),
  pauseCampaign: vi.fn(),
  cancelCampaign: vi.fn(),
  updateCampaign: { mutateAsync: vi.fn() },
  handleSave: vi.fn(),
}));

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    startCampaign: h.startCampaign,
    pauseCampaign: h.pauseCampaign,
    cancelCampaign: h.cancelCampaign,
    updateCampaign: h.updateCampaign,
  }),
}));

vi.mock('@/hooks/crm/useContactCustomFields', () => ({
  useContactCustomFields: () => ({ fields: [] }),
}));

import { TalkXWizardReview } from '../TalkXWizardDelivery';
import type { WizardState } from '../TalkXCampaignWizard';

const onLaunched = vi.fn();

/** `ed` mínimo só para renderizar a revisão (mesma forma dos testes irmãos). */
function reviewEd(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Campanha X051', description: '', objective: 'sales',
    audienceSource: 'contacts', selectedSegment: null,
    selectedContacts: [], eligibleCount: 1200, audienceTotal: 1400,
    respectSuppression: true, suppressedCount: 40,
    selectedTemplate: null, messageTemplate: 'Oi {{nome}}',
    speedProfile: 'normal', messagesPerMinute: 20, estimatedTime: '1 h',
    isScheduled: false, scheduledAt: '', scheduleTimezone: 'America/Sao_Paulo',
    sendWindowEnabled: false, sendWindowStart: '08:00', sendWindowEnd: '18:00',
    businessHoursOnly: false,
    connectionId: 'c1', connections: [{ id: 'c1', name: 'Conexão', phone_number: '5511999999999' }],
    contacts: [],
    confirmConsent: true, confirmContent: true, confirmSuppression: true,
    canProceed: { 1: true, 2: true, 3: true, 4: true },
    saving: false, hasMedia: false, mediaUrl: '', mediaType: null,
    handleSave: h.handleSave, setStep: vi.fn(),
    ...overrides,
  } as unknown as WizardState;
}

function abrirRevisao(overrides: Record<string, unknown> = {}) {
  return render(
    <TalkXWizardReview ed={reviewEd(overrides)} campaign={null} onLaunched={onLaunched} />,
  );
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  h.handleSave.mockResolvedValue('draft-novo');
});

describe('Revisão do wizard — disparo pelo controlador único (X051)', () => {
  it('abre o diálogo do kit (não o modal próprio da tela) e só dispara no confirmar, pelo executor do wizard', async () => {
    abrirRevisao();

    fireEvent.click(screen.getByRole('button', { name: 'Lançar campanha' }));

    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo.textContent).toContain('Confirmar disparo?');
    // o modal próprio da tela saiu de cena: nem `dialog`, nem o rótulo antigo
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(dialogo).queryByRole('button', { name: 'Confirmar lançamento' })).toBeNull();
    // abrir a confirmação não é salvar nem disparar
    expect(h.handleSave).not.toHaveBeenCalled();
    expect(h.startCampaign).not.toHaveBeenCalled();

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar envio' }));

    await waitFor(() => expect(h.handleSave).toHaveBeenCalledWith('launch'));
    await waitFor(() => expect(onLaunched).toHaveBeenCalledWith('draft-novo', 'sending'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    // o executor próprio do wizard substitui a `startCampaign` no `kind: 'start'`
    expect(h.startCampaign).not.toHaveBeenCalled();
  });

  it('mostra as linhas de detalhe do pedido (Segmento / Destinatários / Envio)', async () => {
    abrirRevisao();

    fireEvent.click(screen.getByRole('button', { name: 'Lançar campanha' }));
    const dialogo = await screen.findByRole('alertdialog');

    expect(within(dialogo).getByText('Segmento')).toBeInTheDocument();
    expect(within(dialogo).getByText('Contatos ZAPP')).toBeInTheDocument();
    expect(within(dialogo).getByText('Destinatários')).toBeInTheDocument();
    expect(within(dialogo).getByText('1.200 contatos')).toBeInTheDocument();
    expect(within(dialogo).getByText('Envio')).toBeInTheDocument();
    expect(within(dialogo).getByText('Imediato')).toBeInTheDocument();
    // "Mensagens (N variações)" depende do preset `confirmarDisparo` (X049) e de
    // `talkx_template_variants`, que `ed` não expõe — o cartão manda seguir sem.
  });

  it('público por segmento: a linha "Segmento" traz o nome do segmento e o alvo leva o público', async () => {
    abrirRevisao({ audienceSource: 'segment', selectedSegment: { id: 's1', name: 'VIP Outubro' } });

    fireEvent.click(screen.getByRole('button', { name: 'Lançar campanha' }));
    const dialogo = await screen.findByRole('alertdialog');

    expect(within(dialogo).getByText('VIP Outubro')).toBeInTheDocument();
    expect(within(dialogo).queryByText('Contatos ZAPP')).toBeNull();
  });

  it('agendado: o detalhe mostra a data e o executor salva com `schedule`', async () => {
    abrirRevisao({ isScheduled: true, scheduledAt: '2026-12-01T15:00' });

    fireEvent.click(screen.getByRole('button', { name: 'Agendar campanha' }));
    const dialogo = await screen.findByRole('alertdialog');
    expect(within(dialogo).getByText('01/12/2026 15:00 (America/Sao_Paulo)')).toBeInTheDocument();

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar envio' }));

    await waitFor(() => expect(h.handleSave).toHaveBeenCalledWith('schedule'));
    await waitFor(() => expect(onLaunched).toHaveBeenCalledWith('draft-novo', 'scheduled'));
  });

  it('recusa do salvamento mantém o diálogo aberto com o erro do hook e não navega', async () => {
    h.handleSave.mockResolvedValue(null);
    abrirRevisao();

    fireEvent.click(screen.getByRole('button', { name: 'Lançar campanha' }));
    const dialogo = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar envio' }));

    await waitFor(() =>
      expect(within(dialogo).getByRole('alert').textContent).toContain('O envio não foi aceito'),
    );
    expect(screen.getByRole('alertdialog')).toBe(dialogo);
    expect(onLaunched).not.toHaveBeenCalled();
  });

  it('erro do executor aparece no diálogo aberto em vez de fechar em silêncio', async () => {
    h.handleSave.mockRejectedValue(new Error('Falha ao salvar o rascunho.'));
    abrirRevisao();

    fireEvent.click(screen.getByRole('button', { name: 'Lançar campanha' }));
    const dialogo = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar envio' }));

    await waitFor(() =>
      expect(within(dialogo).getByRole('alert').textContent).toContain('Falha ao salvar o rascunho.'),
    );
    expect(screen.getByRole('alertdialog')).toBe(dialogo);
    expect(onLaunched).not.toHaveBeenCalled();
  });

  it('enquanto o salvamento está pendente o confirmar vira "Iniciando…", trava os botões e o diálogo não fecha', async () => {
    let liberar: (v: unknown) => void = () => {};
    h.handleSave.mockImplementation(
      () => new Promise((resolve) => { liberar = resolve; }),
    );
    abrirRevisao();

    fireEvent.click(screen.getByRole('button', { name: 'Lançar campanha' }));
    const dialogo = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar envio' }));

    const pendente = await within(dialogo).findByRole('button', { name: /Iniciando/ });
    expect(pendente).toHaveProperty('disabled', true);
    expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('alertdialog')).toBe(dialogo);

    await act(async () => { liberar('draft-novo'); });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(onLaunched).toHaveBeenCalledWith('draft-novo', 'sending');
  });
});
