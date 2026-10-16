import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// #411 — a citacao e resolvida em MEMORIA, contra o indice da propria lista
// carregada: NENHUMA consulta por mensagem. Estes testes fecham a prova de custo
// do caminho de carga (`useMessages`): com a pagina inteira citando outra
// mensagem, o cliente de dados e tocado UMA vez (a pagina), nao uma vez por
// mensagem — e a citacao de MIDIA chega ao balao com o tipo certo.
const h = vi.hoisted(() => ({
  realtime: { config: null as unknown },
  fetchMessages: vi.fn(),
  fetchMessagesBefore: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  channel: vi.fn(),
}));

vi.mock('@/hooks/realtime/useSupabaseRealtime', () => ({
  useSupabaseRealtime: (config: unknown) => { h.realtime.config = config; },
}));

vi.mock('@/services/chat.service', () => ({
  ChatService: { fetchMessages: h.fetchMessages, fetchMessagesBefore: h.fetchMessagesBefore },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { channel: h.channel, removeChannel: vi.fn(), from: h.from, rpc: h.rpc },
}));

import { useMessages } from '@/hooks/chat/useMessages';
import type { MessageRow } from '@/types/chat';

const CONTACT = 'contact-1';
const T0 = Date.parse('2026-01-01T10:00:00Z');
// Pagina cheia do hook (MESSAGES_PAGE_SIZE), provada pelo argumento do fetch.
const PAGE_SIZE = 100;

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

describe('useMessages — custo da resolucao da citacao (#411)', () => {
  it('pagina inteira citando outra mensagem resolve tudo com UMA consulta (zero por mensagem)', async () => {
    // m0..m99, cada uma citando a anterior: 99 citacoes resolvidas na lista.
    const pagina = Array.from({ length: PAGE_SIZE }, (_, i) =>
      row({
        id: `m${i}`,
        content: `conteudo ${i}`,
        sender: i % 2 === 0 ? 'contact' : 'agent',
        reply_to_id: i === 0 ? null : `m${i - 1}`,
        created_at: new Date(T0 + i * 60000).toISOString(),
      }));
    h.fetchMessages.mockResolvedValueOnce({ data: pagina, error: null });

    const view = montar();
    await waitFor(() => expect(view.result.current.messages).toHaveLength(PAGE_SIZE));

    const mensagens = view.result.current.messages;
    expect(mensagens[0].replyTo).toBeUndefined();
    expect(mensagens[1].replyTo).toEqual({
      messageId: 'm0', content: 'conteudo 0', sender: 'contact', type: 'chat',
    });
    expect(mensagens[PAGE_SIZE - 1].replyTo).toEqual({
      messageId: `m${PAGE_SIZE - 2}`,
      content: `conteudo ${PAGE_SIZE - 2}`,
      sender: (PAGE_SIZE - 2) % 2 === 0 ? 'contact' : 'agent',
      type: 'chat',
    });

    // Custo: a pagina e as consultas de media/agregados sao as unicas; o cliente
    // de dados NAO e tocado por mensagem no mapeamento.
    expect(h.fetchMessages).toHaveBeenCalledTimes(1);
    expect(h.fetchMessages).toHaveBeenCalledWith(CONTACT, 0, PAGE_SIZE);
    expect(h.fetchMessagesBefore).not.toHaveBeenCalled();
    expect(h.from).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('a citacao de MIDIA chega ao balao com o tipo da citada, sem consulta nova', async () => {
    const foto = row({
      id: 'foto', content: '', sender: 'contact', message_type: 'image',
      media_url: 'https://exemplo/storage/foto.jpg', created_at: new Date(T0).toISOString(),
    });
    const resposta = row({
      id: 'resposta', content: 'linda!', sender: 'agent', reply_to_id: 'foto',
      created_at: new Date(T0 + 60000).toISOString(),
    });
    h.fetchMessages.mockResolvedValueOnce({ data: [foto, resposta], error: null });

    const view = montar();
    await waitFor(() => expect(view.result.current.messages).toHaveLength(2));

    const citacao = view.result.current.messages.find((m) => m.id === 'resposta')?.replyTo;
    expect(citacao).toEqual({
      messageId: 'foto',
      content: '',
      sender: 'contact',
      type: 'image',
    });
    expect(h.fetchMessages).toHaveBeenCalledTimes(1);
    expect(h.from).not.toHaveBeenCalled();
  });
});
