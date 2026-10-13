/**
 * Fallback do contato selecionado (V2) — paridade com `useFallbackContact.test.ts` da V3.
 *
 * Na V2 o fallback vive DENTRO de `useRealtimeInbox`: quando o contato selecionado
 * (`selectedContactId`) não está na lista em cache, o hook faz um lookup pontual em
 * `contacts` por `id` e monta uma conversa sintética (`messages: []`, `unreadCount: 0`,
 * `lastMessage: null`). Sem essa busca, clicar num contato que não veio no snapshot da
 * lista deixava `legacyConversation` nulo e o painel não abria.
 *
 * O teste roda o hook REAL; só as dependências de dados (supabase, hooks de lista/mensagens)
 * são substituídas. A V2 é local-only (UUID): não há ramificação por JID como na V3.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

type ContactRow = Record<string, unknown>;

const state = vi.hoisted(() => ({
  selectedContactId: 'c1' as string | null,
  conversations: [] as Array<Record<string, unknown>>,
  contactsLookup: async (): Promise<{ data: ContactRow | null; error: unknown }> => ({
    data: null,
    error: null,
  }),
}));

const fromMock = vi.hoisted(() => vi.fn());
const eqMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/hooks/inbox/useInboxUIState', () => ({
  useInboxUIState: () => ({
    selectedContactId: state.selectedContactId,
    setSelectedContactId: vi.fn(),
    soundOn: true,
    setSoundOn: vi.fn(),
    setPendingContactId: vi.fn(),
  }),
}));

vi.mock('@/hooks/chat/useRealtimeMessages', () => ({
  useRealtimeMessages: () => ({
    conversations: [],
    loading: false,
    error: null,
    sendMessage: vi.fn(),
    markAsRead: vi.fn(),
    refetch: vi.fn(),
    newMessageNotification: null,
    dismissNotification: vi.fn(),
    setSelectedContact: vi.fn(),
    setSoundEnabled: vi.fn(),
  }),
}));

vi.mock('@/hooks/integrations/useExternalEvolution', () => ({
  useExternalConversations: () => ({ conversations: [], loading: false, error: null, refetch: vi.fn() }),
  useExternalMessages: () => ({ messages: [], loading: false, error: null, refetch: vi.fn() }),
}));

vi.mock('@/hooks/system/useOfflineCache', () => ({
  useOfflineCache: () => ({ conversations: state.conversations, usingCache: false }),
}));

vi.mock('@/hooks/chat/useMessages', () => ({
  useMessages: () => ({
    messages: [],
    loading: false,
    error: null,
    refetch: vi.fn(),
    hasOlder: false,
    loadingOlder: false,
    loadOlderMessages: vi.fn(),
    addMessage: vi.fn(),
    updateMessage: vi.fn(),
    removeMessage: vi.fn(),
  }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ profile: null }) }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useRealtimeInbox } from '@/hooks/inbox/useRealtimeInbox';

const contatoDeBanco = (id: string, name: string): ContactRow => ({
  id,
  name,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
});

const conversaEmCache = (id: string, name: string): Record<string, unknown> => ({
  contact: contatoDeBanco(id, name),
  messages: [],
  unreadCount: 2,
  lastMessage: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  state.selectedContactId = 'c1';
  state.conversations = [];
  state.contactsLookup = async () => ({ data: null, error: null });

  fromMock.mockImplementation(() => ({
    select: () => ({
      eq: (column: string, value: unknown) => {
        eqMock(column, value);
        return { maybeSingle: () => state.contactsLookup() };
      },
    }),
  }));
});

describe('useRealtimeInbox — fallback do contato selecionado', () => {
  it('usa a conversa em cache quando o contato selecionado está na lista (sem tocar o banco)', () => {
    state.conversations = [conversaEmCache('c1', 'Ana')];

    const { result } = renderHook(() => useRealtimeInbox());

    expect(result.current.legacyConversation?.contact.id).toBe('c1');
    expect(result.current.legacyConversation?.contact.name).toBe('Ana');
    expect(result.current.legacyConversation?.unreadCount).toBe(2);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('busca em contacts por id e monta a conversa sintética quando o contato não está na lista', async () => {
    state.conversations = [];
    state.contactsLookup = async () => ({ data: contatoDeBanco('c1', 'Contato do banco'), error: null });

    const { result } = renderHook(() => useRealtimeInbox());

    await waitFor(() => {
      expect(result.current.legacyConversation?.contact.id).toBe('c1');
    });

    expect(fromMock).toHaveBeenCalledWith('contacts');
    expect(eqMock).toHaveBeenCalledWith('id', 'c1');
    expect(result.current.legacyConversation?.contact.name).toBe('Contato do banco');
    // A conversa sintética vem sem histórico e sem não-lidas.
    expect(result.current.legacyConversation?.unreadCount).toBe(0);
    expect(result.current.legacyConversation?.lastMessage).toBeUndefined();
    expect(result.current.legacyMessages).toEqual([]);
  });

  it('erro no lookup do contato não vira conversa (fica nulo)', async () => {
    state.conversations = [];
    state.contactsLookup = async () => ({ data: contatoDeBanco('c1', 'Ignorado'), error: { message: 'falha' } });

    const { result } = renderHook(() => useRealtimeInbox());

    // Dá tempo do efeito assíncrono rodar; a conversa NÃO pode ser publicada a partir de um erro.
    await waitFor(() => {
      expect(fromMock).toHaveBeenCalledWith('contacts');
    });

    expect(result.current.legacyConversation).toBeNull();
  });

  it('sem contato selecionado não consulta o banco e não há conversa', () => {
    state.selectedContactId = null;

    const { result } = renderHook(() => useRealtimeInbox());

    expect(fromMock).not.toHaveBeenCalled();
    expect(result.current.legacyConversation).toBeNull();
  });
});
