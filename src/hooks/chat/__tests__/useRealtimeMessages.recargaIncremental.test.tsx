import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// Redo pontos 3 e 4 da recusa do revisor (baseline b3602d4ca8):
//  - PONTO 3: a revalidação incremental (`fetchMessagesSince`, ascendente e sem
//    paginação) mesclava em silêncio o lote de 200 e descartava o excedente.
//    Teto atingido tem que cair na recarga total — nada de lacuna silenciosa.
//  - PONTO 4: um UPDATE de contato fora da lista SEM resumo no banco inseria uma
//    conversa vazia (`buildConversation(contact, [], null)`). Sem conversa real,
//    o UPDATE é ignorado.
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

// Mesmo teto pedido ao serviço (default de `fetchMessagesSince`).
const LIMITE_INCREMENTAL = 200;

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

describe('useRealtimeMessages — teto do lote incremental (PONTO 3)', () => {
  it('lote no teto não trunca em silêncio: cai na recarga total', async () => {
    h.fetchInitialConversations
      .mockResolvedValueOnce([makeConversation('c1', 'Cliente 1', '2026-10-01T10:00:00Z')])
      // A recarga total enxerga o que o lote não trouxe.
      .mockResolvedValueOnce([makeConversation('c1', 'Cliente 1', '2026-10-01T16:00:00Z')]);
    // 200 mensagens novas = teto exato da consulta (ascendente, sem paginação):
    // pode haver mais fora do lote.
    const lote = Array.from({ length: LIMITE_INCREMENTAL }, (_, i) =>
      makeMessage(
        `m-lote-${i}`,
        'c1',
        `2026-10-01T11:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}Z`
      )
    );
    h.fetchMessagesSince.mockResolvedValue(lote);

    const { result } = renderHook(() => useRealtimeMessages());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(h.fetchInitialConversations).toHaveBeenCalledTimes(1);

    act(() => {
      messagesChannel()?.onReconnect?.();
    });

    await waitFor(() => expect(h.fetchInitialConversations).toHaveBeenCalledTimes(2), { timeout: 5000 });
    // A lista veio da recarga total, não do lote parcial mesclado.
    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.conversations[0].messages).toHaveLength(1);
    expect(result.current.conversations[0].lastMessage?.created_at).toBe('2026-10-01T16:00:00Z');
    expect(result.current.refreshing).toBe(false);
  });

  it('lote abaixo do teto continua incremental, sem recarga total', async () => {
    h.fetchInitialConversations.mockResolvedValue([makeConversation('c1', 'Cliente 1', '2026-10-01T10:00:00Z')]);
    h.fetchMessagesSince.mockResolvedValue([
      makeMessage('m-nova', 'c1', '2026-10-01T11:00:00Z', 'chegou na queda'),
    ]);

    const { result } = renderHook(() => useRealtimeMessages());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      messagesChannel()?.onReconnect?.();
    });

    await waitFor(
      () => expect(result.current.conversations[0].messages).toHaveLength(2),
      { timeout: 5000 }
    );
    expect(h.fetchMessagesSince).toHaveBeenCalledWith('2026-10-01T10:00:00Z', LIMITE_INCREMENTAL);
    expect(h.fetchInitialConversations).toHaveBeenCalledTimes(1);
    expect(result.current.refreshing).toBe(false);
  });
});

describe('useRealtimeMessages — UPDATE de contato sem conversa real (PONTO 4)', () => {
  it('contato fora da lista sem resumo NÃO entra como conversa vazia', async () => {
    h.fetchInitialConversations.mockResolvedValue([makeConversation('c1', 'Cliente 1', '2026-10-01T10:00:00Z')]);
    h.fetchContactsByIds.mockResolvedValue([makeContact('c9', 'Só editado no cadastro')]);
    h.fetchContactSummaries.mockResolvedValue(new Map()); // sem resumo no banco

    const { result } = renderHook(() => useRealtimeMessages());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      contactsChannel()?.onUpdate?.({ eventType: 'UPDATE', new: { id: 'c9', name: 'Só editado no cadastro' } });
    });
    // O UPDATE foi processado até o fim (contato e resumo consultados) antes de
    // a asserção negativa ser feita.
    await waitFor(() => expect(h.fetchContactSummaries).toHaveBeenCalledWith(['c9']), { timeout: 5000 });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.conversations.some((c) => c.contact.id === 'c9')).toBe(false);
  });

  it('contato fora da lista COM resumo entra com a conversa real do banco', async () => {
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
});
