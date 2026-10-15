import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// R2-INB-* (lista sem piscar), pontos 1-4 da recusa do revisor:
//  - entrar/sair ao vivo: INSERT/UPDATE de contato fora da lista INSERE a
//    conversa (busca contato+resumo); DELETE remove; sem `return prev`.
//  - sem duplicata: INSERT repetido do mesmo id sai ANTES de commitar e de
//    notificar (sem re-toque de som/browser).
//  - hidratação em lote com retry: N mensagens desconhecidas = 1 busca de
//    contatos; falha transitória tenta de novo em vez de perder a conversa.
//  - revalidação silenciosa: com lista, reconexão usa incremental
//    (fetchMessagesSince) e nunca recarga total; falha não publica `error`.
const h = vi.hoisted(() => ({
  channels: [] as Array<{
    channelName: string;
    onInsert?: (payload: unknown) => void;
    onUpdate?: (payload: unknown) => void;
    onDelete?: (payload: unknown) => void;
    onReconnect?: () => void;
  }>,
  fetchInitialConversations: vi.fn(),
  fetchContactsByIds: vi.fn(),
  fetchContactSummaries: vi.fn(),
  fetchMessagesSince: vi.fn(),
  markMessagesAsRead: vi.fn(),
  notifyAboutIncomingMessage: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/hooks/realtime/useSupabaseRealtime', () => ({
  useSupabaseRealtime: (config: (typeof h.channels)[number]) => {
    h.channels.push(config);
  },
}));

vi.mock('@/services/realtime.service', () => ({
  RealtimeService: {
    fetchInitialConversations: h.fetchInitialConversations,
    fetchContactsByIds: h.fetchContactsByIds,
    fetchContactSummaries: h.fetchContactSummaries,
    fetchMessagesSince: h.fetchMessagesSince,
    markMessagesAsRead: h.markMessagesAsRead,
  },
}));

