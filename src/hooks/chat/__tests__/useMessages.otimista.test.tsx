import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// #411 — a mensagem otimista do envio (`addMessage`) so entraria na lista com
// `reply_to_id` e sem `replyTo`: a citacao so apareceria depois do INSERT do
// servidor. Como o id da resposta ja esta em maos no momento do envio, a citada
// tem que ser resolvida na hora, contra a lista que ja esta carregada.
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
import { mapMessageRowToMessage } from '@/adapters/inboxAdapter';
import type { MessageRow } from '@/types/chat';

const CONTACT = 'contact-1';
const T0 = Date.parse('2026-01-01T10:00:00Z');

function row(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id: 'm1',
    contact_id: CONTACT,
    content: 'oi',
    sender: 'contact',
    created_at: new Date(T0).toISOString(),
    message_type: 'chat',
    media_url: null,
    status: 'sent',
    reply_to_id: null,
    ...overrides,
  } as MessageRow;
}

function montar() {
  return renderHook(() => useMessages({ contactId: CONTACT }), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        {children}
      </QueryClientProvider>
    ),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.realtime.config = null;
  h.fetchMessages.mockResolvedValue({ data: [], error: null });
  h.fetchMessagesBefore.mockResolvedValue({ data: [], error: null });
});

describe('useMessages — replyTo da mensagem otimista do envio (#411)', () => {
  it('mostra a citacao imediatamente, resolvida da lista carregada, sem consulta nova', async () => {
    const citada = row({ id: 'citada', content: 'qual o prazo?', sender: 'contact' });
    h.fetchMessages.mockResolvedValueOnce({ data: [citada], error: null });

    const view = montar();
    await waitFor(() => expect(view.result.current.messages).toHaveLength(1));

    act(() => {
      view.result.current.addMessage(mapMessageRowToMessage(row({
        id: 'otimista', content: 'sai hoje', sender: 'agent', reply_to_id: 'citada',
        created_at: new Date(T0 + 60000).toISOString(),
      })));
    });

    const enviada = view.result.current.messages.find((m) => m.id === 'otimista');
    expect(enviada?.replyTo).toEqual({
      messageId: 'citada',
      content: 'qual o prazo?',
      sender: 'contact',
      type: 'chat',
    });
    // Nada de consulta por mensagem: a otimista nao dispara fetch.
    expect(h.fetchMessages).toHaveBeenCalledTimes(1);
  });

  it('citada fora da lista nao inventa conteudo (replyTo ausente)', async () => {
    h.fetchMessages.mockResolvedValueOnce({ data: [row({ id: 'outra' })], error: null });

    const view = montar();
    await waitFor(() => expect(view.result.current.messages).toHaveLength(1));

    act(() => {
      view.result.current.addMessage(mapMessageRowToMessage(row({
        id: 'otimista', sender: 'agent', reply_to_id: 'mensagem-que-nao-veio',
        created_at: new Date(T0 + 60000).toISOString(),
      })));
    });

    expect(view.result.current.messages.find((m) => m.id === 'otimista')?.replyTo).toBeUndefined();
  });
});
