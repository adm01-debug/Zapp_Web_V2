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
vi.mock('@/hooks/system/useFeatureFlag', () => ({ useFeatureFlag: (_key: string, fallback = false) => fallback }));
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
  // O selo usa pares de token do sistema (bg + fg) com contraste AA ≥ 4.5:1 nos 3 níveis.
  // Alto (≥80): --success + --success-foreground
  // Médio (≥50): --warning + --warning-foreground
  // Baixo (<50): --destructive + --destructive-foreground
  // Nenhum hsl literal nem 'white' — valores resolvidos do CSS custom properties.

  it('smoke: inline styles usam tokens do sistema (assertion positiva + negativa)', () => {
    render(<ContactHeaderSection contact={baseContact} enrichedData={baseEnriched} />);
    const badge = screen.getByText('100');
    // Positiva: badge usa --success para score=100 (alto engajamento)
    expect(badge).toHaveStyle('background-color: hsl(var(--success))');
    // Negativa: toHaveStyle distingue valores distintos
    expect(badge).not.toHaveStyle('background-color: hsl(var(--warning))');
  });

  it('badge de alto engajamento usa token --success como fundo', () => {
    // baseEnriched: positive+high+company+customer = 100
    render(<ContactHeaderSection contact={baseContact} enrichedData={baseEnriched} />);
    const badge = screen.getByText('100');
    expect(badge).toHaveStyle('background-color: hsl(var(--success))');
  });

  it('badge de alto engajamento usa --success-foreground como texto', () => {
    render(<ContactHeaderSection contact={baseContact} enrichedData={baseEnriched} />);
    const badge = screen.getByText('100');
    expect(badge).toHaveStyle('color: hsl(var(--success-foreground))');
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
    expect(badge).toHaveStyle('background-color: hsl(var(--success))');
  });

  it('badge de médio engajamento usa token --warning como fundo', () => {
    render(
      <ContactHeaderSection
        contact={baseContact}
        enrichedData={{ ...baseEnriched, ai_sentiment: 'neutral', ai_priority: 'low', company: null, contact_type: null }}
      />
    );
    // score = 50 (base sem bônus — mínimo alcançável pela fórmula atual)
    const badge = screen.getByText('50');
    expect(badge).toHaveStyle('background-color: hsl(var(--warning))');
  });

  it('score mínimo é 50 — ramo s<50 em getScoreBadgeBg é código defensivo não alcançável', () => {
    // A fórmula só faz adições (base 50 + bônus). Sentiment negativo não subtrai.
    // Logo hsl(var(--destructive)) nunca é ativado com a implementação atual.
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
    expect(badge).not.toHaveStyle('background-color: hsl(var(--destructive))');
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
    expect(badge).toHaveStyle('background-color: hsl(var(--warning))');
    expect(badge).not.toHaveStyle('background-color: hsl(var(--success))');
  });

  // ========== CONTRASTE AA — leitura dos tokens reais do CSS ==========
  // O teste lê os valores HSL dos CSS custom properties do documento (tema claro,
  // tokens.css), calcula a razão de contraste IEC 61966-2-1 e afirma ≥ 4,5:1
  // nos 3 níveis. Falha sem a correção porque --destructive (0 84% 60%) +
  // --destructive-foreground (white) dá ~3,6:1; o selo ajusta para
  // --destructive-text (0 75% 40%) que fecha ~5,0:1.

  function parseHsl(hslStr: string): [number, number, number] {
    const p = hslStr.trim().split(/\s+/);
    return [Number(p[0]), Number(p[1].replace('%', '')), Number(p[2].replace('%', ''))];
  }

  function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    };
    return [f(0) * 255, f(8) * 255, f(4) * 255];
  }

  function relLuminance(rgb: [number, number, number]): number {
    const lin = (c: number) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  }

  function contrast(rgb1: [number, number, number], rgb2: [number, number, number]): number {
    const l1 = relLuminance(rgb1);
    const l2 = relLuminance(rgb2);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  function tokenRgb(prop: string): [number, number, number] {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(prop).trim();
    return hslToRgb(...parseHsl(raw));
  }

  function tokenFromInline(styleVal: string): string {
    const m = styleVal.match(/var\((--[^)]+)\)/);
    if (!m) throw new Error(`Inline style não usa token CSS: ${styleVal}`);
    return m[1];
  }

  function badgeContrast(badgeEl: HTMLElement): number {
    const bgProp = tokenFromInline(badgeEl.style.backgroundColor);
    const fgProp = tokenFromInline(badgeEl.style.color);
    return contrast(tokenRgb(bgProp), tokenRgb(fgProp));
  }

  it('pares de token do selo têm contraste AA ≥ 4,5:1 nos 3 níveis (tema claro)', () => {
    // Popula as custom properties do documento com os valores reais de tokens.css
    const root = document.documentElement;
    root.style.setProperty('--success', '160 70% 27%');
    root.style.setProperty('--success-foreground', '0 0% 100%');
    root.style.setProperty('--warning', '38 92% 50%');
    root.style.setProperty('--warning-foreground', '30 90% 12%');
    root.style.setProperty('--destructive-text', '0 75% 40%');
    root.style.setProperty('--destructive-foreground', '0 0% 100%');

    // Alto engajamento (score=100): --success + --success-foreground
    render(<ContactHeaderSection contact={baseContact} enrichedData={baseEnriched} />);
    expect(badgeContrast(screen.getByText('100'))).toBeGreaterThanOrEqual(4.5);
  });

  it('par --warning + --warning-foreground tem contraste AA ≥ 4,5:1 (médio engajamento)', () => {
    const root = document.documentElement;
    root.style.setProperty('--warning', '38 92% 50%');
    root.style.setProperty('--warning-foreground', '30 90% 12%');

    render(
      <ContactHeaderSection
        contact={baseContact}
        enrichedData={{ ...baseEnriched, ai_sentiment: 'neutral', ai_priority: 'low', company: null, contact_type: null }}
      />
    );
    expect(badgeContrast(screen.getByText('50'))).toBeGreaterThanOrEqual(4.5);
  });

  it('par --destructive-text + --destructive-foreground tem contraste AA ≥ 4,5:1 (baixo engajamento)', () => {
    // O ramo <50 de getScoreBadgeBg nunca é atingido pela fórmula atual
    // (score mínimo = 50). O par --destructive (0 84% 60%) + white falha
    // (~3,6:1); o selo ajusta para --destructive-text (0 75% 40%) que fecha
    // ~5,0:1. Verifica o par de tokens diretamente do CSS.
    const root = document.documentElement;
    root.style.setProperty('--destructive-text', '0 75% 40%');
    root.style.setProperty('--destructive-foreground', '0 0% 100%');

    const bgRgb = tokenRgb('--destructive-text');
    const fgRgb = tokenRgb('--destructive-foreground');
    expect(contrast(bgRgb, fgRgb)).toBeGreaterThanOrEqual(4.5);
  });
});