vi.mock('@/hooks/realtime/useRealtimeNotifications', () => ({
  useRealtimeNotifications: () => ({
    newMessageNotification: null,
    notifyAboutIncomingMessage: h.notifyAboutIncomingMessage,
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

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: h.toastError },
}));

import { useRealtimeMessages } from '@/hooks/chat/useRealtimeMessages';

function makeContact(id: string, name: string) {
  return { id, name, updated_at: '2026-10-01T09:00:00Z' };
}

function makeMessage(id: string, contactId: string, createdAt: string, content = 'oi') {
  return {
    id,
    contact_id: contactId,
    sender: 'contact',
    content,
    message_type: 'text',
    created_at: createdAt,
    is_read: false,
    status: 'sent',
    status_updated_at: null,
  };
}

function makeConversation(contactId: string, name: string, createdAt: string) {
  const msg = makeMessage(`m-${contactId}-1`, contactId, createdAt);
  return {
    contact: makeContact(contactId, name),
    messages: [msg],
    unreadCount: 1,
    lastMessage: msg,
  };
}

const messagesChannel = () =>
  h.channels.find((c) => c.channelName === 'global-messages-realtime');
const contactsChannel = () =>
  h.channels.find((c) => c.channelName === 'global-contacts-realtime');

beforeEach(() => {
  vi.clearAllMocks();
  h.channels = [];
  h.fetchContactSummaries.mockResolvedValue(new Map());
  h.fetchMessagesSince.mockResolvedValue([]);
  h.markMessagesAsRead.mockResolvedValue(undefined);
});

describe('useRealtimeMessages — entrar/sair ao vivo sem recarregar', () => {
  it('INSERT de contato fora da lista INSERE a conversa (entrada ao vivo)', async () => {
    h.fetchInitialConversations.mockResolvedValue([makeConversation('c1', 'Cliente 1', '2026-10-01T10:00:00Z')]);
    h.fetchContactsByIds.mockImplementation((ids: string[]) =>
      Promise.resolve(ids.map((id) => makeContact(id, `Novo ${id}`)))
    );
    const { result } = renderHook(() => useRealtimeMessages());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      messagesChannel()?.onInsert?.({ eventType: 'INSERT', new: makeMessage('m-nova', 'c2', '2026-10-01T11:00:00Z') });
    });

    await waitFor(() => expect(result.current.conversations).toHaveLength(2), { timeout: 5000 });
    expect(result.current.conversations.some((c) => c.contact.id === 'c2')).toBe(true);
    expect(h.notifyAboutIncomingMessage).toHaveBeenCalledTimes(1);
  });

  it('INSERT repetido do mesmo id não duplica a conversa nem renotifica', async () => {
    h.fetchInitialConversations.mockResolvedValue([makeConversation('c1', 'Cliente 1', '2026-10-01T10:00:00Z')]);
    h.fetchContactsByIds.mockImplementation((ids: string[]) =>
      Promise.resolve(ids.map((id) => makeContact(id, `Novo ${id}`)))
    );
    const { result } = renderHook(() => useRealtimeMessages());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const payload = { eventType: 'INSERT', new: makeMessage('m-dup', 'c2', '2026-10-01T11:00:00Z') };
    act(() => {
      messagesChannel()?.onInsert?.(payload);
      messagesChannel()?.onInsert?.(payload);
    });

    await waitFor(() => expect(result.current.conversations).toHaveLength(2), { timeout: 5000 });
    // O lote descarrega uma vez: a conversa entra 1x, com 1 mensagem, 1 notify.
    await waitFor(() => expect(h.notifyAboutIncomingMessage).toHaveBeenCalledTimes(1), { timeout: 5000 });
    const c2 = result.current.conversations.find((c) => c.contact.id === 'c2');
    expect(c2?.messages).toHaveLength(1);
  });

  it('hidratação em lote: 3 contatos desconhecidos custam 1 busca de contatos', async () => {
    h.fetchInitialConversations.mockResolvedValue([makeConversation('c1', 'Cliente 1', '2026-10-01T10:00:00Z')]);
    h.fetchContactsByIds.mockImplementation((ids: string[]) =>
      Promise.resolve(ids.map((id) => makeContact(id, `Novo ${id}`)))
    );
    const { result } = renderHook(() => useRealtimeMessages());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      messagesChannel()?.onInsert?.({ eventType: 'INSERT', new: makeMessage('m-a', 'c2', '2026-10-01T11:00:00Z') });
      messagesChannel()?.onInsert?.({ eventType: 'INSERT', new: makeMessage('m-b', 'c3', '2026-10-01T11:01:00Z') });
      messagesChannel()?.onInsert?.({ eventType: 'INSERT', new: makeMessage('m-c', 'c4', '2026-10-01T11:02:00Z') });
    });

    await waitFor(() => expect(result.current.conversations).toHaveLength(4), { timeout: 5000 });
    expect(h.fetchContactsByIds).toHaveBeenCalledTimes(1);
    expect(h.fetchContactsByIds).toHaveBeenCalledWith(['c2', 'c3', 'c4']);
  });

  it('falha transitória na hidratação tenta de novo em vez de perder a conversa', async () => {
    h.fetchInitialConversations.mockResolvedValue([makeConversation('c1', 'Cliente 1', '2026-10-01T10:00:00Z')]);
    h.fetchContactsByIds
      .mockRejectedValueOnce(new Error('rede caiu'))
      .mockImplementation((ids: string[]) =>
        Promise.resolve(ids.map((id) => makeContact(id, `Novo ${id}`)))
      );
    const { result } = renderHook(() => useRealtimeMessages());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      messagesChannel()?.onInsert?.({ eventType: 'INSERT', new: makeMessage('m-retry', 'c2', '2026-10-01T11:00:00Z') });
    });

    await waitFor(() => expect(result.current.conversations).toHaveLength(2), { timeout: 5000 });
    expect(h.fetchContactsByIds.mock.calls.length).toBeGreaterThan(1);
  });

  it('UPDATE de contato fora da lista INSERE a conversa com o resumo do banco', async () => {
    h.fetchInitialConversations.mockResolvedValue([makeConversation('c1', 'Cliente 1', '2026-10-01T10:00:00Z')]);
    h.fetchContactsByIds.mockResolvedValue([makeContact('c9', 'Transferido 9')]);
    const resumo = makeMessage('m-resumo', 'c9', '2026-10-01T11:30:00Z', 'última do banco');
    h.fetchContactSummaries.mockResolvedValue(new Map([['c9', { unreadCount: 3, lastMessage: resumo }]]));
    const { result } = renderHook(() => useRealtimeMessages());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      contactsChannel()?.onUpdate?.({ eventType: 'UPDATE', new: { id: 'c9', name: 'Transferido 9' } });
    });

    await waitFor(() => expect(result.current.conversations).toHaveLength(2), { timeout: 5000 });
    const c9 = result.current.conversations.find((c) => c.contact.id === 'c9');
    expect(c9?.unreadCount).toBe(3);
    expect(c9?.lastMessage?.id).toBe('m-resumo');
  });

  it('DELETE do contato remove a conversa (saída ao vivo)', async () => {
    h.fetchInitialConversations.mockResolvedValue([
      makeConversation('c1', 'Cliente 1', '2026-10-01T10:00:00Z'),
      makeConversation('c2', 'Cliente 2', '2026-10-01T10:05:00Z'),
    ]);
    const { result } = renderHook(() => useRealtimeMessages());
    await waitFor(() => expect(result.current.conversations).toHaveLength(2));

    act(() => {
      contactsChannel()?.onDelete?.({ eventType: 'DELETE', old: { id: 'c1' } });
    });

    await waitFor(() => expect(result.current.conversations).toHaveLength(1));
    expect(result.current.conversations[0].contact.id).toBe('c2');
  });
});

