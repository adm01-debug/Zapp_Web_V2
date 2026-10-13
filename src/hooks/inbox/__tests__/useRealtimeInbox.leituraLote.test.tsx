/**
 * R2-INB-059 — a Inbox com a conversa ABERTA.
 *
 * Antes `markAsRead` só rodava na troca de conversa (e no deep-link): mensagem
 * que chegava na conversa aberta subia o contador até o agente sair e voltar.
 * Aqui o unread da conversa selecionada dispara a marcação (que entra na fila
 * em lote do serviço). Também cobre o flush da fila quando a Inbox desmonta
 * com um lote ainda dentro da janela de 250 ms.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const h = vi.hoisted(() => ({
  state: {
    selectedContactId: null as string | null,
    conversations: [] as Array<{ contact: { id: string; name: string }; messages: unknown[]; unreadCount: number; lastMessage: null }>,
  },
  markAsRead: vi.fn(),
  flushPendingMarkRead: vi.fn(),
}));

vi.mock('@/hooks/inbox/useInboxUIState', () => ({
  useInboxUIState: () => ({
    selectedContactId: h.state.selectedContactId,
    setSelectedContactId: vi.fn(),
    soundOn: true,
    setSoundOn: vi.fn(),
    setPendingContactId: vi.fn(),
  }),
}));

vi.mock('@/services/realtime.service', () => ({
  flushPendingMarkRead: (...args: unknown[]) => h.flushPendingMarkRead(...args),
}));

vi.mock('@/hooks/chat/useRealtimeMessages', () => ({
  useRealtimeMessages: () => ({
    conversations: h.state.conversations,
    loading: false,
    error: null,
    sendMessage: vi.fn(),
    markAsRead: h.markAsRead,
    refetch: vi.fn(),
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

vi.mock('@/hooks/system/useOfflineCache', () => ({
  useOfflineCache: () => ({ conversations: [], usingCache: false }),
  clearOfflineCache: vi.fn(),
}));

vi.mock('@/hooks/chat/useMessages', () => ({
  useMessages: () => ({ messages: [], loading: false, refetch: vi.fn() }),
}));

vi.mock('@/services/chat.service', () => ({
  ChatService: { uploadAudio: vi.fn(), sendMessage: vi.fn() },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'agente-1' }, user: { id: 'agente-1' } }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
    }),
  },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() }),
}));

import { useRealtimeInbox } from '@/hooks/inbox/useRealtimeInbox';

function conversa(id: string, naoLidas: number) {
  return { contact: { id, name: `Cliente ${id}` }, messages: [], unreadCount: naoLidas, lastMessage: null as null };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.state.selectedContactId = 'c1';
  h.state.conversations = [conversa('c1', 0)];
});

describe('useRealtimeInbox — conversa aberta', () => {
  it('marca a conversa aberta quando chega mensagem nova (unread sobe)', () => {
    const { rerender } = renderHook(() => useRealtimeInbox());
    expect(h.markAsRead).not.toHaveBeenCalled();

    h.state.conversations = [conversa('c1', 2)];
    rerender();

    expect(h.markAsRead).toHaveBeenCalledTimes(1);
    expect(h.markAsRead).toHaveBeenCalledWith('c1');
  });

  it('não remarca a conversa aberta quando não há nada por ler', () => {
    h.state.conversations = [conversa('c1', 0), conversa('c2', 3)];
    renderHook(() => useRealtimeInbox());

    expect(h.markAsRead).not.toHaveBeenCalled();
  });

  it('descarta o lote pendente quando a Inbox desmonta (sem perder a janela de 250 ms)', () => {
    const { unmount } = renderHook(() => useRealtimeInbox());
    expect(h.flushPendingMarkRead).not.toHaveBeenCalled();

    unmount();

    expect(h.flushPendingMarkRead).toHaveBeenCalledWith(false);
  });
});
