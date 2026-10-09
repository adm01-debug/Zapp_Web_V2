import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// #310 / R2-INB-013 — overlay de realtime antigo sobrescrevia o snapshot mais novo no refetch.
// O overlay guardava o último evento de cada mensagem por toda a montagem e era reaplicado por
// cima de TODO fetch. Um `delivered`/conteúdo antigo (evento ocorrido antes da consulta) voltava
// a vencer a leitura autoritativa posterior.
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
    ...overrides,
  } as MessageRow;
}

function config() {
  return h.realtime.config as {
    onInsert: (payload: unknown) => void;
    onUpdate: (payload: unknown) => void;
    onDelete: (payload: unknown) => void;
  };
}

function onUpdate(oldRow: MessageRow, newRow: MessageRow) {
  config().onUpdate({
    eventType: 'UPDATE',
    new: newRow,
    old: oldRow,
    schema: 'public',
    table: 'messages',
    commit_timestamp: '2026-01-01T10:00:00Z',
    errors: null,
  } as unknown as RealtimePostgresChangesPayload<MessageRow>);
}

function onDelete(oldRow: MessageRow) {
  config().onDelete({
    eventType: 'DELETE',
    new: {},
    old: oldRow,
    schema: 'public',
    table: 'messages',
    commit_timestamp: '2026-01-01T10:00:00Z',
    errors: null,
  } as unknown as RealtimePostgresChangesPayload<MessageRow>);
}

type Deferred = { promise: Promise<unknown>; resolve: (value: unknown) => void };

function deferred(): Deferred {
  let resolve: (value: unknown) => void = () => undefined;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

/** Monta o hook com a primeira página já carregada. O banco devolve cronológico (o serviço
 *  reverte o DESC antes de entregar). */
async function renderCom(rows: MessageRow[]) {
  h.fetchMessages.mockResolvedValueOnce({ data: rows, error: null });
  const view = renderHook(() => useMessages({ contactId: CONTACT }), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        {children}
      </QueryClientProvider>
    ),
  });
  await waitFor(() => expect(view.result.current.messages.map((m) => m.id)).toEqual(rows.map((r) => r.id)));
  return view;
}

function ids(view: { result: { current: { messages: Array<{ id: string }> } } }) {
  return view.result.current.messages.map((m) => m.id);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.realtime.config = null;
  h.fetchMessages.mockResolvedValue({ data: [], error: null });
  h.fetchMessagesBefore.mockResolvedValue({ data: [], error: null });
});

describe('useMessages — overlay de realtime x snapshot (#310 / R2-INB-013)', () => {
  it('snapshot mais novo do refetch vence o evento de realtime ANTERIOR a consulta', async () => {
    const view = await renderCom([row({ id: 'm1', content: 'oi', status: 'sent' })]);

    // Evento antigo: chegou antes do refetch e ficou retido no overlay.
    act(() => {
      onUpdate(row({ id: 'm1', status: 'sent' }), row({ id: 'm1', status: 'delivered' }));
    });
    expect(view.result.current.messages[0].status).toBe('delivered');

    // Refetch autoritativo posterior traz o valor NOVO (o evento de `read` se perdeu).
    h.fetchMessages.mockResolvedValueOnce({
      data: [row({ id: 'm1', content: 'oi', status: 'read' })],
      error: null,
    });
    await act(async () => { await view.result.current.refetch(); });

    expect(ids(view)).toEqual(['m1']);
    expect(view.result.current.messages[0].status).toBe('read');
  });

  it('evento de realtime que chega DURANTE o refetch ainda vence o snapshot', async () => {
    const view = await renderCom([row({ id: 'm1', status: 'sent' })]);

    const consulta = deferred();
    h.fetchMessages.mockReturnValueOnce(consulta.promise);
    let refetch: Promise<void> = Promise.resolve();
    act(() => { refetch = view.result.current.refetch(); });

    // O evento chega com a leitura em voo: ela ainda não o viu.
    act(() => {
      onUpdate(row({ id: 'm1', status: 'sent' }), row({ id: 'm1', status: 'read' }));
    });

    await act(async () => {
      consulta.resolve({ data: [row({ id: 'm1', status: 'sent' })], error: null });
      await refetch;
    });

    expect(view.result.current.messages[0].status).toBe('read');
  });

  it('tombstone de exclusao ocorrido DURANTE o refetch remove a linha do snapshot', async () => {
    const view = await renderCom([row({ id: 'm1' }), row({ id: 'm2', created_at: new Date(T0 + 60000).toISOString() })]);

    const consulta = deferred();
    h.fetchMessages.mockReturnValueOnce(consulta.promise);
    let refetch: Promise<void> = Promise.resolve();
    act(() => { refetch = view.result.current.refetch(); });

    act(() => { onDelete(row({ id: 'm2' })); });

    await act(async () => {
      consulta.resolve({ data: [row({ id: 'm1' }), row({ id: 'm2', created_at: new Date(T0 + 60000).toISOString() })], error: null });
      await refetch;
    });

    expect(ids(view)).toEqual(['m1']);
  });

  it('tombstone ANTERIOR ao refetch nao apaga a linha que o snapshot mais novo traz de volta', async () => {
    const view = await renderCom([row({ id: 'm1' }), row({ id: 'm2', created_at: new Date(T0 + 60000).toISOString() })]);

    act(() => { onDelete(row({ id: 'm2' })); });
    expect(ids(view)).toEqual(['m1']);

    h.fetchMessages.mockResolvedValueOnce({
      data: [row({ id: 'm1' }), row({ id: 'm2', created_at: new Date(T0 + 60000).toISOString() })],
      error: null,
    });
    await act(async () => { await view.result.current.refetch(); });

    expect(ids(view)).toEqual(['m1', 'm2']);
  });
});
