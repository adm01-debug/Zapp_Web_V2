/**
 * CT-54 — histórico "Produtos enviados" no perfil do contato.
 *
 * O painel inteiro depende de muitos contextos (score, compras, catálogo); o
 * aceite ("teste RTL com mock") é cumprido testando o bloco de histórico com o
 * hook mockado: com itens mostra a lista, sem itens mostra o estado vazio — e o
 * contactId do perfil é passado ao hook (é o recorte por destinatário; a RLS
 * por agente continua sendo a fonte de verdade do escopo).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockUseCatalogSendHistory = vi.fn();

vi.mock('@/hooks/integrations/useCatalogSendHistory', () => ({
  useCatalogSendHistory: (opts: unknown) => mockUseCatalogSendHistory(opts),
}));

import { ContactCatalogSendHistory } from '@/components/contacts/ContactDetailPanel';

const linha = {
  id: 'evt-1',
  product_name: 'Caneca Personalizada',
  variant_label: 'Azul',
  status: 'sent',
  created_at: '2026-10-01T12:00:00Z',
};

beforeEach(() => {
  mockUseCatalogSendHistory.mockReset();
});

describe('ContactCatalogSendHistory — CT-54', () => {
  it('passa o contactId do perfil para o hook (recorte por destinatário)', () => {
    mockUseCatalogSendHistory.mockReturnValue({ rows: [], isLoading: false, error: null });
    render(<ContactCatalogSendHistory contactId="contato-1" />);
    expect(mockUseCatalogSendHistory).toHaveBeenCalledWith({ contactId: 'contato-1' });
  });

  it('com itens: lista o produto enviado, a variação e o status', () => {
    mockUseCatalogSendHistory.mockReturnValue({ rows: [linha], isLoading: false, error: null });
    render(<ContactCatalogSendHistory contactId="contato-1" />);
    expect(screen.getByTestId('send-history-list')).toBeInTheDocument();
    expect(screen.getByText('Caneca Personalizada')).toBeInTheDocument();
    expect(screen.getByText('Azul')).toBeInTheDocument();
    expect(screen.getByText('Enviado')).toBeInTheDocument();
  });

  it('sem itens: mostra o estado vazio em vez de "carregando para sempre"', () => {
    mockUseCatalogSendHistory.mockReturnValue({ rows: [], isLoading: false, error: null });
    render(<ContactCatalogSendHistory contactId="contato-1" />);
    expect(screen.getByTestId('send-history-empty')).toBeInTheDocument();
    expect(screen.getByText(/Nenhum produto enviado/i)).toBeInTheDocument();
  });

  it('carregando: mostra o esqueleto e não o vazio', () => {
    mockUseCatalogSendHistory.mockReturnValue({ rows: [], isLoading: true, error: null });
    render(<ContactCatalogSendHistory contactId="contato-1" />);
    expect(screen.getByTestId('send-history-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('send-history-empty')).toBeNull();
  });

  it('erro: mostra a mensagem de falha do histórico', () => {
    mockUseCatalogSendHistory.mockReturnValue({ rows: [], isLoading: false, error: new Error('boom') });
    render(<ContactCatalogSendHistory contactId="contato-1" />);
    expect(screen.getByTestId('send-history-error')).toBeInTheDocument();
  });
});
