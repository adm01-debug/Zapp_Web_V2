import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// Correções dos pontos 1 e 2 do revisor no caminho de hidratação:
//  PONTO 1 — `markMessageSeen` marca o id ANTES de a hidratação entrar. Se o
//  lote falha (mesmo após o retry) ou o contato não volta, as mensagens ficavam
//  marcadas sem estar na lista e `fetchIncrementalConversations` as pulava para
//  sempre (`if (!markMessageSeen(m.id)) continue`) — a conversa só reaparecia
//  numa recarga manual. Aqui: falha dupla no lote e a reconexão incremental
//  ainda traz a conversa.
//  PONTO 2 — se o contato entra na lista com a busca do lote em voo, o
//  `continue` antigo descartava as mensagens pendentes mas notificava mesmo
//  assim. Aqui: mescla na conversa existente (dedupe por id) e notifica SÓ o
//  que entrou.
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

describe('useRealtimeMessages — hidratação em lote não pode perder mensagem', () => {
  it('PONTO 1: falha dupla no lote devolve o id ao dedupe e a reconexão incremental ainda traz a conversa', async () => {
    h.fetchInitialConversations.mockResolvedValue([makeConversation('c1', 'Cliente 1', '2026-10-01T10:00:00Z')]);
    // As DUAS tentativas do lote (busca + retry de 250 ms) falham.
    h.fetchContactsByIds.mockRejectedValue(new Error('rede caiu'));
    const { result } = renderHook(() => useRealtimeMessages());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      messagesChannel()?.onInsert?.({ eventType: 'INSERT', new: makeMessage('m-c2', 'c2', '2026-10-01T11:00:00Z') });
    });

    // O lote abriu a busca e tentou de novo — nada entrou na lista.
    await waitFor(() => expect(h.fetchContactsByIds).toHaveBeenCalledTimes(2), { timeout: 5000 });
    expect(result.current.conversations).toHaveLength(1);

    // A rede voltou: a revalidação incremental precisa trazer a mensagem que o
    // lote falho não conseguiu hidratar (antes o id seguia marcado e era pulado).
    h.fetchContactsByIds.mockImplementation((ids: string[]) =>
      Promise.resolve(ids.map((id) => makeContact(id, `Novo ${id}`)))
    );
    h.fetchMessagesSince.mockResolvedValue([makeMessage('m-c2', 'c2', '2026-10-01T11:00:00Z')]);
    act(() => {
      messagesChannel()?.onReconnect?.();
    });

    await waitFor(
      () => expect(result.current.conversations.some((c) => c.contact.id === 'c2')).toBe(true),
      { timeout: 5000 }
    );
    expect(result.current.conversations).toHaveLength(2);
    const c2 = result.current.conversations.find((c) => c.contact.id === 'c2');
    expect(c2?.messages.map((m) => m.id)).toEqual(['m-c2']);
  });

  it('PONTO 2: contato entra na lista com o lote em voo — mescla a mensagem e notifica só o que entrou', async () => {
    h.fetchInitialConversations.mockResolvedValue([makeConversation('c1', 'Cliente 1', '2026-10-01T10:00:00Z')]);
    let resolverBuscaDoLote: ((contacts: unknown[]) => void) | undefined;
    h.fetchContactsByIds
      // 1ª chamada = busca do lote, fica em voo até o teste resolver.
      .mockImplementationOnce(() => new Promise((resolve) => { resolverBuscaDoLote = resolve; }))
      .mockImplementation((ids: string[]) =>
        Promise.resolve(ids.map((id) => makeContact(id, `Novo ${id}`)))
      );
    const { result } = renderHook(() => useRealtimeMessages());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Duas mensagens do contato c2 (desconhecido) entram pelo realtime.
    act(() => {
      messagesChannel()?.onInsert?.({ eventType: 'INSERT', new: makeMessage('m-c2-1', 'c2', '2026-10-01T11:00:00Z') });
      messagesChannel()?.onInsert?.({ eventType: 'INSERT', new: makeMessage('m-c2-2', 'c2', '2026-10-01T11:01:00Z') });
    });
    await waitFor(() => expect(h.fetchContactsByIds).toHaveBeenCalledTimes(1), { timeout: 5000 });

    // Enquanto a busca do lote está em voo, c2 entra na lista por UPDATE de
    // contato, já com o resumo do banco (contém m-c2-1).
    h.fetchContactSummaries.mockResolvedValue(
      new Map([['c2', { unreadCount: 1, lastMessage: makeMessage('m-c2-1', 'c2', '2026-10-01T11:00:00Z') }]])
    );
    act(() => {
      contactsChannel()?.onUpdate?.({ eventType: 'UPDATE', new: { id: 'c2', name: 'Novo c2' } });
    });
    await waitFor(
      () => expect(result.current.conversations.some((c) => c.contact.id === 'c2')).toBe(true),
      { timeout: 5000 }
    );

    // O lote em voo resolve: m-c2-1 já está na conversa (não duplica) e só a
    // m-c2-2 nova é mesclada e notificada.
    act(() => {
      resolverBuscaDoLote?.([makeContact('c2', 'Novo c2')]);
    });

    await waitFor(
      () => {
        const c2 = result.current.conversations.find((c) => c.contact.id === 'c2');
        expect(c2?.messages.map((m) => m.id)).toEqual(['m-c2-1', 'm-c2-2']);
      },
      { timeout: 5000 }
    );
    expect(h.notifyAboutIncomingMessage).toHaveBeenCalledTimes(1);
    expect(h.notifyAboutIncomingMessage.mock.calls[0][1]).toMatchObject({ id: 'm-c2-2' });
  });
});
