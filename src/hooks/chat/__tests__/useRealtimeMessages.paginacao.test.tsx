import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// Paginação da lista (carregar mais): o hook expõe `hasMore`/`loadingMore`/`loadMore`.
// A primeira busca (fetchConversationsPage(null)) é a página 1 — cursor e hasMore
// vêm do serviço; `loadMore` pede a próxima pelo cursor e SÓ acrescenta contatos
// novos — a borda entre páginas pode repetir contato (updated_at igual), e repetir
// abriria conversa duplicada na sidebar.
const h = vi.hoisted(() => ({
  configs: [] as Array<{ channelName: string; onReconnect?: () => void }>,
  fetchConversationsPage: vi.fn(),
}));

vi.mock('@/hooks/realtime/useSupabaseRealtime', () => ({
  useSupabaseRealtime: (config: { channelName: string; onReconnect?: () => void }) => {
    h.configs.push(config);
  },
}));

vi.mock('@/services/realtime.service', () => ({
  RealtimeService: {
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
  paginas.forEach((pagina) => h.fetchConversationsPage.mockResolvedValueOnce(pagina));
  const { result } = renderHook(() => useRealtimeMessages());
  await waitFor(() => expect(result.current.initialLoading).toBe(false));
  return result;
}

describe('useRealtimeMessages — paginação (carregar mais)', () => {
  beforeEach(() => {
    h.fetchConversationsPage.mockReset();
    h.configs.length = 0;
  });

  it('página cheia liga hasMore e loadMore busca a próxima pelo cursor do serviço', async () => {
    const pagina1 = Array.from({ length: CONVERSATIONS_PAGE_SIZE }, (_, i) => conversa(i));
    const cursorDaPagina1 = {
      updatedAt: pagina1[pagina1.length - 1].contact.updated_at,
      id: pagina1[pagina1.length - 1].contact.id,
    };
    const pagina2 = Array.from({ length: 50 }, (_, i) => conversa(CONVERSATIONS_PAGE_SIZE + i));
    const result = await montarCom([
      { conversations: pagina1, hasMore: true, nextCursor: cursorDaPagina1 },
      { conversations: pagina2, hasMore: false, nextCursor: null },
    ]);

    expect(h.fetchConversationsPage.mock.calls[0][0]).toBeNull();
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      await result.current.loadMore();
    });

    expect(h.fetchConversationsPage).toHaveBeenCalledTimes(2);
    expect(h.fetchConversationsPage.mock.calls[1][0]).toEqual(cursorDaPagina1);
    expect(result.current.conversations).toHaveLength(CONVERSATIONS_PAGE_SIZE + 50);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.loadingMore).toBe(false);
  });

  it('não duplica contato repetido na borda entre páginas', async () => {
    const pagina1 = Array.from({ length: CONVERSATIONS_PAGE_SIZE }, (_, i) => conversa(i));
    const cursorDaPagina1 = {
      updatedAt: pagina1[pagina1.length - 1].contact.updated_at,
      id: pagina1[pagina1.length - 1].contact.id,
    };
    const repetido = pagina1[0];
    const pagina2 = [repetido, conversa(CONVERSATIONS_PAGE_SIZE), conversa(CONVERSATIONS_PAGE_SIZE + 1)];
    const result = await montarCom([
      { conversations: pagina1, hasMore: true, nextCursor: cursorDaPagina1 },
      { conversations: pagina2, hasMore: false, nextCursor: null },
    ]);

    await act(async () => {
      await result.current.loadMore();
    });

    expect(h.fetchConversationsPage.mock.calls[1][0]).toEqual(cursorDaPagina1);
    const ids = result.current.conversations.map((c) => c.contact.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(result.current.conversations).toHaveLength(CONVERSATIONS_PAGE_SIZE + 2);
  });

  it('sem próxima página, loadMore não chama o serviço de novo', async () => {
    const pagina1 = [conversa(0), conversa(1)];
    const result = await montarCom([{ conversations: pagina1, hasMore: false, nextCursor: null }]);

    expect(result.current.hasMore).toBe(false);

    await act(async () => {
      await result.current.loadMore();
    });

    // Só a primeira carga (página 1) chamou o serviço; sem hasMore não há continuação.
    expect(h.fetchConversationsPage).toHaveBeenCalledTimes(1);
    expect(h.fetchConversationsPage.mock.calls[0][0]).toBeNull();
    expect(result.current.conversations).toHaveLength(2);
  });

  it('primeira carga usa o cursor do serviço: extra mais antigo no fim não desloca a continuação', async () => {
    const pagina = Array.from({ length: CONVERSATIONS_PAGE_SIZE }, (_, i) => conversa(i));
    const cursorDaPagina = {
      updatedAt: pagina[pagina.length - 1].contact.updated_at,
      id: pagina[pagina.length - 1].contact.id,
    };
    const baseExtra = conversa(9999);
    const extraAntigo = {
      ...baseExtra,
      contact: { ...baseExtra.contact, updated_at: new Date(Date.UTC(2026, 8, 1)).toISOString() },
    };
    const pagina2 = [conversa(CONVERSATIONS_PAGE_SIZE), conversa(CONVERSATIONS_PAGE_SIZE + 1)];
    const result = await montarCom([
      { conversations: [...pagina, extraAntigo], hasMore: true, nextCursor: cursorDaPagina },
      { conversations: pagina2, hasMore: false, nextCursor: null },
    ]);

    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      await result.current.loadMore();
    });

    // A primeira carga é a página 1: a continuação sai do cursor do serviço
    // (último contato PAGINADO), não do último item exibido — o extra, mais
    // antigo, está no fim da lista e não pode virar cursor.
    expect(h.fetchConversationsPage).toHaveBeenCalledTimes(2);
    expect(h.fetchConversationsPage.mock.calls[1][0]).toEqual(cursorDaPagina);
  });
});
