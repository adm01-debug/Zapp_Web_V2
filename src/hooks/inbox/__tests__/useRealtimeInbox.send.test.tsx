import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRealtimeInbox } from '../useRealtimeInbox';

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  localRefetch: vi.fn(),
  messagesRefetch: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

const CONTACT_ID = '11111111-1111-4111-8111-111111111111';
const rawConversation = {
  contact: { id: CONTACT_ID, name: 'Contato', phone: '5511999999999' },
  messages: [],
  unreadCount: 0,
  lastMessage: null,
};

vi.mock('@/hooks/chat/useRealtimeMessages', () => ({
  useRealtimeMessages: () => ({
    conversations: [rawConversation],
    loading: false,
    error: null,
    refetch: mocks.localRefetch,
    sendMessage: mocks.sendMessage,
    markAsRead: vi.fn(),
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

vi.mock('@/hooks/inbox/useInboxUIState', () => ({
  useInboxUIState: () => ({
    selectedContactId: CONTACT_ID,
    setSelectedContactId: vi.fn(),
    soundOn: true,
    setSoundOn: vi.fn(),
    setPendingContactId: vi.fn(),
  }),
}));

vi.mock('@/hooks/system/useOfflineCache', () => ({
  useOfflineCache: (conversations: unknown[]) => ({ conversations, usingCache: false }),
}));

vi.mock('@/hooks/chat/useMessages', () => ({
  useMessages: () => ({ messages: [], loading: false, refetch: mocks.messagesRefetch }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ profile: null }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/adapters/inboxAdapter', () => ({
  mapRealtimeConversationToConversation: () => ({ id: 'conversation-1', contact: rawConversation.contact }),
  mapRealtimeMessageToMessage: vi.fn(),
}));
vi.mock('@/services/chat.service', () => ({ ChatService: { uploadAudio: vi.fn() } }));
vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: mocks.logError, warn: mocks.logWarn }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

describe('useRealtimeInbox — propagação do envio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendMessage.mockResolvedValue(undefined);
    mocks.localRefetch.mockResolvedValue(undefined);
    mocks.messagesRefetch.mockResolvedValue(undefined);
  });

  it('resolve somente após enviar e atualizar a conversa', async () => {
    const { result } = renderHook(() => useRealtimeInbox());

    await expect(result.current.handleSendMessage('Olá')).resolves.toBeUndefined();

    expect(mocks.sendMessage).toHaveBeenCalledWith(CONTACT_ID, 'Olá');
    expect(mocks.localRefetch).toHaveBeenCalledTimes(1);
    expect(mocks.messagesRefetch).toHaveBeenCalledTimes(1);
  });

  it('propaga a rejeição do transporte e não tenta refresh', async () => {
    const transportError = new Error('transport unavailable');
    mocks.sendMessage.mockRejectedValueOnce(transportError);
    const { result } = renderHook(() => useRealtimeInbox());

    await expect(result.current.handleSendMessage('Olá')).rejects.toBe(transportError);

    expect(mocks.localRefetch).not.toHaveBeenCalled();
    expect(mocks.messagesRefetch).not.toHaveBeenCalled();
    expect(mocks.logError).toHaveBeenCalled();
  });

  it('não converte falha de refresh em falso erro de envio', async () => {
    const refreshError = new Error('refresh unavailable');
    mocks.messagesRefetch.mockRejectedValueOnce(refreshError);
    const { result } = renderHook(() => useRealtimeInbox());

    await expect(result.current.handleSendMessage('Olá')).resolves.toBeUndefined();

    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(mocks.logWarn).toHaveBeenCalledWith(
      'Message sent, but conversation refresh failed:',
      refreshError,
    );
  });
});
