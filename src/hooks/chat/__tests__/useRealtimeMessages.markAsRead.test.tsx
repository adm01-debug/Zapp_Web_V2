/**
 * `markAsRead` unitário (`useRealtimeMessages`) — o erro não pode ser silencioso.
 *
 * Antes: o `catch` só logava. A conversa continuava contando não lidas e o
 * operador não sabia que a leitura não chegou ao banco. Agora o erro aparece no
 * toast e o contador local NÃO mente: o estado só é comitado no sucesso.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';

const h = vi.hoisted(() => ({
  fetchInitialConversations: vi.fn(),
  markMessagesAsRead: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/hooks/realtime/useSupabaseRealtime', () => ({
  useSupabaseRealtime: vi.fn(),
}));

vi.mock('@/services/realtime.service', () => ({
  RealtimeService: {
    fetchInitialConversations: h.fetchInitialConversations,
    fetchContactsByIds: vi.fn().mockResolvedValue([]),
    markMessagesAsRead: h.markMessagesAsRead,
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
  getLogger: () => ({ error: h.logError, debug: vi.fn(), info: vi.fn(), warn: vi.fn() , withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })}),
  log: { error: h.logError, debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })},
}));

vi.mock('sonner', () => ({
  toast: { error: h.toastError, success: h.toastSuccess, info: vi.fn() },
}));

import { useRealtimeMessages } from '@/hooks/chat/useRealtimeMessages';

const CONTATO = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Contato Teste',
  phone: '+5511900000000',
  avatar_url: null,
} as unknown as ConversationWithMessages['contact'];

const MENSAGEM_NAO_LIDA = {
  id: 'm1',
  contact_id: CONTATO.id,
  sender: 'contact',
  content: 'oi',
  is_read: false,
  created_at: '2026-10-15T12:00:00.000Z',
} as unknown as ConversationWithMessages['messages'][number];

function conversaNaoLida(unreadCount = 1): ConversationWithMessages {
  return {
    contact: CONTATO,
    messages: [MENSAGEM_NAO_LIDA],
    unreadCount,
    lastMessage: MENSAGEM_NAO_LIDA,
  };
}

async function montarConversa(conversa: ConversationWithMessages) {
  h.fetchInitialConversations.mockResolvedValue([conversa]);
  const { result } = renderHook(() => useRealtimeMessages());
  await waitFor(() => expect(result.current.conversations).toHaveLength(1));
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.markMessagesAsRead.mockResolvedValue(undefined);
});

describe('useRealtimeMessages — markAsRead unitário', () => {
  it('sucesso: zera o contador local e marca as mensagens recebidas como lidas', async () => {
    const result = await montarConversa(conversaNaoLida());
    expect(result.current.conversations[0].unreadCount).toBe(1);

    await act(async () => {
      await result.current.markAsRead(CONTATO.id);
    });

    expect(h.markMessagesAsRead).toHaveBeenCalledWith(CONTATO.id);
    expect(result.current.conversations[0].unreadCount).toBe(0);
    expect(result.current.conversations[0].messages[0].is_read).toBe(true);
    expect(h.toastError).not.toHaveBeenCalled();
  });

  it('falha: avisa no toast e NÃO mente no contador (nada é comitado)', async () => {
    h.markMessagesAsRead.mockRejectedValue(new Error('permission denied'));
    const result = await montarConversa(conversaNaoLida());

    await act(async () => {
      await result.current.markAsRead(CONTATO.id);
    });

    await waitFor(() =>
      expect(h.toastError).toHaveBeenCalledWith('Não foi possível marcar a conversa como lida'),
    );
    expect(h.logError).toHaveBeenCalled();
    // O estado local segue com o valor REAL: a conversa continua com 1 não lida.
    expect(result.current.conversations[0].unreadCount).toBe(1);
    expect(result.current.conversations[0].messages[0].is_read).toBe(false);
    expect(h.toastSuccess).not.toHaveBeenCalled();
  });

  it('conversa já sem não lidas: não chama o banco nem avisa', async () => {
    const result = await montarConversa({
      ...conversaNaoLida(0),
      messages: [{ ...MENSAGEM_NAO_LIDA, is_read: true } as ConversationWithMessages['messages'][number]],
    });

    await act(async () => {
      await result.current.markAsRead(CONTATO.id);
    });

    expect(h.markMessagesAsRead).not.toHaveBeenCalled();
    expect(h.toastError).not.toHaveBeenCalled();
    expect(result.current.conversations[0].unreadCount).toBe(0);
  });
});