describe('useRealtimeMessages — revalidação silenciosa com lista', () => {
  it('refetch com falha e lista: erro não bloqueante, lista intacta', async () => {
    h.fetchInitialConversations.mockResolvedValueOnce([makeConversation('c1', 'Cliente 1', '2026-10-01T10:00:00Z')]);
    const { result } = renderHook(() => useRealtimeMessages());
    await waitFor(() => expect(result.current.loading).toBe(false));

    h.fetchInitialConversations.mockRejectedValueOnce(new Error('rede caiu'));
    await act(async () => {
      await result.current.refetch();
    });

    // Ordem da recusa: sem setError/setLoading(true) em refetch com lista.
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.refreshing).toBe(false);
    expect(result.current.conversations).toHaveLength(1);
    expect(h.toastError).toHaveBeenCalledTimes(1);
  });

  it('reconexão com lista usa incremental, não recarga total', async () => {
    h.fetchInitialConversations.mockResolvedValue([makeConversation('c1', 'Cliente 1', '2026-10-01T10:00:00Z')]);
    h.fetchMessagesSince.mockResolvedValue([makeMessage('m-nova', 'c1', '2026-10-01T11:00:00Z', 'chegou na queda')]);
    const { result } = renderHook(() => useRealtimeMessages());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(h.fetchInitialConversations).toHaveBeenCalledTimes(1);

    act(() => {
      messagesChannel()?.onReconnect?.();
    });

    await waitFor(
      () => expect(result.current.conversations[0].messages).toHaveLength(2),
      { timeout: 5000 }
    );
    expect(h.fetchMessagesSince).toHaveBeenCalledWith('2026-10-01T10:00:00Z', 200);
    // Sem recarga total: a busca inicial continua sendo a única.
    expect(h.fetchInitialConversations).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
    expect(result.current.refreshing).toBe(false);
  });

  it('reconexão sem marco temporal cai na recarga total', async () => {
    const semMarco = {
      contact: makeContact('c1', 'Cliente 1'),
      messages: [],
      unreadCount: 0,
      lastMessage: null,
    };
    h.fetchInitialConversations
      .mockResolvedValueOnce([semMarco])
      .mockResolvedValueOnce([makeConversation('c1', 'Cliente 1', '2026-10-01T10:00:00Z')]);
    const { result } = renderHook(() => useRealtimeMessages());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      messagesChannel()?.onReconnect?.();
    });

    await waitFor(() => expect(h.fetchInitialConversations).toHaveBeenCalledTimes(2), { timeout: 5000 });
  });
});
