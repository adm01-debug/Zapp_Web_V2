/**
 * DL1 — link direto para a Inbox (`?contact=<id>&message=<id>`).
 *
 * O deep link tem de abrir a conversa, entregar o alvo ao ChatPanel
 * (`initialHighlightMessageId`) e sumir da URL depois de consumido — sem isso o
 * F5 reabriria a mesma mensagem e o link compartilhado ficaria sujo. O evento
 * `open-contact-chat` também passa a aceitar `messageId` na carga.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  setPendingContactId: vi.fn(),
}));

vi.mock('@/hooks/inbox/useInboxUIState', () => ({
  useInboxUIState: () => ({
    selectedContactId: null,
    setSelectedContactId: vi.fn(),
    soundOn: true,
    setSoundOn: vi.fn(),
    setPendingContactId: mocks.setPendingContactId,
  }),
}));
vi.mock('@/hooks/chat/useRealtimeMessages', () => ({
  useRealtimeMessages: () => ({
    conversations: [],
    loading: false,
    error: null,
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
  useOfflineCache: () => ({ conversations: [], usingCache: false }),
  clearOfflineCache: vi.fn(),
}));
vi.mock('@/hooks/chat/useMessages', () => ({
  useMessages: () => ({
    messages: [],
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
  window.history.replaceState(null, '', '/');
});

describe('useRealtimeInbox — deep link ?message= (DL1)', () => {
  it('abre a conversa do link, guarda o alvo e limpa os parâmetros da URL', () => {
    window.history.replaceState(null, '', '/?view=inbox&contact=c9&message=m42');

    const { result } = renderHook(() => useRealtimeInbox());

    expect(mocks.setPendingContactId).toHaveBeenCalledWith('c9');
    expect(result.current.initialHighlightMessageId).toBe('m42');
    // O `view` do app continua na URL; só o deep link consumido sai.
    expect(window.location.search).toBe('?view=inbox');
  });

  it('aceita ?message= sem contato (a conversa já aberta é a dona do alvo)', () => {
    window.history.replaceState(null, '', '/?message=wa-999');

    const { result } = renderHook(() => useRealtimeInbox());

    expect(result.current.initialHighlightMessageId).toBe('wa-999');
    expect(mocks.setPendingContactId).not.toHaveBeenCalled();
    expect(window.location.search).toBe('');
  });

  it('recebe o alvo pelo evento open-contact-chat (contato + messageId)', () => {
    const { result } = renderHook(() => useRealtimeInbox());

    act(() => {
      window.dispatchEvent(new CustomEvent('open-contact-chat', {
        detail: { contactId: 'c9', messageId: 'm42' },
      }));
    });

    expect(mocks.setPendingContactId).toHaveBeenCalledWith('c9');
    expect(result.current.initialHighlightMessageId).toBe('m42');
  });

  it('entrega e limpa o alvo (fim do realce não reabre a mensagem)', () => {
    window.history.replaceState(null, '', '/?message=m42');

    const { result } = renderHook(() => useRealtimeInbox());
    expect(result.current.initialHighlightMessageId).toBe('m42');

    act(() => result.current.setInitialHighlightMessageId(null));
    expect(result.current.initialHighlightMessageId).toBeNull();
  });
});
