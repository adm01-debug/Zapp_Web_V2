import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// #411 — a lista de conversas do realtime (`useRealtimeMessages`) guarda as LINHAS
// cruas do banco. O INSERT do realtime chega sem `replyTo`; a conversa em memoria
// precisa resolver a mensagem citada entre as que JA ESTAO carregadas, sem consulta
// nova. Antes disso o balao da resposta ficava sem a citacao nesse caminho.
const h = vi.hoisted(() => ({
  configs: [] as Array<{ channelName: string; onInsert?: (payload: unknown) => void }>,
  fetchInitialConversations: vi.fn(),
}));

vi.mock('@/hooks/realtime/useSupabaseRealtime', () => ({
  useSupabaseRealtime: (config: { channelName: string; onInsert?: (payload: unknown) => void }) => {
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
import type { RealtimeMessage, ConversationContact, ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';

const CONTACT = 'contact-1';
const T0 = Date.parse('2026-01-01T10:00:00Z');

function row(overrides: Partial<RealtimeMessage> = {}): RealtimeMessage {
  return {
    id: 'm1',
    contact_id: CONTACT,
    content: 'oi',
    sender: 'contact',
    created_at: new Date(T0).toISOString(),
    updated_at: new Date(T0).toISOString(),
    message_type: 'chat',
    media_url: null,
    status: 'sent',
    reply_to_id: null,
    ...overrides,
  } as RealtimeMessage;
}

function contact(): ConversationContact {
  return {
    id: CONTACT,
    name: 'Contato',
    created_at: new Date(T0).toISOString(),
    updated_at: new Date(T0).toISOString(),
    avatar_url: null,
    tags: [],
    conversation_status: 'open',
  } as unknown as ConversationContact;
}

function conversation(messages: RealtimeMessage[]): ConversationWithMessages {
  return { contact: contact(), messages, unreadCount: 0, lastMessage: messages[messages.length - 1] ?? null };
}

function replyToOf(view: { result: { current: { conversations: ConversationWithMessages[] } } }, id: string) {
  const mensagem = view.result.current.conversations[0]?.messages.find((m) => m.id === id);
  return (mensagem as { replyTo?: unknown } | undefined)?.replyTo;
}

function emitInsert(payload: RealtimeMessage) {
  const canal = h.configs.find((c) => c.channelName === 'global-messages-realtime');
  if (!canal?.onInsert) throw new Error('canal global-messages-realtime sem onInsert');
  act(() => { canal.onInsert!({ eventType: 'INSERT', new: payload, old: null }); });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.configs = [];
  h.fetchInitialConversations.mockResolvedValue([]);
});

describe('useRealtimeMessages — replyTo no INSERT do realtime (#411)', () => {
  it('a mensagem que chega citando outra ja carregada recebe replyTo com conteudo e remetente', async () => {
    const citada = row({ id: 'citada', content: 'qual o prazo?', sender: 'contact' });
    h.fetchInitialConversations.mockResolvedValueOnce([conversation([citada])]);

    const view = renderHook(() => useRealtimeMessages());
    await waitFor(() => expect(view.result.current.conversations).toHaveLength(1));

    emitInsert(row({
      id: 'resposta', content: 'sai hoje', sender: 'agent', reply_to_id: 'citada',
      created_at: new Date(T0 + 60000).toISOString(),
    }));

    expect(view.result.current.conversations[0].messages.map((m) => m.id)).toContain('resposta');
    expect(replyToOf(view, 'resposta')).toEqual({
      messageId: 'citada',
      content: 'qual o prazo?',
      sender: 'contact',
      type: 'chat',
    });
  });

  it('citada fora da lista carregada nao inventa conteudo nem quebra a conversa', async () => {
    h.fetchInitialConversations.mockResolvedValueOnce([conversation([row({ id: 'outra' })])]);

    const view = renderHook(() => useRealtimeMessages());
    await waitFor(() => expect(view.result.current.conversations).toHaveLength(1));

    emitInsert(row({
      id: 'resposta', reply_to_id: 'mensagem-que-nao-veio',
      created_at: new Date(T0 + 60000).toISOString(),
    }));

    expect(view.result.current.conversations[0].messages.map((m) => m.id)).toContain('resposta');
    expect(replyToOf(view, 'resposta')).toBeUndefined();
    expect(view.result.current.error).toBeNull();
  });
});
