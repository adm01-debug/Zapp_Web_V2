/**
 * R2-INB-024 — erro da carga das mensagens da conversa ativa não pode virar painel vazio.
 *
 * `RealtimeInboxView` só olhava `inbox.error` (a lista global de conversas). Quando o
 * fetch das mensagens do contato selecionado falhava, `selectedMessagesLoading` virava
 * `false` e o painel caía no `ChatPanel` com zero mensagens: visualmente idêntico a um
 * contato sem histórico, sem aviso e sem retry daquela consulta.
 *
 * O teste usa a fachada controlada de `useRealtimeInbox` (só o hook de dados é trocado;
 * a árvore de componentes é a de produção) e prova qual ramo a View escolhe: com erro de
 * mensagens ela anuncia a falha e oferece o retry da PRÓPRIA consulta; sem erro, a conversa
 * continua sendo renderizada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Conversation } from '@/types/chat';

const mocks = vi.hoisted(() => ({
  refetchSelectedMessages: vi.fn(async () => {}),
  inbox: {} as Record<string, unknown>,
}));

vi.mock('@/hooks/inbox/useRealtimeInbox', () => ({
  useRealtimeInbox: () => mocks.inbox,
}));

// ---- dependências próprias da RealtimeInboxView (nenhuma delas é o alvo) ----
vi.mock('@/hooks/ui/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/ui/usePullToRefresh', () => ({ usePullToRefresh: () => ({}) }));
vi.mock('@/hooks/ui/useGlobalSearchShortcut', () => ({ useGlobalSearchShortcut: vi.fn() }));
vi.mock('@/hooks/inbox/useInboxBulkActions', () => ({
  useInboxBulkActions: () => ({
    selectAll: vi.fn(), selectionMode: false, selectedIds: new Set<string>(),
    bulkArchive: vi.fn(), clearSelection: vi.fn(), bulkMarkAsRead: vi.fn(),
  }),
}));
vi.mock('@/hooks/inbox/useInboxFilters', () => ({
  useInboxFilters: () => ({ filteredConversations: [], setMainTab: vi.fn(), setSubTab: vi.fn() }),
}));
vi.mock('@/hooks/chat/useConversationActions', () => ({
  useConversationActions: () => ({
    pinnedIds: new Set<string>(), isFavorite: () => false,
    favoriteContact: vi.fn(), unfavoriteContact: vi.fn(), archiveContact: vi.fn(),
  }),
}));
vi.mock('@/hooks/chat/useConversationTabCounts', () => ({ useConversationTabCounts: () => ({ counts: {} }) }));
vi.mock('@/hooks/crm/useContactCrm360', () => ({ useContactCrm360: () => ({ data: null }) }));
vi.mock('@/hooks/system/useFeatureFlag', () => ({ useFeatureFlag: () => false }));
vi.mock('@/features/talk-me/useTalkMeQueue', () => ({
  useTalkMeQueue: () => ({ queuesError: false, selectedQueue: null, queuesLoading: false }),
}));

// ---- componentes irmãos pesados / lazy ----
vi.mock('@/components/mobile/MiniChatPiP', () => ({ MiniChatPiP: () => null }));
vi.mock('../NewMessageIndicator', () => ({ NewMessageIndicator: () => null }));
vi.mock('../InboxEmptyChat', () => ({ InboxEmptyChat: () => null }));
vi.mock('../ConversationListSidebar', () => ({ ConversationListSidebar: () => null }));
vi.mock('../chat/ConversationTabs', () => ({ ConversationTabs: () => null }));
vi.mock('../chat/ConversationTabContent', () => ({
  ConversationTabContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
// O alvo do cartão é o ramo escolhido pela View ANTES de montar o painel do chat; o
// ChatPanel (lazy) entra como marcador para observar se ele foi montado ou não.
vi.mock('../ChatPanel', () => ({ ChatPanel: () => <div data-testid="chat-panel" /> }));
vi.mock('@/features/talk-me/TalkMeView', () => ({ TalkMeView: () => null }));
vi.mock('../ContactDetails', () => ({ default: () => null }));
vi.mock('../ContactDetailsResponsive', () => ({ default: () => null }));
vi.mock('../GlobalSearch', () => ({ default: () => null }));
vi.mock('../NewConversationModal', () => ({ default: () => null }));

import { RealtimeInboxView } from '../RealtimeInboxView';

const CONTACT_ID = 'contato-1';

const conversation = {
  id: CONTACT_ID,
  contact: { id: CONTACT_ID, name: 'Maria Silva', phone: '+551****9999', avatar: '' },
  lastMessage: { content: 'oi', timestamp: new Date('2026-10-05T12:00:00Z') },
} as unknown as Conversation;

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function buildUi() {
  // Elemento NOVO a cada render: reutilizar o mesmo elemento faz o React bailar out e a
  // View não veria o novo estado da fachada.
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RealtimeInboxView />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

const RETRY = /tentar novamente/i;

function baseInbox(): Record<string, unknown> {
  return {
    cachedConversations: [],
    conversations: [],
    loading: false,
    error: null,
    selectedContactId: CONTACT_ID,
    setSelectedContactId: vi.fn(),
    setSelectedContact: vi.fn(),
    markAsRead: vi.fn(),
    handleSelectConversation: vi.fn(),
    pendingContactId: null,
    setPendingContactId: vi.fn(),
    conversationTab: 'chat',
    setConversationTab: vi.fn(),
    globalSearchOpen: false,
    setGlobalSearchOpen: vi.fn(),
    newMessageNotification: null,
    dismissNotification: vi.fn(),
    handleNotificationView: vi.fn(),
    showNewConversation: false,
    setShowNewConversation: vi.fn(),
    showDetails: false,
    setShowDetails: vi.fn(),
    usingCache: false,
    pipContact: null,
    setPipContact: vi.fn(),
    refetch: vi.fn(),
    profile: { id: 'perfil-1' },
    selectedMessagesLoading: false,
    selectedMessagesError: null,
    refetchSelectedMessages: mocks.refetchSelectedMessages,
    legacyConversation: conversation,
    legacyMessages: [],
    handleSendMessage: vi.fn(),
    handleSendAudio: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inbox = baseInbox();
});

describe('RealtimeInboxView — erro da carga da conversa ativa (R2-INB-024)', () => {
  it('anuncia a falha e oferece o retry da consulta em vez de abrir a conversa vazia', async () => {
    mocks.inbox = {
      ...baseInbox(),
      selectedMessagesError: 'Falha ao carregar mensagens',
      legacyMessages: [],
    };
    render(buildUi());

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent('Falha ao carregar mensagens');
    // O painel do chat NÃO é montado: a tela não pode fingir conversa sem histórico.
    expect(screen.queryByTestId('chat-panel')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: RETRY }));
    expect(mocks.refetchSelectedMessages).toHaveBeenCalledTimes(1);
  });

  it('sem erro de mensagens, a conversa continua sendo renderizada', async () => {
    render(buildUi());

    expect(await screen.findByTestId('chat-panel')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('não troca por tela de erro quando as mensagens já estão na tela (falha de refetch silencioso)', async () => {
    // O refetch silencioso de uma conversa já carregada também publica `error`; nesse caso
    // as mensagens visíveis não podem ser apagadas por causa da falha do refresh.
    mocks.inbox = {
      ...baseInbox(),
      selectedMessagesError: 'Falha ao carregar mensagens',
      legacyMessages: [{ id: 'm-1', content: 'oi' }],
    };
    render(buildUi());

    expect(await screen.findByTestId('chat-panel')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
