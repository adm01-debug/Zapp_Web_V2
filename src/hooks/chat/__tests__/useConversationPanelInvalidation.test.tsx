import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { MessageRow } from '@/types/chat';

const h = vi.hoisted(() => ({
  realtime: { config: null as unknown },
  fetchMessages: vi.fn(),
  fetchMessagesBefore: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn(), rpc: vi.fn() },
}));

vi.mock('@/hooks/realtime/useSupabaseRealtime', () => ({
  useSupabaseRealtime: (config: unknown) => { h.realtime.config = config; },
}));

vi.mock('@/services/chat.service', () => ({
  ChatService: { fetchMessages: h.fetchMessages, fetchMessagesBefore: h.fetchMessagesBefore },
}));

import {
  useConversationPanelInvalidation,
  CONVERSATION_PANEL_INVALIDATION_WINDOW_MS,
} from '@/hooks/chat/useConversationPanelInvalidation';
import { useMessages } from '@/hooks/chat/useMessages';

const CONTACT = 'contact-1';

/** Chaves que o painel do contato precisa ver atualizadas quando chega mensagem. */
const KEYS_FOR = (contactId: string) => [
  ['contact-stats', contactId],
  ['contact-crm-360', contactId],
  ['conversation-history', contactId],
  ['next-best-action', contactId],
];

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const spy = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { spy, wrapper };
}

const invalidatedKeys = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.map((call) => (call[0] as { queryKey: unknown }).queryKey ?? []);

const sorted = (keys: unknown[]) => keys.map((key) => JSON.stringify(key)).sort();
const expectedFor = (contactId: string) => sorted(KEYS_FOR(contactId));

function messageRow(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id: 'm1',
    contact_id: CONTACT,
    content: 'oi',
    sender: 'contact',
    created_at: '2026-01-01T10:00:00.000Z',
    message_type: 'chat',
    media_url: null,
    status: 'sent',
    ...overrides,
  } as MessageRow;
}

function realtimeConfig() {
  return h.realtime.config as {
    onInsert: (payload: unknown) => void;
    onUpdate: (payload: unknown) => void;
    onDelete: (payload: unknown) => void;
  };
}

function payload(eventType: 'INSERT' | 'UPDATE' | 'DELETE', oldRow: Partial<MessageRow>, newRow: Partial<MessageRow>) {
  return {
    eventType,
    new: newRow,
    old: oldRow,
    schema: 'public',
    table: 'messages',
    commit_timestamp: '2026-01-01T10:00:00Z',
    errors: null,
  } as unknown as RealtimePostgresChangesPayload<MessageRow>;
}

describe('useConversationPanelInvalidation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.fetchMessages.mockReset();
    h.fetchMessagesBefore.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('50 eventos em 1 s viram UMA invalidação por chave do painel', () => {
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useConversationPanelInvalidation(CONTACT), { wrapper });

    act(() => {
      for (let i = 0; i < 50; i += 1) result.current();
      vi.advanceTimersByTime(1000);
    });
    // dentro da janela nada é disparado
    expect(spy).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(CONVERSATION_PANEL_INVALIDATION_WINDOW_MS - 1000);
    });

    expect(sorted(invalidatedKeys(spy))).toEqual(expectedFor(CONTACT));
    expect(spy).toHaveBeenCalledTimes(4);
  });

  it('uma nova janela volta a invalidar (não engole os eventos seguintes)', () => {
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useConversationPanelInvalidation(CONTACT), { wrapper });

    act(() => { result.current(); vi.advanceTimersByTime(CONVERSATION_PANEL_INVALIDATION_WINDOW_MS); });
    expect(spy).toHaveBeenCalledTimes(4);

    act(() => { result.current(); vi.advanceTimersByTime(CONVERSATION_PANEL_INVALIDATION_WINDOW_MS); });
    expect(spy).toHaveBeenCalledTimes(8);
  });

  it('invalida o contato do EVENTO, não o da conversa aberta', () => {
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useConversationPanelInvalidation(CONTACT), { wrapper });

    act(() => { result.current('outro-contato'); vi.advanceTimersByTime(CONVERSATION_PANEL_INVALIDATION_WINDOW_MS); });

    expect(sorted(invalidatedKeys(spy))).toEqual(expectedFor('outro-contato'));
  });

  it('sem contato não agenda nada', () => {
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useConversationPanelInvalidation(null), { wrapper });

    act(() => { result.current(); result.current(null); vi.advanceTimersByTime(10000); });

    expect(spy).not.toHaveBeenCalled();
  });

  it('desmontar limpa o timer: nada é invalidado depois que o painel saiu da tela', () => {
    const { spy, wrapper } = setup();
    const { result, unmount } = renderHook(() => useConversationPanelInvalidation(CONTACT), { wrapper });

    act(() => { result.current(); });
    unmount();
    act(() => { vi.advanceTimersByTime(10000); });

    expect(spy).not.toHaveBeenCalled();
  });

  it('mensagem ao vivo em useMessages invalida o painel uma vez por janela', () => {
    const { spy, wrapper } = setup();
    h.fetchMessages.mockResolvedValue({ data: [], error: null });

    renderHook(() => useMessages({ contactId: CONTACT }), { wrapper });

    act(() => {
      realtimeConfig().onInsert(payload('INSERT', {}, messageRow()));
      vi.advanceTimersByTime(500);
    });
    expect(spy).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(CONVERSATION_PANEL_INVALIDATION_WINDOW_MS - 500); });

    expect(sorted(invalidatedKeys(spy))).toEqual(expectedFor(CONTACT));
    expect(spy).toHaveBeenCalledTimes(4);
  });

  it('UPDATE e DELETE também invalidam (DELETE sem colunas além da PK usa o contato aberto)', () => {
    const { spy, wrapper } = setup();
    h.fetchMessages.mockResolvedValue({ data: [], error: null });

    renderHook(() => useMessages({ contactId: CONTACT }), { wrapper });

    act(() => {
      // DEFAULT replica identity: o `old` do DELETE traz só a PK
      realtimeConfig().onDelete(payload('DELETE', { id: 'm1' }, {}));
      realtimeConfig().onUpdate(payload('UPDATE', messageRow(), messageRow({ status: 'delivered' })));
      vi.advanceTimersByTime(CONVERSATION_PANEL_INVALIDATION_WINDOW_MS);
    });

    // além das chaves do painel, o useMessages já invalida mídia/chips por conta própria
    const keys = sorted(invalidatedKeys(spy));
    for (const key of expectedFor(CONTACT)) {
      expect(keys.filter((k) => k === key)).toHaveLength(1);
    }
  });
});
