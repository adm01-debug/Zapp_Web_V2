/**
 * R2-INB-024 — a ponte do Inbox não pode transformar erro de carga em conversa vazia.
 *
 * `useMessages` publica `error` separado de `messages` e termina o `loading` mesmo
 * quando a busca falha. A ponte `useRealtimeInbox` só repassava `selectedMessagesLoading`:
 * o `error` da conversa selecionada morria ali, então o consumidor (RealtimeInboxView e
 * ChatPopup) não tinha como distinguir "falha de transporte/permissão" de "contato sem
 * histórico" — a conversa abria vazia, sem estado de erro nem retry próprio daquela consulta.
 *
 * O teste prova o contrato da ponte: com o hook de mensagens em erro, a fachada precisa
 * publicar `selectedMessagesError` e o `refetchSelectedMessages` da MESMA consulta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { refetchSelectedMock } = vi.hoisted(() => ({
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
  useExternalMessages: () => ({ messages: [], loading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('@/hooks/system/useOfflineCache', () => ({
  useOfflineCache: () => ({ conversations: [], usingCache: false }),
}));
// A carga da conversa selecionada terminou (loading=false) COM erro: é exatamente o
// par que antes virava "conversa vazia" silenciosamente.
vi.mock('@/hooks/chat/useMessages', () => ({
  useMessages: () => ({
    messages: [],
    loading: false,
    error: 'Falha de transporte',
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
  refetchSelectedMock.mockResolvedValue(undefined);
});

describe('useRealtimeInbox — erro da carga da conversa selecionada (R2-INB-024)', () => {
  it('publica o erro das mensagens selecionadas em vez de deixá-lo virar conversa vazia', () => {
    const { result } = renderHook(() => useRealtimeInbox());

    // A carga terminou sem mensagens; o motivo precisa sobreviver à ponte.
    expect(result.current.selectedMessagesLoading).toBe(false);
    expect(result.current.legacyMessages).toEqual([]);
    expect(result.current.selectedMessagesError).toBe('Falha de transporte');
  });

  it('expõe o refetch da própria conversa selecionada para o retry daquela consulta', async () => {
    const { result } = renderHook(() => useRealtimeInbox());

    await act(async () => {
      await result.current.refetchSelectedMessages();
    });

    expect(refetchSelectedMock).toHaveBeenCalledTimes(1);
  });
});
