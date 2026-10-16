/**
 * PK-21 — o caminho de envio não refaz o fetch da lista de conversas.
 *
 * Defeito de origem: `handleSendMessage` esperava o envio E o par de refetches
 * (`refetch` da lista + `refetch` da conversa aberta). Isso é o que mantinha o
 * compositor travado depois do despacho e ainda fazia a lista "piscar" no meio
 * do envio. A atualização já chega pelo Realtime: o INSERT da mensagem
 * enfileirada é tratado por `useRealtimeMessages` (lista) e por `useMessages`
 * (conversa aberta) em `global-messages-realtime`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { sendMessageMock, refetchMock, refetchSelectedMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn().mockResolvedValue(undefined),
  refetchMock: vi.fn().mockResolvedValue(undefined),
  refetchSelectedMock: vi.fn().mockResolvedValue(undefined),
}));

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
    error: null,
    sendMessage: sendMessageMock,
    markAsRead: vi.fn(),
    refetch: refetchMock,
    newMessageNotification: null,
    dismissNotification: vi.fn(),
    setSelectedContact: vi.fn(),
    setSoundEnabled: vi.fn(),
  }),
}));
vi.mock('@/hooks/integrations/useExternalEvolution', () => ({
  useExternalConversations: () => ({ conversations: [], loading: false, error: null, refetch: vi.fn() }),
  useExternalMessages: () => ({ messages: [], loading: false, refetch: refetchSelectedMock }),
}));
vi.mock('@/hooks/system/useOfflineCache', () => ({
  useOfflineCache: () => ({ conversations: [], usingCache: false }),
}));
vi.mock('@/hooks/chat/useMessages', () => ({
  useMessages: () => ({
    messages: [],
    loading: false,
    refetch: refetchSelectedMock,
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
  sendMessageMock.mockResolvedValue(undefined);
  refetchMock.mockResolvedValue(undefined);
  refetchSelectedMock.mockResolvedValue(undefined);
});

describe('useRealtimeInbox — envio de texto sem refetch da lista (PK-21)', () => {
  it('envia sem refazer o fetch da lista nem o da conversa aberta', async () => {
    const { result } = renderHook(() => useRealtimeInbox());

    await act(async () => {
      await result.current.handleSendMessage('mensagem em fila', null);
    });

    expect(sendMessageMock).toHaveBeenCalledWith('c1', 'mensagem em fila', 'text', undefined, undefined, null);
    // A lista e a conversa aberta são atualizadas pelo Realtime (INSERT da
    // mensagem), não por um refetch dentro do caminho do envio.
    expect(refetchMock).not.toHaveBeenCalled();
    expect(refetchSelectedMock).not.toHaveBeenCalled();
  });

  it('a rejeição do transporte sobe para o chamador (o compositor devolve o rascunho)', async () => {
    sendMessageMock.mockRejectedValueOnce(new Error('sem conexão'));
    const { result } = renderHook(() => useRealtimeInbox());

    await expect(
      act(async () => { await result.current.handleSendMessage('oi', null); }),
    ).rejects.toThrow('sem conexão');

    expect(refetchMock).not.toHaveBeenCalled();
  });
});
