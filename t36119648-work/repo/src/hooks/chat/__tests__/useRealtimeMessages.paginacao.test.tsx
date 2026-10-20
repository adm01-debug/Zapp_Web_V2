import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// Paginação da lista (carregar mais): o hook expõe `hasMore`/`loadingMore`/`loadMore`.
// A primeira busca (fetchInitialConversations) é a página 1; `loadMore` pede a próxima
// pelo cursor (último contato da página: updated_at + id) e SÓ acrescenta contatos
// novos — a borda entre páginas pode repetir contato (updated_at igual), e repetir
// abriria conversa duplicada na sidebar.
const h = vi.hoisted(() => ({
  configs: [] as Array<{ channelName: string; onReconnect?: () => void }>,
  fetchInitialConversations: vi.fn(),
  fetchConversationsPage: vi.fn(),
}));

vi.mock('@/hooks/realtime/useSupabaseRealtime', () => ({
  useSupabaseRealtime: (config: { channelName: string; onReconnect?: () => void }) => {
    h.configs.push(config);
  },
}));

vi.mock('@/services/realtime.service', () => ({
  RealtimeService: {
    fetchInitialConversations: h.fetchInitialConversations,
    fetchConversationsPage: h.fetchConversationsPage,
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

import { useRealtimeMessages } from '../useRealtimeMessages';
import { CONVERSATIONS_PAGE_SIZE } from '../../realtime/realtimeUtils';

function conversa(i: number) {
  const id = `c-${i}`;
  const mensagem = {
    id: `m-${i}`,
    contact_id: id,
    content: `msg ${i}`,
    created_at: new Date(Date.UTC(2026, 9, 1) - i * 60_000).toISOString(),
    is_read: false,
    sender: 'contact',
  };
  return {
    contact: {
      id,
      name: `Contato ${i}`,
      updated_at: new Date(Date.UTC(2026, 9, 1) - i * 60_000).toISOString(),
      conversation_status: 'open',
    },
    messages: [mensagem],
    unreadCount: 1,
    lastMessage: mensagem,
  };
}

async function montarCom(paginas: Array<{ conversations: unknown[]; hasMore: boolean; nextCursor: unknown }>) {
  h.fetchInitialConversations.mockResolvedValue(paginas[0].conversations);
  paginas.slice(1).forEach((pagina) => h.fetchConversationsPage.mockResolvedValueOnce(pagina));
  const { result } = renderHook(() => useRealtimeMessages());
  await waitFor(() => expect(result.current.initialLoading).toBe(false));
  return result;
}

describe('useRealtimeMessages — paginação (carregar mais)', () => {
  beforeEach(() => {
    h.fetchInitialConversations.mockReset();
    h.fetchConversationsPage.mockReset();
    h.configs.length = 0;
  });

  it('página cheia liga hasMore e loadMore busca a próxima pelo cursor', async () => {
    const pagina1 = Array.from({ length: CONVERSATIONS_PAGE_SIZE }, (_, i) => conversa(i));
    const pagina2 = Array.from({ length: 50 }, (_, i) => conversa(CONVERSATIONS_PAGE_SIZE + i));
    const result = await montarCom([
      { conversations: pagina1, hasMore: true, nextCursor: null },
      { conversations: pagina2, hasMore: false, nextCursor: null },
    ]);

    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      await result.current.loadMore();
    });

    expect(h.fetchConversationsPage).toHaveBeenCalledTimes(1);
    const ultimo = pagina1[pagina1.length - 1];
    expect(h.fetchConversationsPage.mock.calls[0][0]).toEqual({
      updatedAt: ultimo.contact.updated_at,
      id: ultimo.contact.id,
    });
    expect(result.current.conversations).toHaveLength(CONVERSATIONS_PAGE_SIZE + 50);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.loadingMore).toBe(false);
  });

  it('não duplica contato repetido na borda entre páginas', async () => {
    const pagina1 = Array.from({ length: CONVERSATIONS_PAGE_SIZE }, (_, i) => conversa(i));
    const repetido = pagina1[0];
    const pagina2 = [repetido, conversa(CONVERSATIONS_PAGE_SIZE), conversa(CONVERSATIONS_PAGE_SIZE + 1)];
    const result = await montarCom([
      { conversations: pagina1, hasMore: true, nextCursor: null },
      { conversations: pagina2, hasMore: false, nextCursor: null },
    ]);

    await act(async () => {
      await result.current.loadMore();
    });

    const ids = result.current.conversations.map((c) => c.contact.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(result.current.conversations).toHaveLength(CONVERSATIONS_PAGE_SIZE + 2);
  });

  it('sem próxima página, loadMore não chama o serviço', async () => {
    const pagina1 = [conversa(0), conversa(1)];
    const result = await montarCom([{ conversations: pagina1, hasMore: false, nextCursor: null }]);

    expect(result.current.hasMore).toBe(false);

    await act(async () => {
      await result.current.loadMore();
    });

    expect(h.fetchConversationsPage).not.toHaveBeenCalled();
    expect(result.current.conversations).toHaveLength(2);
  });
});
