import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// A conversa ativa perde eventos enquanto a rede cai. Quando o canal volta, o hook
// precisa revalidar o historico — e sempre o da conversa CORRENTE, nunca o da que
// estava aberta quando a queda comecou.
const h = vi.hoisted(() => ({
  realtime: { config: null as unknown },
  fetchMessages: vi.fn(),
  fetchMessagesBefore: vi.fn(),
}));

vi.mock('@/hooks/realtime/useSupabaseRealtime', () => ({
  useSupabaseRealtime: (config: unknown) => { h.realtime.config = config; },
}));

vi.mock('@/services/chat.service', () => ({
  ChatService: { fetchMessages: h.fetchMessages, fetchMessagesBefore: h.fetchMessagesBefore },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { channel: vi.fn(), removeChannel: vi.fn(), from: vi.fn(), rpc: vi.fn() },
}));

import { useMessages } from '@/hooks/chat/useMessages';
import type { MessageRow } from '@/types/chat';

type MessageLike = Pick<MessageRow, 'id'> & Partial<Pick<MessageRow, 'content'>>;

const T0 = Date.parse('2026-01-01T10:00:00Z');

function row(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id: 'm1',
    contact_id: 'contact-1',
    content: 'oi',
    sender: 'contact',
    created_at: new Date(T0).toISOString(),
    message_type: 'chat',
    media_url: null,
    status: 'sent',
    ...overrides,
  } as MessageRow;
}

function config() {
  return h.realtime.config as {
    onReconnect?: () => void;
    onInsert?: (payload: { new: MessageRow }) => void;
    onUpdate?: (payload: { new: MessageRow }) => void;
    onDelete?: (payload: { old: Partial<MessageRow> }) => void;
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {children}
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.realtime.config = null;
  h.fetchMessages.mockResolvedValue({ data: [], error: null });
  h.fetchMessagesBefore.mockResolvedValue({ data: [], error: null });
});

describe('useMessages — revalidacao da conversa ativa apos reconexao', () => {
  it('revalida a conversa ativa quando o realtime reconecta', async () => {
    h.fetchMessages.mockResolvedValueOnce({ data: [row({ id: 'm1', content: 'oi' })], error: null });
    const view = renderHook(() => useMessages({ contactId: 'contact-1' }), { wrapper });

    await waitFor(() => expect(view.result.current.messages.map((m: MessageLike) => m.id)).toEqual(['m1']));
    expect(h.fetchMessages).toHaveBeenCalledTimes(1);
    expect(typeof config().onReconnect).toBe('function');

    h.fetchMessages.mockResolvedValueOnce({ data: [row({ id: 'm1', content: 'atualizada' })], error: null });
    act(() => { config().onReconnect?.(); });

    await waitFor(() => expect(view.result.current.messages[0]?.content).toBe('atualizada'));
    expect(h.fetchMessages).toHaveBeenCalledTimes(2);
  });

  it('revalida a conversa CORRENTE depois de trocar de contato, nunca a anterior', async () => {
    h.fetchMessages.mockResolvedValueOnce({ data: [row({ id: 'm1' })], error: null });
    const view = renderHook(
      ({ contactId }: { contactId: string }) => useMessages({ contactId }),
      { initialProps: { contactId: 'contact-1' }, wrapper }
    );
    await waitFor(() => expect(h.fetchMessages).toHaveBeenCalledTimes(1));

    h.fetchMessages.mockResolvedValue({ data: [row({ id: 'm2', contact_id: 'contact-2' })], error: null });
    view.rerender({ contactId: 'contact-2' });
    await waitFor(() => expect(view.result.current.messages.map((m: MessageLike) => m.id)).toEqual(['m2']));
    h.fetchMessages.mockClear();
    h.fetchMessages.mockResolvedValue({ data: [row({ id: 'm2', contact_id: 'contact-2', content: 'atual' })], error: null });

    act(() => { config().onReconnect?.(); });

    await waitFor(() => expect(view.result.current.messages[0]?.content).toBe('atual'));
    expect(h.fetchMessages.mock.calls.map((call: unknown[]) => call[0])).toEqual(['contact-2']);
  });

  it('mostra a mensagem que chegou durante a queda e nao duplica quando o canal a reentrega', async () => {
    h.fetchMessages.mockResolvedValueOnce({ data: [row({ id: 'm1' })], error: null });
    const view = renderHook(() => useMessages({ contactId: 'contact-1' }), { wrapper });
    await waitFor(() => expect(view.result.current.messages.map((m: MessageLike) => m.id)).toEqual(['m1']));

    // m2 chegou no servidor enquanto o canal estava caido: so o refetch a revela.
    const chegouNaQueda = row({ id: 'm2', content: 'chegou na queda', created_at: new Date(T0 + 1000).toISOString() });
    h.fetchMessages.mockResolvedValueOnce({ data: [row({ id: 'm1' }), chegouNaQueda], error: null });
    act(() => { config().onReconnect?.(); });
    await waitFor(() => expect(view.result.current.messages.map((m: MessageLike) => m.id)).toEqual(['m1', 'm2']));

    // O canal reentrega m2 logo depois de voltar: overlay + dedupe por id mantem uma copia.
    act(() => { config().onInsert?.({ new: chegouNaQueda }); });
    expect(view.result.current.messages.map((m: MessageLike) => m.id)).toEqual(['m1', 'm2']);
  });
});
