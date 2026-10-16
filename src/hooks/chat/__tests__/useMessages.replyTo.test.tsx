import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// #411 — a CARGA INICIAL e a PAGINACAO montavam as mensagens sem resolver
// `reply_to_id`, entao a citacao nunca chegava ao balao (`message.replyTo`).
// Estes testes provam que o hook preenche `replyTo` a partir das mensagens ja
// carregadas — inclusive quando a citada chega DEPOIS, numa pagina mais antiga —
// e que uma citacao fora da lista nao quebra nem inventa conteudo.
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

describe('useMessages — replyTo da carga inicial (#411)', () => {
  it('a mensagem que responde outra da mesma pagina recebe replyTo com conteudo e remetente', async () => {
    const citada = row({ id: 'citada', content: 'qual o prazo?', sender: 'contact', created_at: new Date(T0).toISOString() });
    const resposta = row({
      id: 'resposta', content: 'sai hoje', sender: 'agent', reply_to_id: 'citada',
      created_at: new Date(T0 + 60000).toISOString(),
    });
    h.fetchMessages.mockResolvedValueOnce({ data: [citada, resposta], error: null });

    const view = montar();
    await waitFor(() => expect(view.result.current.messages).toHaveLength(2));

    const [primeira, segunda] = view.result.current.messages;
    expect(primeira.replyTo).toBeUndefined();
    expect(segunda.replyTo).toEqual({
      messageId: 'citada',
      content: 'qual o prazo?',
      sender: 'contact',
      type: 'chat',
    });
  });

  it('citacao fora da lista carregada nao quebra o balao nem inventa conteudo', async () => {
    h.fetchMessages.mockResolvedValueOnce({
      data: [
        row({ id: 'resposta', reply_to_id: 'mensagem-que-nao-veio', created_at: new Date(T0 + 60000).toISOString() }),
        row({ id: 'outra', created_at: new Date(T0).toISOString() }),
      ],
      error: null,
    });

    const view = montar();
    await waitFor(() => expect(view.result.current.messages).toHaveLength(2));

    const citante = view.result.current.messages.find((m) => m.id === 'resposta');
    expect(citante?.replyTo).toBeUndefined();
    expect(view.result.current.error).toBeNull();
  });
});

describe('useMessages — replyTo da paginacao (#411)', () => {
  it('a citada que chega depois, numa pagina mais antiga, preenche o replyTo da resposta ja na tela', async () => {
    h.fetchMessages.mockResolvedValue({ data: [], error: null });
    const view0 = montar();
    await waitFor(() => expect(h.fetchMessages).toHaveBeenCalled());
    const pageSize = h.fetchMessages.mock.calls[0][2] as number;
    view0.unmount();

    // Pagina cheia: a resposta cita uma mensagem mais antiga que ainda nao veio.
    const pagina = Array.from({ length: pageSize }, (_, i) =>
      row({ id: `m${i}`, created_at: new Date(T0 + i * 60000).toISOString() }));
    pagina[pageSize - 1] = row({
      id: 'resposta', reply_to_id: 'velha', content: 'combinado',
      created_at: new Date(T0 + (pageSize - 1) * 60000).toISOString(),
    });
    h.fetchMessages.mockResolvedValueOnce({ data: pagina, error: null });

    const view = montar();
    await waitFor(() => expect(view.result.current.messages).toHaveLength(pageSize));
    expect(view.result.current.messages.find((m) => m.id === 'resposta')?.replyTo).toBeUndefined();

    const velha = row({ id: 'velha', content: 'manda amanha', sender: 'contact', created_at: new Date(T0 - 60000).toISOString() });
    h.fetchMessagesBefore.mockResolvedValueOnce({ data: [velha], error: null });
    await act(async () => { await view.result.current.loadOlderMessages(); });

    expect(view.result.current.messages.map((m) => m.id)[0]).toBe('velha');
    expect(view.result.current.messages.find((m) => m.id === 'resposta')?.replyTo).toEqual({
      messageId: 'velha',
      content: 'manda amanha',
      sender: 'contact',
      type: 'chat',
    });
  });
});
