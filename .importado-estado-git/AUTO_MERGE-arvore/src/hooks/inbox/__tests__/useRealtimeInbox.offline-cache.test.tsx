/**
 * R2-INB-015 (#311) — a Inbox ativa não alimentava a conversa selecionada com o
 * cache offline. Mesmo com o contato e as mensagens no cache (até 20 por
 * contato), `legacyMessages` vinha SEMPRE de `useMessages`, que sem conexão fica
 * vazio. Aqui o hook é exercitado com o cache em uso e a lista ao vivo vazia:
 * o recorte em cache tem de aparecer na conversa ativa e ser identificado
 * (`selectedMessagesFromCache`), e mensagem ao vivo tem de voltar a vencer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const { state } = vi.hoisted(() => ({
  state: {
    cachedConversations: [] as unknown[],
    usingCache: false,
    liveMessages: [] as unknown[],
  },
}));

function makeCachedConversation() {
  return {
    contact: {
      id: 'c1',
      name: 'Cliente Cache',
      phone: '+5511999999999',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    messages: [
      {
        id: 'cache-msg-1',
        contact_id: 'c1',
        content: 'mensagem guardada no cache',
        message_type: 'text',
        sender: 'contact',
        created_at: new Date('2026-10-05T12:00:00Z').toISOString(),
        is_read: true,
      },
    ],
    unreadCount: 1,
    lastMessage: null,
  };
}

vi.mock('@/hooks/inbox/useInboxUIState', () => ({
  useInboxUIState: () => ({
    selectedContactId: 'c1',
    setSelectedContactId: vi.fn(),
    soundOn: true,
    setSoundOn: vi.fn(),
    setPendingContactId: vi.fn(),
  }),
}));
vi.mock('@/hooks/chat/useRealtimeMessages', () => ({
  useRealtimeMessages: () => ({
    conversations: [],
    loading: false,
    error: 'Failed to fetch',
    sendMessage: vi.fn(),
    markAsRead: vi.fn(),
    refetch: vi.fn(),
    newMessageNotification: null,
    dismissNotification: vi.fn(),
    setSelectedContact: vi.fn(),
    setSoundEnabled: vi.fn(),
  }),
}));
vi.mock('@/hooks/integrations/useExternalEvolution', () => ({
  useExternalConversations: () => ({ conversations: [], loading: false, error: null, refetch: vi.fn() }),
  useExternalMessages: () => ({ messages: [], loading: false, refetch: vi.fn() }),
}));
vi.mock('@/hooks/system/useOfflineCache', () => ({
  useOfflineCache: () => ({
    conversations: state.cachedConversations,
    usingCache: state.usingCache,
  }),
  clearOfflineCache: vi.fn(),
}));
vi.mock('@/hooks/chat/useMessages', () => ({
  useMessages: () => ({
    messages: state.liveMessages,
    loading: false,
    refetch: vi.fn(),
    hasOlder: false,
    loadingOlder: false,
    loadOlderMessages: vi.fn(),
    addMessage: vi.fn(),
    updateMessage: vi.fn(),
    removeMessage: vi.fn(),
  }),
}));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ profile: null }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useRealtimeInbox } from '@/hooks/inbox/useRealtimeInbox';

beforeEach(() => {
  vi.clearAllMocks();
  state.cachedConversations = [];
  state.usingCache = false;
  state.liveMessages = [];
});

describe('useRealtimeInbox — cache offline alimenta a conversa selecionada (R2-INB-015)', () => {
  it('oferece as mensagens do cache quando a lista ao vivo está vazia e identifica o recorte', () => {
    state.cachedConversations = [makeCachedConversation()];
    state.usingCache = true;
    state.liveMessages = [];

    const { result } = renderHook(() => useRealtimeInbox());

    expect(result.current.selectedMessagesFromCache).toBe(true);
    expect(result.current.legacyMessages).toHaveLength(1);
    expect(result.current.legacyMessages[0].content).toBe('mensagem guardada no cache');
  });

  it('mensagem ao vivo volta a vencer o cache (recuperação explícita)', () => {
    state.cachedConversations = [makeCachedConversation()];
    state.usingCache = true;
    state.liveMessages = [
      {
        id: 'live-1',
        conversationId: 'c1',
        sender: 'contact',
        content: 'mensagem carregada ao vivo',
        timestamp: new Date('2026-10-05T13:00:00Z'),
        type: 'text',
        status: 'sent',
      },
    ];

    const { result } = renderHook(() => useRealtimeInbox());

    expect(result.current.selectedMessagesFromCache).toBe(false);
    expect(result.current.legacyMessages).toHaveLength(1);
    expect(result.current.legacyMessages[0].content).toBe('mensagem carregada ao vivo');
  });

  it('sem cache em uso a conversa segue dependente da lista ao vivo', () => {
    state.cachedConversations = [makeCachedConversation()];
    state.usingCache = false;

    const { result } = renderHook(() => useRealtimeInbox());

    expect(result.current.selectedMessagesFromCache).toBe(false);
    expect(result.current.legacyMessages).toEqual([]);
  });
});
