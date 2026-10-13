/**
 * Cartão t_af5f0777 — prova unitária do topo da barra de conversas (desktop)
 * em ConversationListSidebar.tsx, sem tocar nos componentes.
 *
 * Layout provado (ordem no DOM):
 *   título "Conversas" + Atualizar + Zen → contagem → chips → Filtros + busca → lista.
 *
 * O que este arquivo prova e como:
 *  1. Ordem relativa no DOM (compareDocumentPosition) com o StatusChips REAL;
 *  2. Existe EXATAMENTE UM botão acessível "Atualizar conversas" e ele chama
 *     inbox.refetch; no desktop o InboxFilters não recebe onRefetch (o segundo
 *     botão de atualizar era o do InboxFilters — o marcador `filtros` só vira
 *     `filtros-com-refetch` se a prop voltar);
 *  3. O chip ativo reflete o `chipTab` que a sidebar recebe e o clique repassa
 *     por inboxFilters.setChipTab (fixture de conversas real, StatusChips real);
 *  4. axe sem violações critical/serious nos temas claro E escuro.
 *
 * O aria-pressed dos chips (item 3 do cartão) está como `it.todo`: o atributo
 * pertence a StatusChips.tsx, que no base desta branch ainda é o componente
 * antigo (o redesign dos chips em pílula/badge com aria-pressed é o commit
 * abcef6f8e, retirado da fila — refazer em t_b8496016). Sem o atributo o caso
 * ficaria vermelho por dependência, não por defeito deste cartão.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import type { ReactNode } from 'react';
import type { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';

vi.mock('@/hooks/ui/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'auth-user-1' }, profile: { id: 'perfil-1' } }),
}));
vi.mock('@/contexts/LayoutContext', () => ({
  useLayoutContext: () => ({ isZen: false, toggleZen: vi.fn() }),
}));
vi.mock('@/components/mobile/MobilePullToRefresh', () => ({
  MobilePullToRefreshIndicator: () => null,
}));
vi.mock('@/components/errors/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/inbox/BulkActionsToolbar', () => ({ BulkActionsToolbar: () => null }));
// O marcador só muda de nome se a sidebar voltar a passar onRefetch/isRefetching
// no desktop (era o segundo botão de atualizar).
vi.mock('@/components/inbox/InboxFilters', () => ({
  InboxFilters: (props: { onRefetch?: unknown; isRefetching?: unknown }) => (
    <button
      type="button"
      data-testid={
        props.onRefetch !== undefined || props.isRefetching !== undefined
          ? 'filtros-com-refetch'
          : 'filtros'
      }
    >
      Filtros
    </button>
  ),
}));
vi.mock('@/components/layout/ZenModeToggle', () => ({
  ZenModeToggle: ({ placement }: { placement?: string }) => <span data-testid={`zen-${placement}`} />,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock('@/components/inbox/VirtualizedRealtimeList', () => ({
  VirtualizedRealtimeList: () => <div data-testid="lista" />,
}));
vi.mock('@/components/inbox/CloseConversationDialog', () => ({
  CloseConversationDialog: () => null,
}));
vi.mock('@/components/inbox/TransferDialog', () => ({ TransferDialog: () => null }));

// StatusChips NÃO é mockado: os itens 3/4 são sobre o componente real.
import { ConversationListSidebar } from '@/components/inbox/ConversationListSidebar';

function conversa(overrides: {
  id: string;
  assigned_to?: string | null;
  hasMessages?: boolean;
  unreadCount?: number;
}): ConversationWithMessages {
  const { id, assigned_to = null, hasMessages = true, unreadCount = 0 } = overrides;
  return {
    contact: { id, assigned_to },
    messages: hasMessages ? [{ id: `m-${id}` }] : [],
    unreadCount,
    lastMessage: null,
  } as unknown as ConversationWithMessages;
}

// Fixture: 3 conversas em aberto (Todas=3; 1 não lida; 1 em atendimento no perfil
// logado; 1 aguardando sem responsável).
const FIXTURE: ConversationWithMessages[] = [
  conversa({ id: 'c1', assigned_to: 'perfil-1', unreadCount: 2 }),
  conversa({ id: 'c2', assigned_to: null }),
  conversa({ id: 'c3', assigned_to: 'outro-perfil' }),
];

type ChipTab = 'all' | 'unread' | 'attending' | 'waiting' | 'resolved' | 'archived';

function baseProps(chipTab: ChipTab = 'all') {
  return {
    inbox: {
      selectedContactId: null,
      isOnline: true,
      cachedConversations: FIXTURE,
      conversations: FIXTURE,
      loading: false,
      refetch: vi.fn(),
      handleSelectConversation: vi.fn(),
    },
    inboxFilters: {
      filteredConversations: FIXTURE,
      search: '',
      setSearch: vi.fn(),
      filters: {},
      setFilters: vi.fn(),
      showAll: false,
      setShowAll: vi.fn(),
      selectedContactType: 'all',
      handleContactTypeChange: vi.fn(),
      selectedQueueId: null,
      setSelectedQueueId: vi.fn(),
      chipTab,
      setChipTab: vi.fn(),
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

const antes = (a: Element, b: Element) =>
  (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

function violacoesGraves(result: Awaited<ReturnType<typeof axe>>) {
  return result.violations
    .filter(v => v.impact === 'critical' || v.impact === 'serious')
    .map(v => `${v.id}(${v.impact})`);
}

describe('ConversationListSidebar — topo novo no desktop', () => {
  it('mantém a ordem do topo: título + Atualizar + Zen → contagem → chips → Filtros + busca → lista', () => {
    render(<ConversationListSidebar {...baseProps()} />);

    const titulo = screen.getByRole('heading', { name: 'Conversas' });
    const atualizar = screen.getByRole('button', { name: 'Atualizar conversas' });
    const zen = screen.getByTestId('zen-inline');
    const contagem = screen.getByText('3 conversas');
    const chips = screen.getByTestId('status-chips');
    const filtros = screen.getByTestId('filtros');
    const busca = screen.getByLabelText('Buscar contato pelo nome');
    const lista = screen.getByTestId('lista');

    expect(antes(titulo, atualizar)).toBe(true);
    expect(antes(atualizar, zen)).toBe(true);
    expect(antes(zen, contagem)).toBe(true);
    expect(antes(contagem, chips)).toBe(true);
    expect(antes(chips, filtros)).toBe(true);
    expect(antes(filtros, busca)).toBe(true);
    expect(antes(busca, lista)).toBe(true);

    // As âncoras do cartão, na forma mais curta.
    expect(antes(titulo, chips)).toBe(true);
    expect(antes(chips, busca)).toBe(true);
  });

  it('tem EXATAMENTE um botão "Atualizar conversas", e ele chama inbox.refetch', () => {
    const props = baseProps();
    render(<ConversationListSidebar {...props} />);

    const botoes = screen.getAllByRole('button', { name: 'Atualizar conversas' });
    expect(botoes).toHaveLength(1);

    fireEvent.click(botoes[0]);
    expect(props.inbox.refetch).toHaveBeenCalledTimes(1);

    // O InboxFilters do desktop não recebe onRefetch/isRefetching: nenhum
    // segundo botão de atualizar reintroduzido pela prop.
    expect(screen.getByTestId('filtros')).toBeInTheDocument();
    expect(screen.queryByTestId('filtros-com-refetch')).not.toBeInTheDocument();
  });

  it('o chip ativo é o do chipTab recebido e o clique repassa por inboxFilters.setChipTab', () => {
    const props = baseProps('all');
    const { rerender } = render(<ConversationListSidebar {...props} />);

    // Estado de seleção real: o chip de "Todas" é o marcado como ativo.
    expect(screen.getByTestId('status-chip-all')).toHaveClass('status-chip-active');
    expect(screen.getByTestId('status-chip-resolved')).not.toHaveClass('status-chip-active');

    fireEvent.click(screen.getByTestId('status-chip-resolved'));
    expect(props.inboxFilters.setChipTab).toHaveBeenCalledWith('resolved');

    rerender(<ConversationListSidebar {...{ ...baseProps('resolved') }} />);
    expect(screen.getByTestId('status-chip-resolved')).toHaveClass('status-chip-active');
    expect(screen.getByTestId('status-chip-all')).not.toHaveClass('status-chip-active');
  });

  // Depende de t_b8496016 (chips em pílula/badge com aria-pressed, commit
  // abcef6f8e retirado da fila). StatusChips.tsx desta branch não tem o
  // atributo: `git grep aria-pressed src/components/inbox/conversation-list/`
  // não retorna nada. Sem ele o caso seria vermelho por dependência.
  it.todo('os chips expõem aria-pressed refletindo o estado de seleção (clicar alterna o valor)');

  it('axe: zero violações critical/serious no tema claro', async () => {
    document.documentElement.classList.remove('dark');
    const { container } = render(<ConversationListSidebar {...baseProps()} />);
    expect(violacoesGraves(await axe(container))).toEqual([]);
  });

  it('axe: zero violações critical/serious no tema escuro', async () => {
    document.documentElement.classList.add('dark');
    try {
      const { container } = render(<ConversationListSidebar {...baseProps()} />);
      expect(violacoesGraves(await axe(container))).toEqual([]);
    } finally {
      document.documentElement.classList.remove('dark');
    }
  });
});
