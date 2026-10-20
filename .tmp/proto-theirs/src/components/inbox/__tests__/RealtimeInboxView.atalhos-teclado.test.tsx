/**
 * Cartão t_15c578b9 — atalhos de teclado do Inbox só agem com escopo.
 *
 * Antes: o listener de `window` de `RealtimeInboxView` (bulk: Ctrl+A, Delete,
 * Backspace, `r`, Escape) só ignorava INPUT/TEXTAREA/contenteditable. Assim,
 * Ctrl+A com o foco em texto de LEITURA (mensagem, painel direito) virava
 * "selecionar todas as conversas" e bloqueava a seleção de texto; e Delete/`r`
 * agiam por baixo de um diálogo/menu Radix aberto.
 *
 * Prova pelo componente REAL (`RealtimeInboxView`), com o hook de dados e o filho
 * pesado trocados por dublês de fronteira; o listener sob prova é o de produção.
 * O campo de texto do critério 1 é o composer da conversa (aqui um `<textarea>`
 * real, no lugar do componente pesado), porque o alvo é o handler da view.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Conversation, Message } from '@/types/chat';

const mocks = vi.hoisted(() => ({
  inbox: {} as Record<string, unknown>,
  bulk: {
    selectAll: vi.fn(),
    selectionMode: false,
    selectedIds: new Set<string>(),
    bulkArchive: vi.fn(),
    clearSelection: vi.fn(),
    bulkMarkAsRead: vi.fn(),
  },
}));

vi.mock('@/hooks/inbox/useRealtimeInbox', () => ({ useRealtimeInbox: () => mocks.inbox }));
vi.mock('@/hooks/inbox/useInboxBulkActions', () => ({ useInboxBulkActions: () => mocks.bulk }));

// ---- dependências próprias da RealtimeInboxView (nenhuma delas é o alvo) ----
vi.mock('@/hooks/ui/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/ui/usePullToRefresh', () => ({ usePullToRefresh: () => ({}) }));
vi.mock('@/hooks/ui/useGlobalSearchShortcut', () => ({ useGlobalSearchShortcut: vi.fn() }));
vi.mock('@/hooks/inbox/useInboxFilters', () => ({
  useInboxFilters: () => ({ filteredConversations: [], setMainTab: vi.fn(), setSubTab: vi.fn() }),
}));
vi.mock('@/hooks/chat/useConversationActions', () => ({
  useConversationActions: () => ({
    pinnedIds: new Set<string>(), snoozedIds: new Set<string>(), isFavorite: () => false,
    favoriteContact: vi.fn(), unfavoriteContact: vi.fn(), archiveContact: vi.fn(),
  }),
}));
vi.mock('@/hooks/chat/useConversationTabCounts', () => ({ useConversationTabCounts: () => ({ counts: {} }) }));
vi.mock('@/hooks/crm/useContactCrm360', () => ({ useContactCrm360: () => ({ data: null }) }));
vi.mock('@/hooks/gmail/useContactUnreadEmails', () => ({ useContactUnreadEmails: () => ({ count: 0, status: 'ok' }) }));
vi.mock('@/hooks/system/useFeatureFlag', () => ({ useFeatureFlag: () => false }));
vi.mock('@/features/talk-me/useTalkMeQueue', () => ({
  useTalkMeQueue: () => ({ queuesError: false, selectedQueue: null, queuesLoading: false }),
}));

// ---- irmãos pesados / lazy ----
vi.mock('@/components/mobile/MiniChatPiP', () => ({ MiniChatPiP: () => null }));
vi.mock('../NewMessageIndicator', () => ({ NewMessageIndicator: () => null }));
vi.mock('../InboxEmptyChat', () => ({ InboxEmptyChat: () => null }));
vi.mock('../ConversationListSidebar', () => ({ ConversationListSidebar: () => null }));
vi.mock('../chat/ConversationTabs', () => ({ ConversationTabs: () => null }));
vi.mock('../chat/ConversationTabContent', () => ({
  ConversationTabContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/features/talk-me/TalkMeView', () => ({ TalkMeView: () => null }));
vi.mock('../ContactDetails', () => ({ default: () => null }));
vi.mock('../ContactDetailsResponsive', () => ({ default: () => null }));
vi.mock('../GlobalSearch', () => ({ default: () => null }));
vi.mock('../NewConversationModal', () => ({ default: () => null }));

// O composer real (`ChatInputArea`) puxa muitos provedores que não são o alvo;
// aqui ele é o campo de texto REAL do critério 1 (um `<textarea>` montado no DOM).
vi.mock('../ChatPanel', () => ({
  ChatPanel: () => <textarea aria-label="Digite sua mensagem" />,
}));

import { RealtimeInboxView } from '../RealtimeInboxView';

const CONTACT_ID = 'contato-1';

const conversation = {
  id: CONTACT_ID,
  contact: { id: CONTACT_ID, name: 'Maria Silva', phone: '+551****9999', avatar: '' },
} as unknown as Conversation;

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function renderInbox() {
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RealtimeInboxView />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

function baseInbox(): Record<string, unknown> {
  return {
    cachedConversations: [],
    loading: false,
    error: null,
    usingCache: false,
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
    pipContact: null,
    setPipContact: vi.fn(),
    refetch: vi.fn(),
    profile: { id: 'perfil-1' },
    selectedMessagesLoading: false,
    selectedMessagesError: null,
    legacyConversation: conversation,
    legacyMessages: [] as Message[],
    handleSendMessage: vi.fn(),
    handleSendAudio: vi.fn(),
    hasOlderMessages: false,
    loadingOlderMessages: false,
    loadOlderMessages: vi.fn(),
  };
}

let dialogAberto: HTMLElement | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inbox = baseInbox();
  mocks.bulk.selectionMode = false;
  mocks.bulk.selectedIds = new Set<string>();
});

afterEach(() => {
  dialogAberto?.remove();
  dialogAberto = null;
});

/** Overlay Radix aberto, como o de um diálogo/menu do projeto. */
function abrirDialogo() {
  dialogAberto = document.createElement('div');
  dialogAberto.setAttribute('role', 'dialog');
  dialogAberto.setAttribute('data-state', 'open');
  document.body.appendChild(dialogAberto);
}

