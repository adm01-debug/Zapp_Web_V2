import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ContactHeaderSection } from '../ContactHeaderSection';
import type { Conversation } from '@/types/chat';

// Minimal mocks
let crm360DataMock: unknown = null;
vi.mock('@/hooks/crm/useExternalContact360', () => ({
  useExternalContact360: () => ({ data: crm360DataMock }),
}));

vi.mock('@/integrations/supabase/externalClient', () => ({
  isExternalConfigured: false,
}));
vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({ useCRMIntegrationEnabled: () => true }));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/hooks/chat/useConversationActions', () => ({
  useConversationActions: () => ({
    isFavorite: () => false,
    favoriteContact: vi.fn(),
    unfavoriteContact: vi.fn(),
  }),
}));

vi.mock('@/hooks/integrations/useSyncToCRM', () => ({
  useSyncToCRM: () => ({ syncConversation: vi.fn(), syncConversationAsync: vi.fn(), isSyncing: false, isConfigured: false }),
}));

const baseContact = {
  id: 'c1',
  name: 'Maria Silva',
  phone: '+5511999999999',
  email: 'maria@test.com',
};

const baseEnriched = {
  channel_type: 'whatsapp',
  ai_sentiment: 'positive' as const,
  ai_priority: 'high' as const,
  company: 'TechCo',
  job_title: 'CTO',
  contact_type: 'customer' as const,
  nickname: null,
  surname: null,
  tags: [],
};

