import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  insights: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/hooks/integrations/useTalkXInsights', () => ({
  useTalkXInsights: () => ({ data: h.insights, isLoading: false, isError: false, error: null }),
}));

vi.mock('@/hooks/crm/useContactCustomFields', () => ({
  useContactCustomFields: () => ({ fields: [] }),
}));

import { TalkXWizardReview } from '@/components/talkx/TalkXWizardDelivery';
import type { WizardState } from '@/components/talkx/TalkXCampaignWizard';

// T09 (revisão final): a prévia da revisão mostra o CTA que o template carrega
// (`interactive` → botões/enquete do WhatsApp) e a revisão pluga 2
// recomendações REAIS do `useTalkXInsights` (horário ideal + template campeão),
// com o rótulo honesto "Heurístico". Nada é inventado: sem `interactive` no
// template não há botão; sem dado no motor não há card.

/** `ed` mínimo para renderizar a revisão (mesmo formato de TalkXWizardDelivery.confirmacao.test). */
function reviewEd(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Campanha T09', description: '', objective: 'sales',
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
    handleSave: vi.fn().mockResolvedValue('campaign-t09'),
    setStep: vi.fn(),
    ...overrides,
  } as unknown as WizardState;
}

function renderReview(ed: WizardState) {
  render(<TalkXWizardReview ed={ed} campaign={null} onLaunched={() => {}} />);
  return screen.getByTestId('talkx-preview');
}

afterEach(() => {
  h.insights = [];
  vi.clearAllMocks();
});

describe('TalkXWizardReview — CTA do template na prévia (T09)', () => {
  it('mostra o botão configurado no template dentro da prévia', () => {
    const preview = renderReview(reviewEd({
      selectedTemplate: {
        id: 't1', name: 'Oferta', content: 'Oi {{nome}}',
        interactive: { buttons: [{ type: 'reply' as const, label: 'Quero participar' }] },
      },
    }));

    const cta = within(preview).getByTestId('talkx-preview-interactive');
    expect(within(cta).getByText('Quero participar')).toBeInTheDocument();
  });

  it('mostra a enquete configurada no template dentro da prévia', () => {
    const preview = renderReview(reviewEd({
      selectedTemplate: {
        id: 't2', name: 'Pesquisa', content: 'Responda:',
        interactive: { poll: { question: 'Gostou da oferta?', options: ['Sim', 'Não'] } },
      },
    }));

    const cta = within(preview).getByTestId('talkx-preview-interactive');
    expect(within(cta).getByText('Gostou da oferta?')).toBeInTheDocument();
    expect(within(cta).getByText('Sim')).toBeInTheDocument();
  });

  it('não inventa CTA quando o template não tem botão configurado', () => {
    const preview = renderReview(reviewEd({ selectedTemplate: null }));
    expect(within(preview).queryByTestId('talkx-preview-interactive')).not.toBeInTheDocument();
  });
});

describe('TalkXWizardReview — recomendações reais do motor (T09)', () => {
  it('exibe horário ideal e template campeão com os números do motor e selo Heurístico', () => {
    h.insights = [
      {
        id: 'best-hour', type: 'timing', priority: 'medium',
        title: 'Melhor horário: 09:00',
        description: 'Contatos responderam 37% (amostra: 120 envios). É correlação histórica, não garantia.',
      },
      {
        id: 'best-template', type: 'template', priority: 'medium',
        title: "Template com maior resposta: 'Oferta'",
        description: "Resposta de 22% (amostra: 80 envios). É correlação histórica, não garantia.",
      },
    ];

    renderReview(reviewEd());

    expect(screen.getByText('Recomendações')).toBeInTheDocument();
    // O texto exibido é VERBATIM o que o motor devolveu — a revisão não inventa número.
    expect(screen.getByText(/Contatos responderam 37% \(amostra: 120 envios\)/)).toBeInTheDocument();
    expect(screen.getByText(/Resposta de 22% \(amostra: 80 envios\)/)).toBeInTheDocument();
    expect(screen.getAllByText('Heurístico').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/inteligência artificial/i)).not.toBeInTheDocument();
  });

  it('omite as recomendações sem inventar quando o motor não tem dados', () => {
    h.insights = [];
    renderReview(reviewEd());

    expect(screen.queryByText('Recomendações')).not.toBeInTheDocument();
    expect(screen.getByText('Taxa de resposta projetada')).toBeInTheDocument();
    expect(screen.getByText('Risco de opt-out')).toBeInTheDocument();
    expect(screen.getAllByText('Sem dados ainda')).toHaveLength(2);
    expect(screen.queryByText('sem histórico suficiente')).not.toBeInTheDocument();
  });
});
