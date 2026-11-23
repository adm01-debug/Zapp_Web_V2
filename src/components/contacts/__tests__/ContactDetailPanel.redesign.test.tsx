/**
 * ZD-071..080 — ficha do contato do redesign (Fase G).
 *
 * Contratos verificados aqui, todos medidos no design
 * (`docs/design/contatos-redesign-2026-10-12/comportamento`):
 *  - casca: header com breadcrumb, navegação anterior/próximo só quando há
 *    recorte com mais de um contato, e o rótulo de fechar que o app já usa;
 *  - quatro abas com semântica ARIA completa e ciclagem por setas;
 *  - "Visão geral" não afirma nada que o contato não tenha (nada de
 *    "Não informado");
 *  - anterior/próximo circulam dentro do recorte exibido.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContactDetailPanel } from '../ContactDetailPanel';

const contact = {
  id: 'c1',
  name: 'Ana',
  surname: 'Ribeiro',
  nickname: null,
  phone: '+5511999992048',
  email: 'ana@empresa.com',
  company: 'Empresa X',
  job_title: 'Diretora',
  avatar_url: null,
  contact_type: 'cliente',
  tags: ['vip'],
  created_at: '2026-01-10T12:00:00.000Z',
  address: null,
  assigned_to: null,
};

vi.mock('@/services/contact.service', () => ({
  ContactService: {
    fetchStats: vi.fn().mockResolvedValue({ totalMessages: 0 }),
    getLastMessageDates: vi.fn().mockResolvedValue({ data: [], error: null }),
  },
}));

vi.mock('../ContactActivityTimeline', () => ({
  ContactActivityTimeline: () => <div data-testid="timeline" />,
}));
vi.mock('../ContactNotes', () => ({ ContactNotes: () => <div data-testid="notes" /> }));
vi.mock('../ContactEngagementScore', () => ({
  ContactEngagementScore: () => <div data-testid="engagement" />,
}));
vi.mock('@/hooks/integrations/useCatalogSendHistory', () => ({
  useCatalogSendHistory: () => ({ rows: [], isLoading: false, error: null }),
}));
vi.mock('@/components/catalog/ExternalProductCatalog', () => ({
  ExternalProductCatalog: ({ trigger }: { trigger: React.ReactNode }) => <div>{trigger}</div>,
}));
vi.mock('@/hooks/crm/useContactSidebar', () => ({
  useContactSidebar: () => ({ data: null, status: 'disabled', refetch: vi.fn() }),
}));

const renderPanel = (props: Partial<React.ComponentProps<typeof ContactDetailPanel>> = {}) => {
  const onNavigate = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={client}>
      <ContactDetailPanel
        contact={contact}
        onClose={vi.fn()}
        onOpenChat={vi.fn()}
        onEdit={vi.fn()}
        onNavigate={onNavigate}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onNavigate };
};

describe('ficha do contato — casca e navegação (ZD-071/ZD-078)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sem recorte de resultado não mostra anterior/próximo', () => {
    renderPanel();
    expect(screen.queryByRole('button', { name: 'Ver contato anterior' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver próximo contato' })).not.toBeInTheDocument();
  });

  it('recorte com um contato só também não mostra anterior/próximo', () => {
    renderPanel({ resultadoAtual: [{ id: 'c1' }] });
    expect(screen.queryByRole('button', { name: 'Ver próximo contato' })).not.toBeInTheDocument();
  });

  it('recorte com vários contatos circula nos dois sentidos', () => {
    const { onNavigate } = renderPanel({
      resultadoAtual: [{ id: 'c0' }, { id: 'c1' }, { id: 'c2' }],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Ver próximo contato' }));
    expect(onNavigate).toHaveBeenLastCalledWith('c2');

    fireEvent.click(screen.getByRole('button', { name: 'Ver contato anterior' }));
    expect(onNavigate).toHaveBeenLastCalledWith('c0');
  });

  it('último do recorte volta para o primeiro (circular)', () => {
    const { onNavigate } = renderPanel({
      contact: { ...contact, id: 'c2' },
      resultadoAtual: [{ id: 'c0' }, { id: 'c1' }, { id: 'c2' }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ver próximo contato' }));
    expect(onNavigate).toHaveBeenLastCalledWith('c0');
  });

  it('clique no overlay fecha a ficha', () => {
    const onClose = vi.fn();
    const { container } = renderPanel({ onClose });
    const overlay = container.ownerDocument.querySelector('.fixed.inset-0.z-50') as HTMLElement;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ficha do contato — abas (ZD-073)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('expõe as quatro abas com ARIA completo e "Visão geral" selecionada', () => {
    renderPanel();
    const tablist = screen.getByRole('tablist', { name: 'Informações do contato' });
    const abas = within(tablist).getAllByRole('tab');
    expect(abas.map((aba) => aba.textContent)).toEqual([
      'Visão geral', 'Perfil Singu', 'Histórico', 'Anotações',
    ]);
    expect(abas[0]).toHaveAttribute('aria-selected', 'true');
    expect(abas[0]).toHaveAttribute('aria-controls', 'zc-profile-content');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'zc-tab-details');
  });

  it('clicar em "Histórico" mostra a linha do tempo e desmonta a visão geral', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Histórico' }));
    expect(screen.getByTestId('timeline')).toBeInTheDocument();
    expect(screen.queryByText('Dados profissionais')).not.toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'zc-tab-history');
  });

  it('clicar em "Anotações" mostra as notas', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Anotações' }));
    expect(screen.getByTestId('notes')).toBeInTheDocument();
  });

  it('setas do teclado ciclam as abas e movem o foco', () => {
    renderPanel();
    const primeira = screen.getByRole('tab', { name: 'Visão geral' });
    primeira.focus();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Visão geral' }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Perfil Singu' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowLeft' });
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Anotações' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('ficha do contato — visão geral (ZD-074)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('mostra só o que existe: nada de "Não informado"', () => {
    renderPanel();
    expect(screen.getByText('Dados profissionais')).toBeInTheDocument();
    expect(screen.getByText('Dados pessoais')).toBeInTheDocument();
    // Empresa aparece duas vezes: na identidade da coluna esquerda e no grupo.
    expect(screen.getAllByText('Empresa X').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Diretora').length).toBeGreaterThan(0);
    expect(screen.queryByText(/não informado/i)).not.toBeInTheDocument();
  });

  it('não renderiza grupo de redes sociais quando não há link', () => {
    renderPanel();
    expect(screen.getByText('Nenhuma rede social vinculada a este contato.')).toBeInTheDocument();
  });
});