import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

vi.mock('@/hooks/crm/useContactCustomFields', () => ({
  useContactCustomFields: () => ({ fields: [] }),
}));

import { TalkXWizardReview } from '@/components/talkx/TalkXWizardDelivery';
import type { WizardState } from '@/components/talkx/TalkXCampaignWizard';

// X136 (plano Talk X V4, Tela 09): o disparo confirma no modal do kit
// (`TalkXConfirmDialog`), com as TRÊS confirmações DENTRO do modal, e
// "Confirmar lançamento" só habilita com as três marcadas. Antes o modal era um
// `Dialog` próprio que apenas repetia, como texto, o que estava marcado no
// cartão de fora. Estes testes são a trava: sem o modal do kit (sem caixas
// dentro dele e sem o texto do mock) eles quebram.

/** `ed` mínimo para renderizar a revisão (mesmo formato de TalkXView.route.test). */
function reviewEd(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Campanha X136', description: '', objective: 'sales',
    audienceSource: 'contacts', selectedSegment: null,
    selectedContacts: [], eligibleCount: 10, audienceTotal: 12,
    respectSuppression: true, suppressedCount: 2,
    selectedTemplate: null, messageTemplate: 'Oi {{nome}}',
    speedProfile: 'normal', messagesPerMinute: 20, estimatedTime: '5 min',
    isScheduled: false, scheduledAt: '', scheduleTimezone: 'America/Sao_Paulo',
    sendWindowEnabled: false, sendWindowStart: '08:00', sendWindowEnd: '18:00',
    businessHoursOnly: false,
    connectionId: 'c1', connections: [{ id: 'c1', name: 'Conexão', phone_number: '5511999999999' }],
    contacts: [],
    confirmConsent: true, confirmContent: true, confirmSuppression: true,
    canProceed: { 1: true, 2: true, 3: true, 4: true },
    saving: false, hasMedia: false, mediaUrl: '', mediaType: null,
    handleSave: vi.fn().mockResolvedValue('campaign-9'),
    setStep: vi.fn(),
    ...overrides,
  } as unknown as WizardState;
}

const modalOnLaunched = vi.fn();

/** Abre o modal de disparo pelo botão da revisão e devolve o modal. */
function openLaunchModal(ed: WizardState) {
  render(<TalkXWizardReview ed={ed} campaign={null} onLaunched={modalOnLaunched} />);
  fireEvent.click(screen.getByRole('button', { name: /(Lançar|Agendar) campanha/ }));
  return screen.getByRole('alertdialog');
}

afterEach(() => {
  vi.clearAllMocks();
  modalOnLaunched.mockClear();
});

describe('TalkXWizardReview — "Confirmar disparo?" pelo modal do kit (X136)', () => {
  it('traz as três caixas DENTRO do modal e o texto do mock', () => {
    const modal = openLaunchModal(reviewEd());

    expect(within(modal).getByText('Confirmar disparo?')).toBeInTheDocument();
    expect(within(modal).getAllByRole('checkbox')).toHaveLength(3);
    expect(
      within(modal).getByText(/será enviada para 10 contatos\. Esta ação não pode ser desfeita\./),
    ).toBeInTheDocument();
  });

  it('só habilita "Confirmar lançamento" com as três confirmações marcadas', () => {
    const ed = reviewEd();
    const modal = openLaunchModal(ed);

    const confirmar = () => within(modal).getByRole('button', { name: 'Confirmar lançamento' }) as HTMLButtonElement;
    const caixas = within(modal).getAllByRole('checkbox');

    expect(confirmar().disabled).toBe(true);

    fireEvent.click(caixas[0]);
    fireEvent.click(caixas[1]);
    expect(confirmar().disabled).toBe(true);

    fireEvent.click(caixas[2]);
    expect(confirmar().disabled).toBe(false);

    // O botão bloqueado não dispara nada: o lançamento só sai com as três.
    fireEvent.click(caixas[2]);
    expect(confirmar().disabled).toBe(true);
    fireEvent.click(confirmar());
    expect(ed.handleSave).not.toHaveBeenCalled();
    expect(modalOnLaunched).not.toHaveBeenCalled();
  });

  it('confirma o disparo e entrega o lançamento para a tela seguinte (monitor)', async () => {
    const ed = reviewEd();
    const modal = openLaunchModal(ed);

    within(modal).getAllByRole('checkbox').forEach((caixa) => fireEvent.click(caixa));

    await act(async () => {
      within(modal).getByRole('button', { name: 'Confirmar lançamento' }).click();
    });

    expect(ed.handleSave).toHaveBeenCalledTimes(1);
    expect(ed.handleSave).toHaveBeenCalledWith('launch');
    expect(modalOnLaunched).toHaveBeenCalledWith('campaign-9', 'sending');
  });

  it('cancelar fecha o modal sem lançar', () => {
    const ed = reviewEd();
    const modal = openLaunchModal(ed);

    within(modal).getAllByRole('checkbox').forEach((caixa) => fireEvent.click(caixa));
    fireEvent.click(within(modal).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(ed.handleSave).not.toHaveBeenCalled();
    expect(modalOnLaunched).not.toHaveBeenCalled();
  });

  it('pede "Confirmar agendamento" e avisa da data quando o envio é agendado', () => {
    const modal = openLaunchModal(reviewEd({ isScheduled: true, scheduledAt: '2026-10-20T14:30' }));

    expect(within(modal).getByRole('button', { name: 'Confirmar agendamento' })).toBeDisabled();
    expect(within(modal).getByText(/20\/10\/2026 14:30/)).toBeInTheDocument();
  });
});
