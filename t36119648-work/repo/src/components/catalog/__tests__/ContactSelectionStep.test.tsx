import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Dialog } from '@/components/ui/dialog';
import { ContactSelectionStep } from '../ContactSelectionStep';
import type { ContactResult } from '../useSendProduct';

// CT-42 — a seção "Enviados recentemente" lê catalog_send_events via React
// Query; o teste controla o retorno sem montar um QueryClient.
const mockRecentSends = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/integrations/useCatalogRecentSends', () => ({
  useCatalogRecentSends: (...args: unknown[]) => mockRecentSends(...args),
  CATALOG_SEND_EVENTS_KEY: ['catalog-send-events'],
}));

const renderStep = (props: React.ComponentProps<typeof ContactSelectionStep>) =>
  render(<Dialog open><ContactSelectionStep {...props} /></Dialog>);

const contact: ContactResult = { id: 'c1', name: 'Tomaz', phone: '5511949600474', avatar_url: null };

const baseProps = {
  productName: 'Açucareiro em bambu',
  selectedImagesCount: 1,
  template: 'informal' as const,
  templateLabels: { formal: 'Formal', informal: 'Informal', promo: 'Promoção' },
  contactSearch: '',
  onContactSearchChange: vi.fn(),
  contactResults: [] as ContactResult[],
  searchingContacts: false,
  selectedContact: null as ContactResult | null,
  onSelectContact: vi.fn(),
  isSending: false,
  onBack: vi.fn(),
  onSend: vi.fn(),
};

