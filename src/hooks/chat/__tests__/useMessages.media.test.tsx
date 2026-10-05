import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

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
import { contactMediaKey } from '@/hooks/chat/useContactMedia';
import { contactMediaCountsKey } from '@/hooks/chat/useContactMediaCounts';
import { conversationTabCountsKey } from '@/hooks/chat/useConversationTabCounts';
import type { MessageRow } from '@/types/chat';

const CONTACT = 'contact-1';

function row(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id: 'msg-1',
    contact_id: CONTACT,
    content: '',
    sender: 'contact',
    created_at: '2026-01-01T10:00:00Z',
    message_type: 'image',
    media_url: null,
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

function onInsert(payloadRow: MessageRow) {
  config().onInsert({
    eventType: 'INSERT',
    new: payloadRow,
    old: {},
    schema: 'public',
    table: 'messages',
    commit_timestamp: '2026-01-01T10:00:00Z',
    errors: null,
  } as unknown as RealtimePostgresChangesPayload<MessageRow>);
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

function render() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
  const view = renderHook(() => useMessages({ contactId: CONTACT }), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  });
  return { ...view, invalidateSpy };
}

async function renderReady() {
  const view = render();
  await waitFor(() => expect(h.realtime.config).not.toBeNull());
  await waitFor(() => expect(h.fetchMessages).toHaveBeenCalled());
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.realtime.config = null;
  h.fetchMessages.mockResolvedValue({ data: [], error: null });
  h.fetchMessagesBefore.mockResolvedValue({ data: [], error: null });
});

describe('useMessages — atualização ao vivo da aba Arquivos (etapa 45)', () => {
  it('evento realtime COM media_url invalida a galeria, o badge da aba e os chips', async () => {
    const { invalidateSpy } = await renderReady();

    act(() => { onInsert(row({ media_url: 'https://x/a.jpg' })); });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: contactMediaKey(CONTACT) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: conversationTabCountsKey(CONTACT) });
    // etapa 42: os chips contam por tipo; sem invalidar, chip e badge divergem
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: contactMediaCountsKey(CONTACT) });
    expect(invalidateSpy).toHaveBeenCalledTimes(3);
  });

  it('evento sem media_url NAO invalida nenhuma query', async () => {
    const { invalidateSpy } = await renderReady();

    act(() => { onInsert(row({ media_url: null, message_type: 'chat' })); });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('mensagem de outro contato nao invalida nada', async () => {
    const { invalidateSpy } = await renderReady();

    act(() => { onInsert(row({ contact_id: 'outro-contato', media_url: 'https://x/a.jpg' })); });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

// #144 / OTH-002: a exclusão remota (UPDATE is_deleted / DELETE) não pode deixar chips e badge
// com o número antigo. Antes, só o INSERT invalidava; UPDATE e DELETE ficavam de fora.
describe('useMessages — exclusão remota atualiza os agregados (OTH-002)', () => {
  it('UPDATE que apaga mídia (is_deleted = true) invalida galeria, badge e chips', async () => {
    const { invalidateSpy } = await renderReady();

    act(() => {
      onUpdate(
        row({ media_url: 'https://x/a.jpg', is_deleted: false } as Partial<MessageRow>),
        row({ media_url: 'https://x/a.jpg', is_deleted: true } as Partial<MessageRow>),
      );
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: contactMediaKey(CONTACT) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: conversationTabCountsKey(CONTACT) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: contactMediaCountsKey(CONTACT) });
  });

  it('UPDATE sem mídia NAO invalida os agregados da aba Arquivos', async () => {
    const { invalidateSpy } = await renderReady();

    act(() => {
      onUpdate(
        row({ media_url: null, message_type: 'chat', content: 'oi' }),
        row({ media_url: null, message_type: 'chat', content: 'oi, tudo bem?' }),
      );
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  // #144/OTH-002 (recusa): um UPDATE que só muda status/ack de uma mensagem COM mídia NÃO altera
  // o universo contado. Antes o handler invalidava só por `old || new` ter mídia, gerando refetch
  // em rajada a cada ack; agora compara os DOIS lados de `is_deleted`/`media_url`.
  it('UPDATE só de status/ack numa mensagem COM mídia NAO invalida os agregados', async () => {
    const { invalidateSpy } = await renderReady();

    act(() => {
      onUpdate(
        row({ media_url: 'https://x/a.jpg', is_deleted: false, status: 'sent' }),
        row({ media_url: 'https://x/a.jpg', is_deleted: false, status: 'read' }),
      );
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  // Fallback sem REPLICA IDENTITY FULL: `old` traz só a PK (sem as colunas), então não há como
  // comparar — invalida conservadoramente quando a linha nova tem mídia, para não perder o agregado.
  it('UPDATE sem as colunas em old (sem REPLICA IDENTITY FULL) invalida se a linha nova tem mídia', async () => {
    const { invalidateSpy } = await renderReady();

    act(() => {
      onUpdate(
        { id: 'msg-1' } as MessageRow,
        row({ media_url: 'https://x/a.jpg', is_deleted: false }),
      );
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: contactMediaKey(CONTACT) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: conversationTabCountsKey(CONTACT) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: contactMediaCountsKey(CONTACT) });
  });

  it('DELETE remoto de mídia invalida galeria, badge e chips', async () => {
    const { invalidateSpy } = await renderReady();

    act(() => { onDelete(row({ media_url: 'https://x/a.jpg' })); });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: contactMediaKey(CONTACT) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: conversationTabCountsKey(CONTACT) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: contactMediaCountsKey(CONTACT) });
  });

  it('DELETE remoto sem mídia NAO invalida os agregados da aba Arquivos', async () => {
    const { invalidateSpy } = await renderReady();

    act(() => { onDelete(row({ media_url: null, message_type: 'chat' })); });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
