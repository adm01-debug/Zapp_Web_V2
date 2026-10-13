import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/crm/useContactCustomFields', () => ({
  useContactCustomFields: () => ({ fields: [] }),
}));

vi.mock('@/hooks/integrations/useTalkXInsights', () => ({
  useTalkXInsights: () => ({ data: [] }),
}));

import { TalkXWizardReview } from '../TalkXWizardDelivery';
import type { WizardState } from '../TalkXCampaignWizard';

/**
 * X135 — "Resumo operacional" da revisão final.
 *
 * A revisão não pode prometer previsão sem lastro: a taxa de resposta projetada
 * e o risco de opt-out vêm do servidor (CAP-087) e, enquanto ele não devolver
 * base suficiente — o mínimo definido é de 5 campanhas concluídas com 100 ou
 * mais enviados nos últimos 90 dias —, as DUAS previsões ficam no estado "sem
 * dados ainda" do kit (A9), nunca com um número inventado.
 *
 * Antes: a taxa de resposta projetada mostrava o texto solto "sem histórico
 * suficiente" (nem valor, nem estado de vazio do kit) e o risco de opt-out não
 * existia no painel — o resumo operacional não tinha os quatro itens do mock.
 */

/** `ed` mínimo só para renderizar a revisão (mesma forma dos outros testes da revisão). */
function reviewEd(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Campanha X135', description: '', objective: 'sales',
    audienceSource: 'contacts', selectedSegment: null,
    selectedContacts: [], eligibleCount: 1187, audienceTotal: 1248,
    respectSuppression: true, suppressedCount: 61,
    selectedTemplate: null, messageTemplate: 'Oi {{nome}}',
    speedProfile: 'normal', messagesPerMinute: 20, estimatedTime: '~2h 30min',
    isScheduled: false, scheduledAt: '', scheduleTimezone: 'America/Sao_Paulo',
    sendWindowEnabled: false, sendWindowStart: '08:00', sendWindowEnd: '18:00',
    businessHoursOnly: false,
    connectionId: 'c1', connections: [{ id: 'c1', name: 'Conexão', phone_number: '5511999999999' }],
    contacts: [],
    confirmConsent: true, confirmContent: true, confirmSuppression: true,
    canProceed: { 1: true, 2: true, 3: true, 4: true },
    saving: false, hasMedia: false, mediaUrl: '', mediaType: null,
    handleSave: vi.fn(), setStep: vi.fn(),
    ...overrides,
  } as unknown as WizardState;
}

const BASE_MINIMA = /5 campanhas concluídas com 100 ou mais enviados nos últimos 90 dias/;

describe('TalkXWizardReview — Resumo operacional (X135)', () => {
  it('mantém as duas previsões em "sem dados ainda" enquanto o servidor não tiver base', () => {
    render(<TalkXWizardReview ed={reviewEd()} campaign={null} onLaunched={() => {}} />);

    expect(screen.getByText('Taxa de resposta projetada')).toBeInTheDocument();
    expect(screen.getByText('Risco de opt-out')).toBeInTheDocument();
    // As duas previsões usam o estado vazio do kit: nenhum número inventado.
    expect(screen.getAllByText('Sem dados ainda')).toHaveLength(2);
    // O estado de valor antigo não volta (não é nem número, nem vazio do kit).
    expect(screen.queryByText('sem histórico suficiente')).toBeNull();
    // A base mínima da projeção (CAP-087) fica explícita para quem opera.
    expect(screen.getAllByTitle(BASE_MINIMA)).toHaveLength(2);
  });

  it('mantém os números reais do resumo operacional', () => {
    render(<TalkXWizardReview ed={reviewEd()} campaign={null} onLaunched={() => {}} />);

    expect(screen.getByText('Público total')).toBeInTheDocument();
    expect(screen.getByText('1.187')).toBeInTheDocument();
    expect(screen.getByText('contatos elegíveis')).toBeInTheDocument();
    expect(screen.getByText('Tempo estimado de entrega')).toBeInTheDocument();
    expect(screen.getByText('~2h 30min')).toBeInTheDocument();
    expect(screen.getByText('Suprimidos')).toBeInTheDocument();
    expect(screen.getByText('61')).toBeInTheDocument();
    expect(screen.getByText('4,9%')).toBeInTheDocument();
  });
});