function tecla(
  alvo: Element,
  key: string,
  opts: { ctrlKey?: boolean; metaKey?: boolean } = {},
) {
  act(() => {
    fireEvent.keyDown(alvo, { key, ...opts });
  });
}

const composer = () => screen.getByLabelText('Digite sua mensagem');

describe('Inbox — escopo dos atalhos de teclado (t_15c578b9)', () => {
  it('Ctrl+A fora de campo e fora do modo de seleção NÃO seleciona as conversas', () => {
    renderInbox();

    tecla(document.body, 'a', { ctrlKey: true });

    // Antes da correção, qualquer Ctrl+A virava "selecionar todas".
    expect(mocks.bulk.selectAll).not.toHaveBeenCalled();
  });

  it('critério 1: Ctrl+A num campo de texto não seleciona conversas (nem no modo de seleção)', () => {
    mocks.bulk.selectionMode = true;
    renderInbox();

    composer().focus();
    tecla(composer(), 'a', { ctrlKey: true });

    expect(mocks.bulk.selectAll).not.toHaveBeenCalled();
  });

  it('critério 2: com diálogo aberto os atalhos não agem', () => {
    mocks.bulk.selectionMode = true;
    mocks.bulk.selectedIds = new Set([CONTACT_ID]);
    renderInbox();
    abrirDialogo();

    tecla(document.body, 'a', { ctrlKey: true });
    tecla(document.body, 'r');
    tecla(document.body, 'Delete');
    tecla(document.body, 'Escape');

    expect(mocks.bulk.selectAll).not.toHaveBeenCalled();
    expect(mocks.bulk.bulkMarkAsRead).not.toHaveBeenCalled();
    expect(mocks.bulk.bulkArchive).not.toHaveBeenCalled();
    expect(mocks.bulk.clearSelection).not.toHaveBeenCalled();
  });

  it('sem overlay e com seleção ativa os atalhos continuam agindo (as guardas não desligam tudo)', () => {
    mocks.bulk.selectionMode = true;
    mocks.bulk.selectedIds = new Set([CONTACT_ID]);
    renderInbox();

    tecla(document.body, 'a', { ctrlKey: true });
    tecla(document.body, 'r');
    tecla(document.body, 'Delete');

    expect(mocks.bulk.selectAll).toHaveBeenCalledTimes(1);
    expect(mocks.bulk.bulkMarkAsRead).toHaveBeenCalledTimes(1);
    expect(mocks.bulk.bulkArchive).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+A com Caps Lock segue a mesma regra (fora de campo, sem seleção, não age)', () => {
    renderInbox();

    // Caps Lock ligado: `e.key` chega 'A'.
    tecla(document.body, 'A', { ctrlKey: true });

    expect(mocks.bulk.selectAll).not.toHaveBeenCalled();
  });
});