describe('ContactHeaderSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    crm360DataMock = null;
  });

  // ========== RENDERING ==========
  it('renders contact first name', () => {
    render(<ContactHeaderSection contact={baseContact} enrichedData={baseEnriched} />);
    expect(screen.getByText('Maria')).toBeInTheDocument();
  });

  it('renders company name', () => {
    render(<ContactHeaderSection contact={baseContact} enrichedData={baseEnriched} />);
    expect(screen.getByText('TechCo')).toBeInTheDocument();
  });

  it('does not render phone number or WhatsApp link', () => {
    render(<ContactHeaderSection contact={baseContact} enrichedData={baseEnriched} />);
    expect(screen.queryByText('+5511999999999')).not.toBeInTheDocument();
  });

  it('does not render a sentiment chip (fora do escopo dos chips §5.3: tipo/VIP/alta prioridade)', () => {
    render(<ContactHeaderSection contact={baseContact} enrichedData={baseEnriched} />);
    expect(screen.queryByText(/Positivo/)).not.toBeInTheDocument();
  });

  it('renders priority badge', () => {
    render(<ContactHeaderSection contact={baseContact} enrichedData={baseEnriched} />);
    expect(screen.getByText('Alta prioridade')).toBeInTheDocument();
  });

  it('renders contact type badge', () => {
    render(<ContactHeaderSection contact={baseContact} enrichedData={baseEnriched} />);
    expect(screen.getByText('Cliente')).toBeInTheDocument();
  });

  // ========== EDIT ACTION ==========
  it('aceita prop onQuickAction sem crash', () => {
    const mockAction = vi.fn();
    render(
      <ContactHeaderSection
        contact={baseContact}
        enrichedData={baseEnriched}
        onQuickAction={mockAction}
      />
    );
    // Verifica que o componente renderiza com o prop — o dispatch real requer Radix portal
    expect(screen.getByText('Maria')).toBeInTheDocument();
  });

  // ========== COMPACT MODE ==========
  it('renders compact header', () => {
    render(
      <ContactHeaderSection
        contact={baseContact}
        enrichedData={baseEnriched}
        isCompact={true}
      />
    );
    expect(screen.getByText('Maria')).toBeInTheDocument();
  });

  it('shows company in compact mode', () => {
    render(
      <ContactHeaderSection
        contact={baseContact}
        enrichedData={baseEnriched}
        isCompact={true}
      />
    );
    expect(screen.getByText('TechCo')).toBeInTheDocument();
  });

  // ========== NULL ENRICHED DATA ==========
  it('renders without enriched data', () => {
    render(<ContactHeaderSection contact={baseContact} enrichedData={null} />);
    expect(screen.getByText('Maria')).toBeInTheDocument();
  });

  it('renders without enriched data as undefined', () => {
    render(<ContactHeaderSection contact={baseContact} enrichedData={undefined} />);
    expect(screen.getByText('Maria')).toBeInTheDocument();
  });

  // ========== AVATAR FALLBACK ==========
  it('renders initials in avatar fallback', () => {
    render(<ContactHeaderSection contact={baseContact} enrichedData={null} />);
    expect(screen.getByText('MS')).toBeInTheDocument();
  });

  it('cai em "Sem nome" quando o nome do contato e so espacos', () => {
    render(<ContactHeaderSection contact={{ ...baseContact, name: '   ' }} enrichedData={null} />);
    expect(screen.getByText('Sem nome')).toBeInTheDocument();
  });

  // ========== SINGLE NAME ==========
  it('handles single-word name', () => {
    render(
      <ContactHeaderSection
        contact={{ ...baseContact, name: 'Zé' }}
        enrichedData={null}
      />
    );
    expect(screen.getByText('Zé')).toBeInTheDocument();
  });

  // ========== COLLAPSE ALL ==========
  it('shows collapse button when hasExpandedSections', async () => {
    const mockCollapse = vi.fn();
    render(
      <ContactHeaderSection
        contact={baseContact}
        enrichedData={null}
        hasExpandedSections={true}
        onCollapseAll={mockCollapse}
      />
    );
    // Radix DropdownMenu abre com pointerDown (não click) no trigger
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais' }), { button: 0, ctrlKey: false });
    expect(await screen.findByText('Recolher seções')).toBeInTheDocument();
  });

  it('does not show collapse button when hasExpandedSections is false', () => {
    render(
      <ContactHeaderSection
        contact={baseContact}
        enrichedData={null}
        hasExpandedSections={false}
      />
    );
    // Sem hasExpandedSections, o item não existe no dropdown
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Mais' }), { button: 0, ctrlKey: false });
    expect(screen.queryByText('Recolher seções')).not.toBeInTheDocument();
  });

  // ========== NO EMAIL ==========
  it('disables email button when no email', () => {
    render(
      <ContactHeaderSection
        contact={{ ...baseContact, email: undefined }}
        enrichedData={null}
      />
    );
    const buttons = screen.getAllByRole('button');
    const disabledBtn = buttons.find(b => b.hasAttribute('disabled'));
    expect(disabledBtn).toBeTruthy();
  });

  // ========== ENGAGEMENT SCORE ==========
  it('shows engagement score badge', () => {
    render(<ContactHeaderSection contact={baseContact} enrichedData={baseEnriched} />);
    // With positive sentiment (50+25) + high priority (+15) + company (+5) + customer type (+5) = 100 capped
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('shows lower engagement for neutral contact', () => {
    render(
      <ContactHeaderSection
        contact={baseContact}
        enrichedData={{ ...baseEnriched, ai_sentiment: 'neutral', ai_priority: 'low', company: null, contact_type: null }}
      />
    );
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  // ========== APELIDO (paridade com o nome exibido na lista de conversas) ==========
  it('prioriza o apelido (enrichedData.nickname) sobre o primeiro nome quando preenchido', () => {
    render(
      <ContactHeaderSection
        contact={baseContact}
        enrichedData={{ ...baseEnriched, nickname: 'Mari' }}
      />
    );
    expect(screen.getByText('Mari')).toBeInTheDocument();
    expect(screen.queryByText('Maria')).not.toBeInTheDocument();
  });

  it('cai no primeiro nome quando o apelido e so espacos', () => {
    render(
      <ContactHeaderSection
        contact={baseContact}
        enrichedData={{ ...baseEnriched, nickname: '   ' }}
      />
    );
    expect(screen.getByText('Maria')).toBeInTheDocument();
  });

  it('usa o apelido tambem no modo compacto', () => {
    render(
      <ContactHeaderSection
        contact={baseContact}
        enrichedData={{ ...baseEnriched, nickname: 'Mari' }}
        isCompact={true}
      />
    );
    expect(screen.getByText('Mari')).toBeInTheDocument();
  });

  // ========== NOME DE TRATAMENTO DO CRM x APELIDO (sem duplicar a mesma palavra) ==========
  it('nao repete a legenda do CRM quando e igual ao apelido ja exibido no titulo', () => {
    crm360DataMock = { found: true, contact: { nome_tratamento: 'Mari', apelido: null, relationship_score: 10 }, company: null };
    render(
      <ContactHeaderSection
        contact={baseContact}
        enrichedData={{ ...baseEnriched, nickname: 'Mari' }}
      />
    );
    expect(screen.getByText('Mari')).toBeInTheDocument();
    expect(screen.queryByText('"Mari"')).not.toBeInTheDocument();
  });

  it('nao repete a legenda quando e igual ao primeiro nome (sem apelido local)', () => {
    crm360DataMock = { found: true, contact: { nome_tratamento: 'Maria', apelido: null, relationship_score: 10 }, company: null };
    render(<ContactHeaderSection contact={baseContact} enrichedData={baseEnriched} />);
    expect(screen.getByText('Maria')).toBeInTheDocument();
    expect(screen.queryByText('"Maria"')).not.toBeInTheDocument();
  });

  it('nao repete a legenda quando difere so por acento/caixa (auditoria 2026-09-26)', () => {
    crm360DataMock = { found: true, contact: { nome_tratamento: 'JOSÉ', apelido: null, relationship_score: 10 }, company: null };
    render(<ContactHeaderSection contact={{ ...baseContact, name: 'Jose Souza' }} enrichedData={baseEnriched} />);
    expect(screen.getByText('Jose')).toBeInTheDocument();
    expect(screen.queryByText('"JOSÉ"')).not.toBeInTheDocument();
  });

  it('cai no apelido do CRM quando nome_tratamento e so espacos', () => {
    crm360DataMock = { found: true, contact: { nome_tratamento: '   ', apelido: 'Zeca', relationship_score: 10 }, company: null };
    render(<ContactHeaderSection contact={baseContact} enrichedData={baseEnriched} />);
    expect(screen.getByText('"Zeca"')).toBeInTheDocument();
  });

  it('mostra a legenda do CRM quando e diferente do nome exibido no titulo', () => {
    crm360DataMock = { found: true, contact: { nome_tratamento: 'Dona Maria', apelido: null, relationship_score: 10 }, company: null };
    render(
      <ContactHeaderSection
        contact={baseContact}
        enrichedData={{ ...baseEnriched, nickname: 'Mari' }}
      />
    );
    expect(screen.getByText('Mari')).toBeInTheDocument();
    expect(screen.getByText('"Dona Maria"')).toBeInTheDocument();
  });

  // ========== LOGO DA EMPRESA ==========
  it('mostra o círculo com iniciais da empresa quando há nome mas nenhuma logo do CRM', () => {
    render(
      <ContactHeaderSection
        contact={baseContact}
        enrichedData={{ ...baseEnriched, company: 'Tech Corp' }}
      />
    );
    expect(screen.getByText('Tech Corp')).toBeInTheDocument();
    expect(screen.getByTitle('Tech Corp')).toHaveTextContent('TC');
  });

  it('nao mostra logo nem nome de empresa quando nao ha empresa', () => {
    render(
      <ContactHeaderSection
        contact={baseContact}
        enrichedData={{ ...baseEnriched, company: null }}
      />
    );
    expect(screen.queryByText('TechCo')).not.toBeInTheDocument();
  });

  // ========== ÚLTIMO CONTATO ==========
  it('mostra a data do último contato quando a conversation tem updatedAt', () => {
    const conversation = { updatedAt: new Date('2026-09-22T10:00:00Z') } as unknown as Conversation;
    render(
      <ContactHeaderSection
        contact={baseContact}
        enrichedData={baseEnriched}
        conversation={conversation}
      />
    );
    expect(screen.getByText('22/09/2026')).toBeInTheDocument();
  });

  it('nao mostra a data do ultimo contato quando conversation nao e fornecida', () => {
    render(<ContactHeaderSection contact={baseContact} enrichedData={baseEnriched} />);
    expect(screen.queryByText(/^\d{2}\/\d{2}\/\d{4}$/)).not.toBeInTheDocument();
  });

  it('nao quebra o render quando updatedAt e uma data invalida', () => {
    const conversation = { updatedAt: new Date('invalid') } as unknown as Conversation;
    expect(() =>
      render(<ContactHeaderSection contact={baseContact} enrichedData={baseEnriched} conversation={conversation} />)
    ).not.toThrow();
    expect(screen.queryByText(/^\d{2}\/\d{2}\/\d{4}$/)).not.toBeInTheDocument();
  });

  // ========== BADGE CONTRASTE WCAG 1.4.3 ==========
  // Tokens brutos falham 4.5:1 com texto branco; getScoreBadgeBg usa L reduzido.
  // Ratios verificados matematicamente (HSL→RGB→luminância IEC 61966-2-1):
  //   hsl(160 70% 28%) → L≈0.1461 → 5.35:1 ✅
  //   hsl(38 90% 32%)  → L≈0.1634 → 4.92:1 ✅
  //   hsl(0 84% 48%)   → L≈0.1660 → 4.86:1 ✅

  // Smoke: prova que jsdom/cssstyle processa inline styles corretamente.
  it('smoke: inline styles são processadas pelo jsdom (assertion positiva + negativa)', () => {
    render(<ContactHeaderSection contact={baseContact} enrichedData={baseEnriched} />);
    const badge = screen.getByText('100');
    // Positiva: badge tem a cor correta para score=100 (hot)
    expect(badge).toHaveStyle('background-color: hsl(160 70% 28%)');
    // Negativa: toHaveStyle distingue valores distintos
    expect(badge).not.toHaveStyle('background-color: hsl(38 90% 32%)');
  });

  it('badge de alto engajamento usa cor acessível (hsl 160 70% 28%, ~5.35:1 com branco)', () => {
    // baseEnriched: positive+high+company+customer = 100
    render(<ContactHeaderSection contact={baseContact} enrichedData={baseEnriched} />);
    const badge = screen.getByText('100');
    expect(badge).toHaveStyle('background-color: hsl(160 70% 28%)');
  });

  it('badge de alto engajamento usa texto branco (necessário para ratio WCAG)', () => {
    render(<ContactHeaderSection contact={baseContact} enrichedData={baseEnriched} />);
    const badge = screen.getByText('100');
    expect(badge).toHaveStyle('color: rgb(255, 255, 255)');
  });

  it('badge usa cor de alto engajamento na fronteira exata score=80', () => {
    // positive(+25) + low(nada) + company(+5) + no type(nada) = 50+25+5 = 80
    render(
      <ContactHeaderSection
        contact={baseContact}
        enrichedData={{ ...baseEnriched, ai_priority: 'low', contact_type: null }}
      />
    );
    const badge = screen.getByText('80');
    expect(badge).toHaveStyle('background-color: hsl(160 70% 28%)');
  });

  it('badge de médio engajamento usa cor acessível (hsl 38 90% 32%, ~4.92:1 com branco)', () => {
    render(
      <ContactHeaderSection
        contact={baseContact}
        enrichedData={{ ...baseEnriched, ai_sentiment: 'neutral', ai_priority: 'low', company: null, contact_type: null }}
      />
    );
    // score = 50 (base sem bônus — mínimo alcançável pela fórmula atual)
    const badge = screen.getByText('50');
    expect(badge).toHaveStyle('background-color: hsl(38 90% 32%)');
  });

  it('score mínimo é 50 — ramo s<50 em getScoreBadgeBg é código defensivo não alcançável', () => {
    // A fórmula só faz adições (base 50 + bônus). Sentiment negativo não subtrai.
    // Logo hsl(0 84% 48%) nunca é ativado com a implementação atual.
    // Este teste documenta esse invariante: qualquer enrichedData produz score >= 50.
    render(
      <ContactHeaderSection
        contact={baseContact}
        enrichedData={{ ...baseEnriched, ai_sentiment: 'negative', ai_priority: 'low', company: null, contact_type: null }}
      />
    );
    const badge = screen.getByText('50');
    expect(badge).toBeInTheDocument();
    // Confirma que a cor de baixo engajamento NÃO é usada (score está em 50, range médio)
    expect(badge).not.toHaveStyle('background-color: hsl(0 84% 48%)');
  });

  it('badge usa cor de médio engajamento na fronteira score=75 (abaixo do limiar hot 80)', () => {
    // positive(+25) + low(0) + no company(0) + no type(0) = 50+25 = 75; 75 < 80 → warm
    render(
      <ContactHeaderSection
        contact={baseContact}
        enrichedData={{ ...baseEnriched, ai_priority: 'low', company: null, contact_type: null }}
      />
    );
    const badge = screen.getByText('75');
    expect(badge).toHaveStyle('background-color: hsl(38 90% 32%)');
    expect(badge).not.toHaveStyle('background-color: hsl(160 70% 28%)');
  });
});
