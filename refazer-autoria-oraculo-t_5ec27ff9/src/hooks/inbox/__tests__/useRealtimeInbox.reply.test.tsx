/**
 * R2-INB-001 — a ponte do Inbox não pode descartar o id da resposta.
 *
 * `handleSendMessage` (usado por RealtimeInboxView e pelo ChatPopup via ChatPanel)
 * repassava só `content` para o transporte. O teste cobre a costura: o id da
 * mensagem respondida precisa atravessar a ponte até `sendMessage`.
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

describe('useRealtimeInbox — ponte preserva o id da resposta (R2-INB-001)', () => {
  it('encaminha replyToId para sendMessage no envio ativo', async () => {
    const { result } = renderHook(() => useRealtimeInbox());

    await act(async () => {
      await result.current.handleSendMessage('oi', 'reply-uuid-1');
    });

    expect(sendMessageMock).toHaveBeenCalledWith('c1', 'oi', 'text', undefined, undefined, 'reply-uuid-1');
  });
});
