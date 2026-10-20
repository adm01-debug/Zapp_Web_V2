import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

vi.mock('@/hooks/crm/useContactCustomFields', () => ({
  useContactCustomFields: () => ({ fields: [] }),
}));

// T09 — a revisão consome `useTalkXInsights` (recomendações reais); aqui o
// motor fica sem dados, como antes da mudança (só o mock da dependência nova,
// nenhuma asserção alterada).
vi.mock('@/hooks/integrations/useTalkXInsights', () => ({
  useTalkXInsights: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
}));

// X051: a revisão resolve o disparo pelo controlador único (`useTalkXLifecycle`
// → `useTalkX`, que usa react-query). Sem a porta mockada o render cai em
// "No QueryClient set"; o disparo aqui é exercitado pelo executor do wizard
// (`ed.handleSave`), não pelas operações do hook.
vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    startCampaign: vi.fn(), pauseCampaign: vi.fn(), cancelCampaign: vi.fn(),
    updateCampaign: { mutateAsync: vi.fn() },
  }),
}));

import { TalkXWizardReview } from '@/components/talkx/TalkXWizardDelivery';
import type { WizardState } from '@/components/talkx/TalkXCampaignWizard';

// X136 (plano Talk X V4, Tela 09) — as TRÊS confirmações do disparo do mock 09
// continuam sendo condição para lançar. O que mudou com o X051 é onde a caixa
// fica e quem confirma: as três vivem no cartão "Confirmações obrigatórias" da
// revisão (alimentam `ed.canProceed[4]`, que o editor exige em
// `mode: 'launch'`) e a confirmação final é o diálogo único do ciclo de vida —
// o modal próprio da tela saiu de cena, junto com a repetição das mesmas três
// caixas dentro dele.
//
// Este arquivo era a trava do modal próprio; virou a trava do PORTÃO: sem as
// três marcadas o lançamento não abre confirmação, não salva e não navega.

/** `ed` mínimo para renderizar a revisão (mesmo formato de TalkXView.route.test). */
function reviewEd(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Campanha X136', description: '', objective: 'sales',
    audienceSource: 'contacts', selectedSegments: [],
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

/** Abre a confirmação do disparo pelo botão da revisão e devolve o diálogo. */
function openLaunchModal(ed: WizardState) {
  render(<TalkXWizardReview ed={ed} campaign={null} onLaunched={modalOnLaunched} />);
  fireEvent.click(screen.getByRole('button', { name: /(Lançar|Agendar) campanha/ }));
  return screen.getByRole('alertdialog');
}

afterEach(() => {
  vi.clearAllMocks();
  modalOnLaunched.mockClear();
});

describe('TalkXWizardReview — as três confirmações obrigatórias do disparo (X136)', () => {
  it('mantém as três confirmações do mock 09 na revisão e é o conjunto delas que libera o lançamento', () => {
    const { unmount } = render(
      <TalkXWizardReview
        ed={reviewEd({ canProceed: { 1: true, 2: true, 3: true, 4: false } })}
        campaign={null}
        onLaunched={modalOnLaunched}
      />,
    );

    expect(screen.getByText('Confirmo que possuo o consentimento dos contatos.')).toBeInTheDocument();
    expect(screen.getByText('Revisei e estou de acordo com o conteúdo da mensagem.')).toBeInTheDocument();
    expect(screen.getByText('A lista de supressão foi aplicada corretamente.')).toBeInTheDocument();

    const bloqueado = screen.getByRole('button', { name: 'Lançar campanha' }) as HTMLButtonElement;
    expect(bloqueado.disabled).toBe(true);
    fireEvent.click(bloqueado);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    unmount();

    // Com as três marcadas (`canProceed[4]`) o disparo libera.
    const ed = reviewEd();
    render(<TalkXWizardReview ed={ed} campaign={null} onLaunched={modalOnLaunched} />);
    expect(screen.getByRole('button', { name: 'Lançar campanha' })).not.toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'Lançar campanha' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(ed.handleSave).not.toHaveBeenCalled();
  });

  it('confirma o disparo no diálogo único, com o texto do mock e sem repetir as caixas dentro dele', async () => {
    const ed = reviewEd();
    const modal = openLaunchModal(ed);

    expect(within(modal).getByText('Confirmar disparo?')).toBeInTheDocument();
    expect(within(modal).getByText(/As mensagens começam a ser enviadas para a audiência selecionada\./)).toBeInTheDocument();
    expect(within(modal).getByText('10 contatos')).toBeInTheDocument();
    // as três caixas não moram mais no modal (ficaram no cartão da revisão)
    expect(within(modal).queryAllByRole('checkbox')).toHaveLength(0);

    await act(async () => {
      within(modal).getByRole('button', { name: 'Confirmar envio' }).click();
    });

    expect(ed.handleSave).toHaveBeenCalledTimes(1);
    expect(ed.handleSave).toHaveBeenCalledWith('launch');
    expect(modalOnLaunched).toHaveBeenCalledWith('campaign-9', 'sending');
  });

  it('cancelar fecha a confirmação sem lançar', () => {
    const ed = reviewEd();
    const modal = openLaunchModal(ed);

    fireEvent.click(within(modal).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(ed.handleSave).not.toHaveBeenCalled();
    expect(modalOnLaunched).not.toHaveBeenCalled();
  });

  it('pede o envio agendado avisando da data e salva com `schedule`', async () => {
    const ed = reviewEd({ isScheduled: true, scheduledAt: '2026-10-20T14:30' });
    const modal = openLaunchModal(ed);

    expect(within(modal).getByText('20/10/2026 14:30 (America/Sao_Paulo)')).toBeInTheDocument();

    await act(async () => {
      within(modal).getByRole('button', { name: 'Confirmar envio' }).click();
    });

    expect(ed.handleSave).toHaveBeenCalledWith('schedule');
    expect(modalOnLaunched).toHaveBeenCalledWith('campaign-9', 'scheduled');
  });
});