beforeEach(() => {
  mockRecentSends.mockReset();
  mockRecentSends.mockReturnValue({ recent: [], topSent: [], isLoading: false, hasData: false });
  baseProps.onContactSearchChange = vi.fn();
  baseProps.onSelectContact = vi.fn();
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('ContactSelectionStep', () => {
  it('botão de enviar fica desabilitado sem contato selecionado', () => {
    renderStep({ ...baseProps });
    expect(screen.getByText('Selecione um contato').closest('button')).toBeDisabled();
  });

  it('com contato selecionado, o botão habilita e mostra o nome', () => {
    render(<Dialog open><ContactSelectionStep {...baseProps} selectedContact={contact} /></Dialog>);
    const btn = screen.getByText('Enviar para Tomaz').closest('button');
    expect(btn).not.toBeDisabled();
  });

  it('sem busca e sem resultados, mostra o estado vazio de "busque"', () => {
    renderStep({ ...baseProps });
    expect(screen.getByText('Busque por nome ou telefone')).toBeInTheDocument();
  });

  it('com busca e sem resultados, mostra "nenhum contato encontrado"', () => {
    render(<Dialog open><ContactSelectionStep {...baseProps} contactSearch="xyz" /></Dialog>);
    expect(screen.getByText('Nenhum contato encontrado')).toBeInTheDocument();
  });

  it('lista os resultados de contato retornados', () => {
    render(<Dialog open><ContactSelectionStep {...baseProps} contactSearch="tom" contactResults={[contact]} /></Dialog>);
    expect(screen.getByText('Tomaz')).toBeInTheDocument();
  });

  it('durante o envio, mostra "Enviando..." e desabilita o botão', () => {
    render(<Dialog open><ContactSelectionStep {...baseProps} selectedContact={contact} isSending /></Dialog>);
    expect(screen.getByText('Enviando...').closest('button')).toBeDisabled();
  });

  it('com bloqueio pré-envio, explica o motivo e desabilita o Enviar (CT-08)', () => {
    render(
      <Dialog open>
        <ContactSelectionStep
          {...baseProps}
          selectedContact={contact}
          sendBlockedReason="Nenhuma conexão de WhatsApp ativa. Reconecte a instância em Conexões para poder enviar."
        />
      </Dialog>
    );
    expect(screen.getByText(/Nenhuma conexão de WhatsApp ativa/)).toBeInTheDocument();
    expect(screen.getByText('Enviar para Tomaz').closest('button')).toBeDisabled();
  });

  it('enquanto a checagem pré-envio roda, o Enviar fica desabilitado (CT-08)', () => {
    render(<Dialog open><ContactSelectionStep {...baseProps} selectedContact={contact} checkingSendReadiness /></Dialog>);
    expect(screen.getByText('Enviar para Tomaz').closest('button')).toBeDisabled();
  });
});

describe('ContactSelectionStep — CT-41 (2 colunas, header e card-resumo)', () => {
  it('mostra o header com IconTile e o card-resumo com thumb 96, nome, modelo e N fotos', () => {
    const { container } = render(
      <Dialog open>
        <ContactSelectionStep
          {...baseProps}
          productImageUrl="https://x/produto.jpg"
          selectedImagesCount={3}
        />
      </Dialog>
    );

    // Header: IconTile com o ícone Users.
    expect(container.querySelector('.lucide-users')).not.toBeNull();

    // Card-resumo: thumb de 96px (w-24 h-24), nome do produto, modelo e contagem.
    const thumb = screen.getByAltText('Açucareiro em bambu');
    expect(thumb).toHaveClass('w-24', 'h-24');
    expect(thumb).toHaveAttribute('src', 'https://x/produto.jpg');
    expect(screen.getAllByText('Açucareiro em bambu').length).toBeGreaterThan(0);
    expect(screen.getByText('Modelo')).toBeInTheDocument();
    expect(screen.getByText('Informal')).toBeInTheDocument();
    expect(screen.getByText('3 foto(s)')).toBeInTheDocument();

    // Layout de 2 colunas (1fr + 300px no breakpoint md).
    expect(container.querySelector('.md\\:grid-cols-\\[1fr_300px\\]')).not.toBeNull();
  });

  it('sem imagem, o card-resumo cai no placeholder de 96px', () => {
    const { container } = renderStep({ ...baseProps });
    expect(screen.queryByAltText('Açucareiro em bambu')).not.toBeInTheDocument();
    expect(container.querySelector('.lucide-image-off')).not.toBeNull();
  });
});

describe('ContactSelectionStep — CT-42 (avatar, telefone formatado, radio e recentes)', () => {
  const contacts: ContactResult[] = [
    { id: 'c1', name: 'Tomaz Alves', phone: '5511949600474', avatar_url: null },
    { id: 'c2', name: 'Maria Souza', phone: '+55 (41) 9 9999-1234', avatar_url: 'https://x/maria.jpg' },
    { id: 'c3', name: 'João Lima', phone: '4133334444', avatar_url: null },
  ];

  it('lista 3 contatos com telefone formatado e radio acessível', () => {
    render(<Dialog open><ContactSelectionStep {...baseProps} contactSearch="to" contactResults={contacts} /></Dialog>);

    expect(screen.getAllByRole('radio')).toHaveLength(3);
    // Telefones normalizados em pt-BR, não mais a string crua do banco.
    expect(screen.getByText('+55 (11) 94960-0474')).toBeInTheDocument();
    expect(screen.getByText('+55 (41) 99999-1234')).toBeInTheDocument();
    expect(screen.getByText('+55 (41) 3333-4444')).toBeInTheDocument();
    expect(screen.queryByText('5511949600474')).not.toBeInTheDocument();

    // Avatar com iniciais: sem foto, o fallback leva as iniciais no aria-label.
    expect(screen.getByLabelText('Tomaz Alves')).toBeInTheDocument();
    // Com avatar_url, vira <img>.
    expect(screen.getByAltText('Maria Souza')).toHaveAttribute('src', 'https://x/maria.jpg');
  });

  it('clicar na linha seleciona o contato (radio marcado)', () => {
    render(
      <Dialog open>
        <ContactSelectionStep {...baseProps} contactSearch="to" contactResults={contacts} selectedContact={contacts[1]} />
      </Dialog>
    );

    expect(screen.getByRole('radio', { name: /Maria Souza/ })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: /João Lima/ }));
    expect(baseProps.onSelectContact).toHaveBeenCalledWith(contacts[2]);
  });

  it('mostra "Enviados recentemente" acima dos resultados, a partir de catalog_send_events', () => {
    mockRecentSends.mockReturnValue({
      recent: [
        { id: 'e1', contact_id: 'c3', contact_name: 'João Lima' },
        { id: 'e2', contact_id: 'c3', contact_name: 'João Lima' },
        { id: 'e3', contact_id: 'c1', contact_name: 'Tomaz Alves' },
      ],
      topSent: [], isLoading: false, hasData: true,
    });

    render(<Dialog open><ContactSelectionStep {...baseProps} contactSearch="" contactResults={contacts} /></Dialog>);

    const heading = screen.getByText('Enviados recentemente');
    expect(heading).toBeInTheDocument();

    // Ordem: o envio mais novo primeiro (c3, depois c1) e sem repetir o mesmo contato.
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(radios[0]).toHaveAccessibleName(/João Lima/);
    expect(radios[1]).toHaveAccessibleName(/Tomaz Alves/);

    // A seção fica acima do primeiro resultado não-recente.
    expect(heading.compareDocumentPosition(radios[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('durante uma busca a seção de recentes sai de cena', () => {
    mockRecentSends.mockReturnValue({
      recent: [{ id: 'e1', contact_id: 'c3', contact_name: 'João Lima' }],
      topSent: [], isLoading: false, hasData: true,
    });

    render(<Dialog open><ContactSelectionStep {...baseProps} contactSearch="tom" contactResults={contacts} /></Dialog>);

    expect(screen.queryByText('Enviados recentemente')).not.toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });
});

describe('ContactSelectionStep — CT-43 (mínimo de caracteres e link Criar contato)', () => {
  it('com 1 caractere, avisa o mínimo em vez de buscar', () => {
    render(<Dialog open><ContactSelectionStep {...baseProps} contactSearch="t" /></Dialog>);
    expect(screen.getByText('Digite ao menos 2 caracteres para buscar.')).toBeInTheDocument();
  });

  it('no estado vazio oferece o link "Criar contato" que leva para a view de contatos', () => {
    renderStep({ ...baseProps });

    const link = screen.getByRole('link', { name: /Criar contato/ });
    expect(link).toHaveAttribute('href', '?view=contacts');

    fireEvent.click(link);
    expect(new URLSearchParams(window.location.search).get('view')).toBe('contacts');
  });
});

describe('ContactSelectionStep — CT-46 (progresso real do envio)', () => {
  it('mostra "Enviando 2/4..." com o contador de mensagens', () => {
    render(
      <Dialog open>
        <ContactSelectionStep
          {...baseProps}
          selectedContact={contact}
          isSending
          sendProgress={{ done: 2, total: 4 }}
        />
      </Dialog>
    );

    const btn = screen.getByText('Enviando 2/4...').closest('button');
    expect(btn).toBeDisabled();
  });
});

describe('ContactSelectionStep — CT-44 (rail de resumo e aviso de prontidão)', () => {
  it('mostra o RailCard "Resumo do envio" com as 4 linhas do envio', () => {
    render(
      <Dialog open>
        <ContactSelectionStep {...baseProps} variantLabel="Azul" selectedImagesCount={3} />
      </Dialog>
    );

    expect(screen.getByText('Resumo do envio')).toBeInTheDocument();
    expect(screen.getByText('Produto')).toBeInTheDocument();
    expect(screen.getByText('Modelo')).toBeInTheDocument();
    expect(screen.getByText('Variação')).toBeInTheDocument();
    expect(screen.getByText('Azul')).toBeInTheDocument();
    expect(screen.getByText('Fotos')).toBeInTheDocument();
    expect(screen.getByText('3 foto(s)')).toBeInTheDocument();
  });

  it('sem contato, não anuncia "Pronto para enviar!"', () => {
    renderStep({ ...baseProps });

    expect(screen.queryByText('Pronto para enviar!')).not.toBeInTheDocument();
  });

  it('com contato, anuncia "Pronto para enviar!" numa região aria-live', () => {
    render(
      <Dialog open>
        <ContactSelectionStep {...baseProps} selectedContact={contact} />
      </Dialog>
    );

    const aviso = screen.getByText('Pronto para enviar!');
    expect(aviso.closest('[aria-live="polite"]')).not.toBeNull();
  });

  it('com bloqueio pré-envio, não anuncia prontidão (não duplica o aviso de bloqueio)', () => {
    render(
      <Dialog open>
        <ContactSelectionStep {...baseProps} selectedContact={contact} sendBlockedReason="Sem conexão ativa" />
      </Dialog>
    );

    expect(screen.queryByText('Pronto para enviar!')).not.toBeInTheDocument();
    expect(screen.getByText('Sem conexão ativa')).toBeInTheDocument();
  });
});