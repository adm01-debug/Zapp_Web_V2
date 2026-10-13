/**
 * R2-INB-059 — casos 8 e 9 do contrato de leitura em lote (portado do Zapp Web V3).
 *
 * 8. a conversa clicada zera NA HORA (commit otimista) e a ida ao banco espera a
 *    janela de agrupamento — o hook recebe de volta uma promise que resolve no
 *    enfileiramento (o serviço só escreve no flush; a espera está coberta em
 *    src/services/__tests__/realtime.service.markReadFlush.test.ts);
 * 9. conversa que o agente não abriu fica intacta: contador, `is_read` e o PATCH
 *    não a incluem.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

const h = vi.hoisted(() => ({
  configs: [] as Array<{ channelName: string; onReconnect?: () => void }>,
  fetchInitialConversations: vi.fn(),
  markMessagesAsRead: vi.fn(),
}));

vi.mock('@/hooks/realtime/useSupabaseRealtime', () => ({
  useSupabaseRealtime: (config: { channelName: string; onReconnect?: () => void }) => {
    h.configs.push(config);
  },
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
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

import { useRealtimeMessages } from '@/hooks/chat/useRealtimeMessages';

function conversa(id: string, nome: string, naoLidas: number) {
  return {
    contact: { id, name: nome },
    messages: Array.from({ length: naoLidas }, (_, i) => ({
      id: `${id}-msg-${i}`,
      contact_id: id,
      content: 'oi',
      message_type: 'text',
      sender: 'contact',
      created_at: new Date(Date.UTC(2026, 9, 13, 12, i)).toISOString(),
      is_read: false,
    })),
    unreadCount: naoLidas,
    lastMessage: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.configs = [];
  h.fetchInitialConversations.mockResolvedValue([conversa(A, 'Cliente A', 2), conversa(B, 'Cliente B', 1)]);
  h.markMessagesAsRead.mockResolvedValue(undefined);
});

describe('useRealtimeMessages — leitura otimista', () => {
  it('8. zera a conversa clicada na hora e manda a leitura em 1 chamada', async () => {
    const { result } = renderHook(() => useRealtimeMessages());
    await waitFor(() => expect(result.current.conversations).toHaveLength(2));

    await act(async () => { await result.current.markAsRead(A); });

    const aberta = result.current.conversations.find((c) => c.contact.id === A)!;
    expect(aberta.unreadCount).toBe(0);
    expect(aberta.messages.every((m) => m.is_read)).toBe(true);
    expect(h.markMessagesAsRead).toHaveBeenCalledTimes(1);
    expect(h.markMessagesAsRead).toHaveBeenCalledWith(A);
  });

  it('9. conversa que não está aberta fica intacta (contador, is_read e PATCH)', async () => {
    const { result } = renderHook(() => useRealtimeMessages());
    await waitFor(() => expect(result.current.conversations).toHaveLength(2));

    await act(async () => { await result.current.markAsRead(A); });

    const outra = result.current.conversations.find((c) => c.contact.id === B)!;
    expect(outra.unreadCount).toBe(1);
    expect(outra.messages.every((m) => m.is_read === false)).toBe(true);
    expect(h.markMessagesAsRead).not.toHaveBeenCalledWith(B);
    expect(h.markMessagesAsRead.mock.calls.flat()).not.toContain(B);
  });
});
