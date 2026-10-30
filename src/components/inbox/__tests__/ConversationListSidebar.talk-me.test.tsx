import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LayoutProvider } from '@/contexts/LayoutContext';

const mocks = vi.hoisted(() => ({ isMobile: true }));

vi.mock('@/hooks/ui/use-mobile', () => ({ useIsMobile: () => mocks.isMobile }));
vi.mock('@/components/mobile/MobilePullToRefresh', () => ({
  MobilePullToRefreshIndicator: () => null,
}));
vi.mock('@/components/errors/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/inbox/BulkActionsToolbar', () => ({ BulkActionsToolbar: () => null }));
vi.mock('@/components/inbox/InboxFilters', () => ({ InboxFilters: () => null }));
vi.mock('@/components/inbox/conversation-list/StatusChips', () => ({ StatusChips: () => null }));
vi.mock('@/components/inbox/VirtualizedRealtimeList', () => ({
  VirtualizedRealtimeList: () => <div data-testid="conversation-list-content" />,
}));
vi.mock('@/components/inbox/CloseConversationDialog', () => ({ CloseConversationDialog: () => null }));
vi.mock('@/components/inbox/TransferDialog', () => ({ TransferDialog: () => null }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

import { ConversationListSidebar } from '@/components/inbox/ConversationListSidebar';

function baseProps() {
  return {
    inbox: {
      selectedContactId: null,
      isOnline: true,
      cachedConversations: [],
      conversations: [],
      loading: false,
      refetch: vi.fn(),
      handleSelectConversation: vi.fn(),
    },
    inboxFilters: {
      filteredConversations: [{ contact: { id: 'c1' } }],
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
      chipTab: 'all',
      setChipTab: vi.fn(),
      chipCounts: {},
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isMobile = true;
});

describe('ConversationListSidebar — entrada mobile do TALK ME', () => {
  it('flag desligada não monta o gatilho mobile', () => {
    render(<ConversationListSidebar {...baseProps()} talkMeEnabled={false} />);

    expect(screen.queryByTestId('talk-me-button-mobile')).not.toBeInTheDocument();
  });

  it('marca o gatilho, informa erro sem exibir zero e continua acionável', () => {
    const onOpenTalkMe = vi.fn();
    render(
      <ConversationListSidebar
        {...baseProps()}
        talkMeEnabled
        talkMeCount={null}
        talkMeCountUnavailable
        talkMeQueueName="Suporte"
        onOpenTalkMe={onOpenTalkMe}
      />,
    );

    const trigger = screen.getByTestId('talk-me-button-mobile');
    expect(trigger).toHaveAttribute('data-talkme-trigger', '1');
    expect(trigger).toHaveAttribute(
      'aria-label',
      'TALK ME: contagem de atendimentos indisponível em Suporte',
    );
    expect(trigger).toHaveAttribute(
      'title',
      'Abrir TALK ME — contagem de atendimentos indisponível em Suporte',
    );
    expect(trigger).not.toHaveTextContent('0');
    expect(trigger).toBeEnabled();

    fireEvent.click(trigger);
    expect(onOpenTalkMe).toHaveBeenCalledTimes(1);
  });

  it('sem fila mantém o botão acionável sem inventar estado de departamento', () => {
    render(
      <ConversationListSidebar
        {...baseProps()}
        talkMeEnabled
        talkMeCount={null}
      />,
    );

    const trigger = screen.getByTestId('talk-me-button-mobile');
    expect(trigger).toBeEnabled();
    expect(trigger).toHaveAttribute('aria-label', 'TALK ME');
  });
});

describe('ConversationListSidebar — Zen independente do TALK ME', () => {
  it('mantém o Zen no desktop com a flag ligada ou desligada', () => {
    mocks.isMobile = false;
    const toggleZen = vi.fn();
    const props = baseProps();
    const { rerender } = render(
      <TooltipProvider>
        <LayoutProvider value={{ hidePageBreadcrumbs: false, isZen: false, toggleZen }}>
          <ConversationListSidebar {...props} talkMeEnabled={false} />
        </LayoutProvider>
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Modo zen' }));
    expect(toggleZen).toHaveBeenCalledTimes(1);

    rerender(
      <TooltipProvider>
        <LayoutProvider value={{ hidePageBreadcrumbs: false, isZen: false, toggleZen }}>
          <ConversationListSidebar {...props} talkMeEnabled />
        </LayoutProvider>
      </TooltipProvider>,
    );

    expect(screen.getByRole('button', { name: 'Modo zen' })).toBeInTheDocument();
    expect(screen.queryByTestId('talk-me-button-mobile')).not.toBeInTheDocument();
  });
});
