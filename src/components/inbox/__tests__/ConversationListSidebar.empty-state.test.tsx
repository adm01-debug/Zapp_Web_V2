/**
 * Cartão t_b01b53c0 — a lista de conversas vazia precisa dizer POR QUE está
 * vazia. Antes, `ConversationListSidebar` mostrava "Sem conversas… Novas
 * conversas aparecerão aqui" mesmo quando o escopo "Meus" (ou a busca, a fila e
 * o tipo de contato) escondia todas as conversas: o atendente acreditava que não
 * havia conversa nenhuma.
 *
 * Cada teste renderiza o componente REAL e dispara o evento do usuário (clique
 * no atalho) — cobre os ramos: filtros escondendo tudo, banco vazio, busca,
 * aba Arquivadas e modo offline.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@/hooks/ui/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/components/mobile/MobilePullToRefresh', () => ({
  MobilePullToRefreshIndicator: () => null,
}));
vi.mock('@/components/errors/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/inbox/BulkActionsToolbar', () => ({ BulkActionsToolbar: () => null }));
vi.mock('@/components/inbox/InboxFilters', () => ({ InboxFilters: () => null }));
vi.mock('@/components/inbox/conversation-list/StatusChips', () => ({ StatusChips: () => null }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock('@/components/inbox/VirtualizedRealtimeList', () => ({
  VirtualizedRealtimeList: () => <div data-testid="vrl-stub" />,
}));
vi.mock('@/components/inbox/CloseConversationDialog', () => ({
  CloseConversationDialog: () => null,
}));
vi.mock('@/components/inbox/TransferDialog', () => ({ TransferDialog: () => null }));

import { ConversationListSidebar } from '@/components/inbox/ConversationListSidebar';

type Conv = { contact: { id: string } };

interface Opts {
  conversations?: Conv[];
  filtered?: Conv[];
  chipTab?: string;
  showAll?: boolean;
  search?: string;
  selectedContactType?: string | null;
  chipCounts?: Record<string, number>;
  usingCache?: boolean;
}

const ZERO_COUNTS = { all: 0, unread: 0, attending: 0, waiting: 0, resolved: 0, archived: 0 };

function makeProps(opts: Opts = {}) {
  const {
    conversations = [],
    filtered = [],
    chipTab = 'attending',
    showAll = false,
    search = '',
    selectedContactType = 'all',
    chipCounts = ZERO_COUNTS,
    usingCache = false,
  } = opts;

  return {
    inbox: {
      selectedContactId: null,
      isOnline: true,
      cachedConversations: conversations,
      conversations,
      usingCache,
      loading: false,
      refetch: vi.fn(),
      handleSelectConversation: vi.fn(),
    },
    inboxFilters: {
      filteredConversations: filtered,
      search,
      setSearch: vi.fn(),
      filters: {},
      setFilters: vi.fn(),
      showAll,
      setShowAll: vi.fn(),
      selectedContactType,
      handleContactTypeChange: vi.fn(),
      selectedQueueId: null,
      setSelectedQueueId: vi.fn(),
      chipTab,
      setChipTab: vi.fn(),
      chipCounts,
    },
    bulkActions: {
      selectedIds: new Set<string>(),
      bulkMarkAsRead: vi.fn(),
      bulkTransfer: vi.fn(),
      bulkArchive: vi.fn(),
      clearSelection: vi.fn(),
      bulkLoading: false,
      selectionMode: false,
      toggleSelection: vi.fn(),
    },
    pullToRefresh: {
      isRefreshing: false,
      pullProgress: 0,
      pullDistance: 0,
      containerRef: { current: null },
      handlers: {},
    },
    conversationActions: undefined,
  };
}

const three: Conv[] = [
  { contact: { id: 'c1' } },
  { contact: { id: 'c2' } },
  { contact: { id: 'c3' } },
];

describe('ConversationListSidebar — lista vazia explica o que está escondendo', () => {
  it('filtros escondem tudo: diz quantas há no total e oferece atalhos com contagem', () => {
    render(
      <ConversationListSidebar
        {...makeProps({
          conversations: three,
          filtered: [],
          chipTab: 'all',
          chipCounts: { ...ZERO_COUNTS, all: 3, waiting: 2, unread: 1 },
        })}
      />
    );

    expect(
      screen.getByText('Nenhuma conversa nesta aba (3 no total). Ajuste os filtros.')
    ).toBeInTheDocument();
    // Nunca deve dizer "Sem conversas" quando existem 3 carregadas.
    expect(screen.queryByText('Sem conversas')).not.toBeInTheDocument();
    // O subtítulo "Novas conversas aparecerão aqui" some quando os filtros escondem.
    expect(screen.queryByText('Novas conversas aparecerão aqui.')).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Ver aguardando (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver não lidas (1)' })).toBeInTheDocument();
  });

  it('atalho "Ver aguardando" é um botão de teclado e troca o chip para waiting', () => {
    const props = makeProps({
      conversations: three,
      filtered: [],
      chipTab: 'all',
      chipCounts: { ...ZERO_COUNTS, all: 3, waiting: 2 },
    });
    render(<ConversationListSidebar {...props} />);

    const btn = screen.getByRole('button', { name: 'Ver aguardando (2)' });
    expect(btn.tagName).toBe('BUTTON');
    expect(btn).toHaveAttribute('type', 'button');

    fireEvent.click(btn);
    expect(props.inboxFilters.setChipTab).toHaveBeenCalledWith('waiting');
  });

  it('escopo "Meus" esconde tudo: "Ver todos os atendentes" liga o showAll', () => {
    const props = makeProps({
      conversations: three,
      filtered: [],
      chipTab: 'attending',
      showAll: false,
      chipCounts: { ...ZERO_COUNTS, all: 3, waiting: 2, attending: 0 },
    });
    render(<ConversationListSidebar {...props} />);

    // "Ver atendendo" some com contagem 0 (não há o que mostrar), mas
    // "Ver todos os atendentes" existe porque o escopo "Meus" é que esconde.
    expect(screen.queryByRole('button', { name: /Ver atendendo/ })).not.toBeInTheDocument();
    const btn = screen.getByRole('button', { name: 'Ver todos os atendentes' });
    fireEvent.click(btn);
    expect(props.inboxFilters.setShowAll).toHaveBeenCalledWith(true);
  });

  it('tipo de contato escondendo: "Limpar filtro de tipo" limpa o filtro', () => {
    const props = makeProps({
      conversations: three,
      filtered: [],
      chipTab: 'all',
      selectedContactType: 'cliente',
      chipCounts: { ...ZERO_COUNTS, all: 0 },
    });
    render(<ConversationListSidebar {...props} />);

    expect(
      screen.getByText('Nenhuma conversa nesta aba (3 no total). Ajuste os filtros.')
    ).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: 'Limpar filtro de tipo' });
    fireEvent.click(btn);
    expect(props.inboxFilters.handleContactTypeChange).toHaveBeenCalledWith(null);
  });

  it('contagens zeradas: nenhum atalho é oferecido', () => {
    render(
      <ConversationListSidebar
        {...makeProps({ conversations: three, filtered: [], chipTab: 'all' })}
      />
    );

    expect(
      screen.getByText('Nenhuma conversa nesta aba (3 no total). Ajuste os filtros.')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('inbox-empty-shortcuts')).not.toBeInTheDocument();
  });

  it('banco realmente vazio: mantém "Sem conversas" e não oferece atalhos', () => {
    render(<ConversationListSidebar {...makeProps({ conversations: [], filtered: [] })} />);

    expect(screen.getByText('Sem conversas')).toBeInTheDocument();
    expect(screen.getByText('Novas conversas aparecerão aqui.')).toBeInTheDocument();
    expect(screen.queryByTestId('inbox-empty-shortcuts')).not.toBeInTheDocument();
    expect(screen.queryByText(/no total/)).not.toBeInTheDocument();
  });

  it('busca ativa: "Nenhuma conversa encontrada" (não confunde com banco vazio)', () => {
    render(
      <ConversationListSidebar
        {...makeProps({ conversations: three, filtered: [], chipTab: 'all', search: 'zzz' })}
      />
    );

    expect(screen.getByText('Nenhuma conversa encontrada')).toBeInTheDocument();
    expect(screen.queryByTestId('inbox-empty-shortcuts')).not.toBeInTheDocument();
  });

  it('aba Arquivadas vazia: mensagem própria e sem o subtítulo de novas conversas', () => {
    render(
      <ConversationListSidebar
        {...makeProps({ conversations: three, filtered: [], chipTab: 'archived' })}
      />
    );

    expect(screen.getByText('Nenhuma conversa arquivada')).toBeInTheDocument();
    expect(screen.queryByText('Novas conversas aparecerão aqui.')).not.toBeInTheDocument();
    expect(screen.queryByTestId('inbox-empty-shortcuts')).not.toBeInTheDocument();
  });

  it('modo offline: mensagem própria em vez de "Sem conversas"', () => {
    render(
      <ConversationListSidebar
        {...makeProps({ conversations: three, filtered: [], chipTab: 'all', usingCache: true })}
      />
    );

    expect(screen.getByText('Modo offline — sem dados em cache')).toBeInTheDocument();
    expect(screen.queryByText('Sem conversas')).not.toBeInTheDocument();
    expect(screen.queryByTestId('inbox-empty-shortcuts')).not.toBeInTheDocument();
  });

  it('a mensagem do estado vazio é anunciada (role=status)', () => {
    render(
      <ConversationListSidebar
        {...makeProps({
          conversations: three,
          filtered: [],
          chipTab: 'all',
          chipCounts: { ...ZERO_COUNTS, all: 3, waiting: 1 },
        })}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Nenhuma conversa nesta aba (3 no total). Ajuste os filtros.'
    );
  });

  it('lista com conversas não mostra estado vazio', () => {
    render(
      <ConversationListSidebar
        {...makeProps({ conversations: three, filtered: [{ contact: { id: 'c1' } }] })}
      />
    );

    expect(screen.getByTestId('vrl-stub')).toBeInTheDocument();
    expect(screen.queryByTestId('inbox-empty-state')).not.toBeInTheDocument();
  });
});
