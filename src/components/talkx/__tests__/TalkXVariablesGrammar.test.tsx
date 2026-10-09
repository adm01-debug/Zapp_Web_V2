import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/crm/useContactCustomFields', () => ({
  useContactCustomFields: () => ({ fields: [] }),
}));

import { TalkXMessageEditor } from '../TalkXMessageEditor';
import { TalkXWizardReview } from '../TalkXWizardDelivery';
import { personalizePreview } from '../talkxShared';
import type { WizardState } from '../TalkXCampaignWizard';

/**
 * R2-MOD-062 — a gramática de variáveis do editor e do Resumo tem de ser a mesma
 * da prévia com fallback (`personalizePreview`, que replica o envio real):
 *   - o primeiro `|` separa CHAVE de PADRÃO (`{{nome|cliente}}` → chave `nome`);
 *   - a chave é trimada e comparada sem caixa (`{{ Nome }}` ≡ `nome`);
 *   - chave com dígito (`custom_1`) é uma variável válida.
 * O que identifica a variável é a CHAVE, não o token inteiro — o editor não pode
 * acusar como desconhecida uma sintaxe que a prévia resolve.
 */

/** `ed` mínimo só para renderizar a revisão (mesma forma de TalkXView.route.test). */
function reviewEd(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Campanha', description: '', objective: 'sales',
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
    handleSave: vi.fn(), setStep: vi.fn(),
    ...overrides,
  } as unknown as WizardState;
}

describe('TalkXMessageEditor — gramática de variáveis (R2-MOD-062)', () => {
  it('não acusa {{nome|cliente}} como desconhecida quando a chave "nome" é conhecida', () => {
    render(<TalkXMessageEditor value="Oi {{nome|cliente}}" onChange={() => {}} knownVariables={['{{nome}}']} />);
    expect(screen.queryByText(/Variáveis desconhecidas/)).not.toBeInTheDocument();
  });

  it('destaca {{ nome | cliente }} como conhecida no overlay (não âmbar)', () => {
    const { container } = render(
      <TalkXMessageEditor value="Oi {{ nome | cliente }}" onChange={() => {}} knownVariables={['{{nome}}']} />,
    );
    const overlay = container.querySelector('pre') as HTMLElement;
    expect(overlay.innerHTML).toContain('text-primary-glow');
    expect(overlay.innerHTML).not.toContain('text-dash-amber');
  });

  it('acusa a variável desconhecida pela chave, ignorando o padrão', () => {
    render(<TalkXMessageEditor value="Oi {{nome|cliente}} e {{cargo}}" onChange={() => {}} knownVariables={['{{nome}}']} />);
    const aviso = screen.getByText(/Variáveis desconhecidas/);
    expect(aviso).toHaveTextContent('{{cargo}}');
    expect(aviso).not.toHaveTextContent('nome');
  });

  it('aceita chave com dígito (custom_1) como conhecida', () => {
    render(<TalkXMessageEditor value="Código {{custom_1}}" onChange={() => {}} knownVariables={['{{custom_1}}']} />);
    expect(screen.queryByText(/Variáveis desconhecidas/)).not.toBeInTheDocument();
  });
});

describe('Resumo da campanha — variáveis de personalização (R2-MOD-062)', () => {
  it('lista {{nome}} e {{custom_1}} do texto com fallback, em vez de "Nenhuma"', () => {
    render(
      <TalkXWizardReview
        ed={reviewEd({ messageTemplate: 'Oi {{nome|cliente}}, seu código é {{custom_1}}' })}
        campaign={null}
        onLaunched={() => {}}
      />,
    );
    expect(screen.getByText('Variáveis de personalização')).toBeInTheDocument();
    expect(screen.getByText('{{nome}}, {{custom_1}}')).toBeInTheDocument();
    expect(screen.getByText('2 variáveis configuradas')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma')).not.toBeInTheDocument();
  });

  it('a prévia resolve o mesmo token com fallback que o resumo lista (mesma gramática)', () => {
    const template = 'Oi {{nome|cliente}}, seu código é {{custom_1}}';
    expect(personalizePreview(template, { name: 'Ana Souza' })).toBe('Oi Ana, seu código é [custom_1]');
  });

  it('mantém chaves internas do fallback byte a byte como o envio real', () => {
    expect(personalizePreview('{{nome|a{b}}', {})).toBe('a{b');
  });

  it('não transforma {{{nome}} em {{nome}} nem resolve a chave nome', () => {
    expect(personalizePreview('{{{nome}}', { name: 'Ana Souza' })).toBe('[{nome]');
  });

  it('mantém o espaço final do fallback na prévia', () => {
    expect(personalizePreview('{{nome|cliente }}', {})).toBe('cliente ');
  });

  it('não remove chaves internas do miolo nem resolve {{nome como nome', () => {
    expect(personalizePreview('{{{{nome}}', { name: 'Ana Souza' })).toBe('[{{nome]');
  });
});
