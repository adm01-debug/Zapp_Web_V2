import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// A lista de conversas tambem perde eventos na queda. Ao reconectar, os dois canais
// (mensagens e contatos) precisam revalidar a lista. Este teste prova que ambos
// apontam para o mesmo callback; o colapso real de duas instancias com o mesmo
// callback fica coberto em useSupabaseRealtime.reconexao.test.tsx.
const h = vi.hoisted(() => ({
  configs: [] as Array<{ channelName: string; onReconnect?: () => void }>,
  fetchInitialConversations: vi.fn(),
}));

type RealtimeConfigProbe = { channelName: string; onReconnect?: () => void };

vi.mock('@/hooks/realtime/useSupabaseRealtime', () => ({
  useSupabaseRealtime: (config: { channelName: string; onReconnect?: () => void }) => {
    h.configs.push(config);
  },
}));

vi.mock('@/services/realtime.service', () => ({
  RealtimeService: {
    fetchInitialConversations: h.fetchInitialConversations,
    fetchContactsByIds: vi.fn().mockResolvedValue([]),
    markMessagesAsRead: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/hooks/realtime/useRealtimeNotifications', () => ({
  useRealtimeNotifications: () => ({
    newMessageNotification: null,
    notifyAboutIncomingMessage: vi.fn(),
    dismissNotification: vi.fn(),
    setSelectedContact: vi.fn(),
    setSoundEnabled: vi.fn(),
  }),
}));

vi.mock('@/hooks/realtime/useMessageUpdateBatcher', () => ({
  useMessageUpdateBatcher: () => ({ handleMessageUpdate: vi.fn() }),
}));

vi.mock('@/hooks/realtime/messageSender', () => ({
  sendMessageToContact: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { channel: vi.fn(), removeChannel: vi.fn(), from: vi.fn(), rpc: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { useRealtimeMessages } from '@/hooks/chat/useRealtimeMessages';

beforeEach(() => {
  vi.clearAllMocks();
  h.configs = [];
  h.fetchInitialConversations.mockResolvedValue([]);
});

describe('useRealtimeMessages — revalidacao da lista apos reconexao', () => {
  it('liga mensagens e contatos ao mesmo callback de revalidacao da lista', async () => {
    renderHook(() => useRealtimeMessages());
    await waitFor(() => expect(h.fetchInitialConversations).toHaveBeenCalledTimes(1));

    const messagesChannel = h.configs.find((c: RealtimeConfigProbe) => c.channelName === 'global-messages-realtime');
    const contactsChannel = h.configs.find((c: RealtimeConfigProbe) => c.channelName === 'global-contacts-realtime');
    expect(messagesChannel).toBeDefined();
    expect(contactsChannel).toBeDefined();
    expect(typeof messagesChannel?.onReconnect).toBe('function');
    expect(contactsChannel?.onReconnect).toBe(messagesChannel?.onReconnect);

    messagesChannel?.onReconnect?.();
    await waitFor(() => expect(h.fetchInitialConversations).toHaveBeenCalledTimes(2));
  });
});
