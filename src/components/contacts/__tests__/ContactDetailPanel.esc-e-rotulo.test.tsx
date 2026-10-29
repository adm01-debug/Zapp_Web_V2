/**
 * #CT: o painel de detalhe tinha um listener próprio de `Escape` no `document`.
 * Com um diálogo Radix aberto por cima (ex.: editar contato), um único `Esc`
 * fechava o diálogo E o painel — duas camadas de uma vez. O `Esc` agora é só do
 * handler central (`useContactsViewState`), que fecha a camada de topo. Aqui o
 * painel REAL é renderizado e prova que ele NÃO consome mais o `Esc`, e que o
 * botão de fechar tem nome acessível.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContactDetailPanel } from '../ContactDetailPanel';

vi.mock('@/services/contact.service', () => ({
  ContactService: {
    fetchStats: vi.fn().mockResolvedValue({ messageCount: 0, lastMessageAt: null }),
    getLastMessageDates: vi.fn().mockResolvedValue([]),
  },
}));

// Filhos que falam com a rede: fora do escopo deste teste.
vi.mock('../ContactActivityTimeline', () => ({ ContactActivityTimeline: () => <div /> }));
vi.mock('../ContactNotes', () => ({ ContactNotes: () => <div /> }));
vi.mock('../ContactPurchaseHistory', () => ({ ContactPurchaseHistory: () => <div /> }));
vi.mock('@/hooks/integrations/useCatalogSendHistory', () => ({
  useCatalogSendHistory: () => ({ rows: [], isLoading: false, error: null }),
}));
vi.mock('@/components/catalog/ExternalProductCatalog', () => ({
  ExternalProductCatalog: ({ trigger }: { trigger?: React.ReactNode }) => <div>{trigger}</div>,
}));
vi.mock('../ContactEngagementScore', () => ({ ContactEngagementScore: () => <div /> }));

const CONTACT = {
  id: 'c1',
  name: 'Maria Silva',
  phone: '5541999990000',
  created_at: '2026-01-01T00:00:00Z',
};

function renderPanel(onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <ContactDetailPanel contact={CONTACT as any} onClose={onClose} onOpenChat={vi.fn()} onEdit={vi.fn()} />
    </QueryClientProvider>,
  );
  return onClose;
}

describe('ContactDetailPanel — Esc não fecha a camada de baixo', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('não reage ao Escape por conta própria (o Esc do painel é do handler central)', () => {
    const onClose = renderPanel();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('o botão de fechar tem nome acessível e fecha ao clique', () => {
    const onClose = renderPanel();
    const close = screen.getByRole('button', { name: 'Fechar detalhes do contato' });
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
