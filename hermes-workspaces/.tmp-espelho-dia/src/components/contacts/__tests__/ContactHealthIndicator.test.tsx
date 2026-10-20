/**
 * Completude do cadastro — o indicador REAL (ContactHealthIndicator), o cartão
 * REAL (ContactCard) e a ficha REAL (ContactDetailPanel).
 *
 * Prova o critério do cartão: a completude fica visível e explicada nos cartões
 * e na ficha, com barra + número + nível em TEXTO (a cor não é o único sinal) e a
 * lista dos campos que faltam. Os mocks da ficha são os mesmos de
 * `ContactDetailPanel.activity.test.tsx` (filhos que falam com a rede, fora).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContactCard, ContactHealthIndicator } from '../ContactCard';
import { ContactDetailPanel } from '../ContactDetailPanel';
import { baseContact, noop } from './contactDeleteFixtures';
import type { Contact } from '../types';

vi.mock('@/services/contact.service', () => ({
  ContactService: {
    fetchStats: vi.fn().mockResolvedValue({
      totalMessages: 0,
      avgResponseTimeMinutes: null,
      totalConversations: 0,
      messagesChangePercent: null,
      conversationsChangePercent: null,
      csatAverage: null,
      csatCount: 0,
    }),
    getLastMessageDates: vi.fn().mockResolvedValue({ data: [], error: null }),
  },
}));

vi.mock('../ContactActivityTimeline', () => ({ ContactActivityTimeline: () => <div data-testid="timeline" /> }));
vi.mock('../ContactNotes', () => ({ ContactNotes: () => <div data-testid="notes" /> }));
vi.mock('../ContactPurchaseHistory', () => ({ ContactPurchaseHistory: () => <div data-testid="purchases" /> }));
vi.mock('@/hooks/integrations/useCatalogSendHistory', () => ({
  useCatalogSendHistory: () => ({ rows: [], isLoading: false, error: null }),
}));
vi.mock('@/components/catalog/ExternalProductCatalog', () => ({
  ExternalProductCatalog: ({ trigger }: { trigger?: React.ReactNode }) => <div>{trigger}</div>,
}));
vi.mock('../ContactEngagementScore', () => ({ ContactEngagementScore: () => <div data-testid="engagement-score" /> }));

function cardProps(contact: Contact) {
  return {
    contact,
    isSelected: false,
    onToggleSelect: noop,
    onOpenDetails: noop,
    onOpenChat: noop,
    onEdit: noop,
    onDelete: noop,
    index: 0,
  };
}

describe('ContactHealthIndicator', () => {
  it('mostra número, nível em texto e barra com papel/valores acessíveis', () => {
    render(<ContactHealthIndicator input={{ name: 'Ana Souza', phone: '5511999999999', email: null }} />);

    const indicador = screen.getByTestId('contact-health');
    // 40 preenchidos de 55 avaliados (nome+telefone+e-mail) = 73%
    expect(screen.getByTestId('contact-health-score')).toHaveTextContent('73%');
    expect(screen.getByTestId('contact-health-level')).toHaveTextContent('Bom');
    expect(indicador).toHaveAttribute('data-level', 'bom');

    const barra = screen.getByRole('progressbar');
    expect(barra).toHaveAttribute('aria-valuenow', '73');
    expect(barra).toHaveAttribute('aria-valuemin', '0');
    expect(barra).toHaveAttribute('aria-valuemax', '100');
    expect(barra).toHaveAttribute('aria-label', 'Completude do cadastro: 73 de 100 — Bom');
  });

  it('no cartão (sm) explica as faltas no title, sem lista visível', () => {
    render(<ContactHealthIndicator input={{ name: 'Ana Souza', phone: '5511999999999', email: null, company: null }} />);

    expect(screen.getByTestId('contact-health')).toHaveAttribute(
      'title',
      'Completude do cadastro: 62% — Faltam: E-mail, Empresa',
    );
    expect(screen.queryByTestId('contact-health-missing')).not.toBeInTheDocument();
  });

  it('na ficha (md) lista os campos que faltam, em pt-BR e na ordem dos pesos', () => {
    render(<ContactHealthIndicator input={{ name: null, phone: null, email: null }} size="md" />);

    expect(screen.getByTestId('contact-health-missing')).toHaveTextContent('Faltam: Nome, Telefone, E-mail');
    expect(screen.getByTestId('contact-health-score')).toHaveTextContent('0%');
    expect(screen.getByTestId('contact-health-level')).toHaveTextContent('Crítico');
  });

  it('cadastro vazio não inventa nota: Sem dados e sem lista de faltas', () => {
    render(<ContactHealthIndicator input={{}} size="md" />);

    expect(screen.getByTestId('contact-health-score')).toHaveTextContent('0%');
    expect(screen.getByTestId('contact-health-level')).toHaveTextContent('Sem dados');
    expect(screen.getByTestId('contact-health-missing')).toHaveTextContent('Sem campos para avaliar');
  });
});

describe('ContactCard · completude', () => {
  it('o cartão REAL mostra o indicador com a nota do contato', () => {
    render(
      <ContactCard
        {...cardProps(
          baseContact({ email: 'ana@exemplo.com', company: 'Promo Brindes', job_title: 'Compras' }),
        )}
      />,
    );

    // nome+tipo+telefone+e-mail+empresa+cargo preenchidos; endereço/responsável
    // não vêm na lista (search_contacts não devolve) => não avaliados. 100%.
    const indicador = screen.getByTestId('contact-health');
    expect(indicador).toBeInTheDocument();
    expect(screen.getByTestId('contact-health-score')).toHaveTextContent('100%');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('o cartão REAL explica o que falta quando o contato está incompleto', () => {
    render(<ContactCard {...cardProps(baseContact({ email: null, company: null, job_title: null }))} />);

    // nome(20)+telefone(20)+tipo(10) de 85 avaliados = 59%
    expect(screen.getByTestId('contact-health-score')).toHaveTextContent('59%');
    expect(screen.getByTestId('contact-health-level')).toHaveTextContent('Incompleto');
    expect(screen.getByTestId('contact-health')).toHaveAttribute(
      'title',
      'Completude do cadastro: 59% — Faltam: E-mail, Empresa, Cargo',
    );
  });
});

describe('ContactDetailPanel · completude', () => {
  type FichaContact = {
    id: string;
    name: string;
    phone: string;
    created_at: string;
    email?: string | null;
    company?: string | null;
    job_title?: string | null;
    contact_type?: string | null;
    address?: string | null;
  };

  function renderPanel(contact: FichaContact) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <ContactDetailPanel contact={contact} onClose={noop} onOpenChat={noop} onEdit={noop} />
      </QueryClientProvider>,
    );
  }

  it('a ficha REAL exibe a seção "Completude do cadastro" com a lista do que falta', () => {
    renderPanel({
      id: 'c1',
      name: 'Maria Silva',
      phone: '5541999990000',
      email: null,
      company: null,
      job_title: null,
      contact_type: 'cliente',
      address: null,
      created_at: '2026-01-01T00:00:00Z',
    });

    expect(screen.getByText('Completude do cadastro')).toBeInTheDocument();
    // nome(20)+telefone(20)+tipo(10) de 95 avaliados = 53%
    expect(screen.getByTestId('contact-health-score')).toHaveTextContent('53%');
    expect(screen.getByTestId('contact-health-missing')).toHaveTextContent('Faltam: E-mail, Empresa, Cargo, Endereço');
  });

  it('a ficha REAL não cobra o responsável que a lista não carrega', () => {
    renderPanel({
      id: 'c2',
      name: 'Maria Silva',
      phone: '5541999990000',
      email: 'maria@exemplo.com',
      company: 'Promo Brindes',
      job_title: 'Marketing',
      contact_type: 'cliente',
      address: 'Av. B, 200',
      created_at: '2026-01-01T00:00:00Z',
    });

    expect(screen.getByTestId('contact-health-missing')).toHaveTextContent('Cadastro completo');
  });
});
