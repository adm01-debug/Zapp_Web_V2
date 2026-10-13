import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ContactHeaderSection } from '../ContactHeaderSection';
import type { Conversation } from '@/types/chat';

// Minimal mocks
let crm360DataMock: unknown = null;
vi.mock('@/hooks/crm/useExternalContact360', () => ({
  useExternalContact360: () => ({ data: crm360DataMock }),
}));

// Estatísticas reais do contato (ContactService.fetchStats). Padrão: sem dados →
// o cabeçalho não mostra pontuação nenhuma.
let contactStatsMock: unknown = null;
vi.mock('@/hooks/crm/useContactStats', () => ({
  useContactStats: () => ({ data: contactStatsMock }),
}));

vi.mock('@/integrations/supabase/externalClient', () => ({
  isExternalConfigured: false,
}));
vi.mock('@/hooks/system/useFeatureFlag', () => ({ useFeatureFlag: (_key: string, fallback = false) => fallback }));
// Isola o cabeçalho do painel de colaboração em tempo real (assina presence via
// WebSocket); aqui só interessa a pontuação vinda de ContactService.fetchStats.
vi.mock('@/components/inbox/RealtimeCollaboration', () => ({
  RealtimeCollaboration: () => null,
}));
vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({ useCRMIntegrationEnabled: () => true }));
// Não assina o canal realtime de e-mails não lidos (WebSocket) — fora do escopo
// desta prova, que é a pontuação do cabeçalho.
vi.mock('@/hooks/gmail/useContactUnreadEmails', () => ({
  useContactUnreadEmails: () => ({ count: 0, status: 'idle' }),
}));

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
    contactStatsMock = null;
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

  // ========== PONTUAÇÃO DE ENGAJAMENTO (dados reais ou nenhuma) ==========
  it('NAO mostra pontuacao quando nao ha dados de conversa (nada inventado)', () => {
    render(<ContactHeaderSection contact={baseContact} enrichedData={baseEnriched} />);
    // Sem ContactService.fetchStats não há número: nem badge numérico nem anel.
    expect(screen.queryByText('50')).not.toBeInTheDocument();
    expect(screen.queryByText('100')).not.toBeInTheDocument();
    // O anel de engajamento (SVG do avatar) não é renderizado.
    expect(document.querySelector('svg[viewBox="0 0 108 108"]')).toBeNull();
  });

  it('mostra a pontuacao calculada dos dados reais (exemplo: 65/100)', () => {
    // 100 msgs → 20; 4 conversas → 10; 10 min → 20; CSAT 5 → 15 = 65
    contactStatsMock = { totalMessages: 100, totalConversations: 4, avgResponseTimeMinutes: 10, csatAverage: 5, csatCount: 3 };
    render(<ContactHeaderSection contact={baseContact} enrichedData={baseEnriched} />);
    expect(screen.getByText('65')).toBeInTheDocument();
  });

  it('mostra a faixa no tooltip com os pesos de cada componente e o CSAT', async () => {
    // 100 msgs→20; 4 conversas→10; 10 min→20; CSAT 5 (3 avaliações)→15 = 65
    contactStatsMock = { totalMessages: 100, totalConversations: 4, avgResponseTimeMinutes: 10, csatAverage: 5, csatCount: 3 };
    render(<ContactHeaderSection contact={baseContact} enrichedData={baseEnriched} />);
    const badge = screen.getByText('65');
    fireEvent.pointerMove(badge, { pointerType: 'mouse' });
    expect(await screen.findByText(/Engajamento Médio \(65\/100\)/)).toBeInTheDocument();
    const tip = screen.getByText(/mensagens: 100/);
    // Cada componente entra com o seu peso (a fórmula é explicada, não só listada).
    expect(tip).toHaveTextContent('mensagens: 100 (até 40)');
    expect(tip).toHaveTextContent('conversas: 4 (até 25)');
    expect(tip).toHaveTextContent('resposta média: 10 min (até 20)');
    // O CSAT (média e quantidade de avaliações) aparece e fecha a conta 65/100.
    expect(tip).toHaveTextContent('satisfação: 5 (3 avaliações, até 15)');
  });

  it('tooltip usa "sem medida" (e omite o CSAT) quando não há resposta medida nem avaliações', async () => {
    // 50 msgs→10; 2 conversas→5; resposta 0 = não medida→0; sem CSAT→0 = 15
    contactStatsMock = { totalMessages: 50, totalConversations: 2, avgResponseTimeMinutes: 0, csatAverage: null, csatCount: 0 };
    render(<ContactHeaderSection contact={baseContact} enrichedData={baseEnriched} />);
    const badge = screen.getByText('15');
    fireEvent.pointerMove(badge, { pointerType: 'mouse' });
    expect(await screen.findByText(/Engajamento Baixo \(15\/100\)/)).toBeInTheDocument();
    const tip = screen.getByText(/mensagens: 50/);
    expect(tip).toHaveTextContent('resposta média: sem medida (até 20)');
    expect(tip).not.toHaveTextContent('resposta média: 0 min');
    expect(tip).not.toHaveTextContent('satisfação');
  });

  it('nao mostra pontuacao com enrich rico quando nao ha estatisticas (o cabecalho nao inventa)', () => {
    render(<ContactHeaderSection contact={baseContact} enrichedData={{ ...baseEnriched, ai_priority: 'low', company: null, contact_type: null }} />);
    expect(screen.queryByText(/^\d{1,3}$/)).not.toBeInTheDocument();
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

  // ========== SELO VIP — fonte é contacts.tags, a mesma que o botão grava (#241) ==========
  it('mostra o selo VIP quando a tag vip está em contacts.tags (case-insensitive)', () => {
    render(
      <ContactHeaderSection
        contact={{ ...baseContact, tags: ['vip'] }}
        enrichedData={baseEnriched}
      />
    );
    expect(screen.getByText('VIP')).toBeInTheDocument();
  });

  it('prop tags (tags vivas do hook) tem prioridade e também liga o selo', () => {
    render(
      <ContactHeaderSection
        contact={baseContact}
        enrichedData={baseEnriched}
        tags={['VIP']}
      />
    );
    expect(screen.getByText('VIP')).toBeInTheDocument();
  });

  it('NAO mostra o selo por relationship_score alto do CRM sem a tag (fonte antiga removida)', () => {
    crm360DataMock = { found: true, contact: { nome_tratamento: null, apelido: null, relationship_score: 95 }, company: null };
    render(<ContactHeaderSection contact={baseContact} enrichedData={baseEnriched} />);
    expect(screen.queryByText('VIP')).not.toBeInTheDocument();
  });

  it('mostra a coroa no modo compacto quando a tag VIP está presente', () => {
    const { container } = render(
      <ContactHeaderSection
        contact={{ ...baseContact, tags: ['VIP'] }}
        enrichedData={baseEnriched}
        isCompact={true}
      />
    );
    expect(container.querySelector('svg.lucide-crown')).toBeTruthy();
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
  // As cores agora são exercitadas por DADOS REAIS (estatísticas do contato).

  const HOT = { totalMessages: 200, totalConversations: 10, avgResponseTimeMinutes: 15, csatAverage: 5, csatCount: 1 }; // 100

  it('smoke: inline styles são processadas pelo jsdom (assertion positiva + negativa)', () => {
    contactStatsMock = HOT;
    render(<ContactHeaderSection contact={baseContact} enrichedData={baseEnriched} />);
    const badge = screen.getByText('100');
    expect(badge).toHaveStyle('background-color: hsl(160 70% 28%)');
    expect(badge).not.toHaveStyle('background-color: hsl(38 90% 32%)');
  });

  it('badge de alto engajamento usa cor acessível (hsl 160 70% 28%, ~5.35:1 com branco)', () => {
    contactStatsMock = HOT;
    render(<ContactHeaderSection contact={baseContact} enrichedData={baseEnriched} />);
    expect(screen.getByText('100')).toHaveStyle('background-color: hsl(160 70% 28%)');
  });

  it('badge de alto engajamento usa texto branco (necessário para ratio WCAG)', () => {
    contactStatsMock = HOT;
    render(<ContactHeaderSection contact={baseContact} enrichedData={baseEnriched} />);
    expect(screen.getByText('100')).toHaveStyle('color: rgb(255, 255, 255)');
  });

  it('badge usa cor de alto engajamento na fronteira exata score=80', () => {
    // 200 msgs → 40; 10 conversas → 25; 16 min → 15; sem CSAT = 80
    contactStatsMock = { totalMessages: 200, totalConversations: 10, avgResponseTimeMinutes: 16, csatAverage: null, csatCount: 0 };
    render(<ContactHeaderSection contact={baseContact} enrichedData={baseEnriched} />);
    expect(screen.getByText('80')).toHaveStyle('background-color: hsl(160 70% 28%)');
  });

  it('badge de médio engajamento usa cor acessível (hsl 38 90% 32%, ~4.92:1 com branco)', () => {
    // 100 msgs → 20; 4 conversas → 10; 10 min → 20; CSAT 5 → 15 = 65
    contactStatsMock = { totalMessages: 100, totalConversations: 4, avgResponseTimeMinutes: 10, csatAverage: 5, csatCount: 3 };
    render(<ContactHeaderSection contact={baseContact} enrichedData={baseEnriched} />);
    expect(screen.getByText('65')).toHaveStyle('background-color: hsl(38 90% 32%)');
  });

  it('badge usa cor de médio engajamento na fronteira score=79 (abaixo do limiar hot 80)', () => {
    // 195 msgs → 39; 10 conversas → 25; 16 min → 15 = 79; 79 < 80 → warm
    contactStatsMock = { totalMessages: 195, totalConversations: 10, avgResponseTimeMinutes: 16, csatAverage: null, csatCount: 0 };
    render(<ContactHeaderSection contact={baseContact} enrichedData={baseEnriched} />);
    const badge = screen.getByText('79');
    expect(badge).toHaveStyle('background-color: hsl(38 90% 32%)');
    expect(badge).not.toHaveStyle('background-color: hsl(160 70% 28%)');
  });

  it('score baixo (pouco histórico real) usa a cor de baixo engajamento — ramo agora alcançável', () => {
    // 1 mensagem → 0.2 → round 0 → faixa baixa → hsl(0 84% 48%)
    contactStatsMock = { totalMessages: 1, totalConversations: 0, avgResponseTimeMinutes: 0, csatAverage: null, csatCount: 0 };
    render(<ContactHeaderSection contact={baseContact} enrichedData={baseEnriched} />);
    expect(screen.getByText('0')).toHaveStyle('background-color: hsl(0 84% 48%)');
  });
});

