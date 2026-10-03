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

function onInsert(payloadRow: MessageRow) {
  const config = h.realtime.config as { onInsert: (payload: unknown) => void };
  config.onInsert({
    eventType: 'INSERT',
    new: payloadRow,
    old: {},
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

beforeEach(() => {
  vi.clearAllMocks();
  h.realtime.config = null;
  h.fetchMessages.mockResolvedValue({ data: [], error: null });
  h.fetchMessagesBefore.mockResolvedValue({ data: [], error: null });
});

describe('useMessages — atualização ao vivo da aba Arquivos (etapa 45)', () => {
  it('evento realtime COM media_url invalida a galeria, o badge da aba e os chips', async () => {
    const { invalidateSpy } = render();
    await waitFor(() => expect(h.realtime.config).not.toBeNull());
    await waitFor(() => expect(h.fetchMessages).toHaveBeenCalled());

    act(() => { onInsert(row({ media_url: 'https://x/a.jpg' })); });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: contactMediaKey(CONTACT) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: conversationTabCountsKey(CONTACT) });
    // etapa 42: os chips contam por tipo; sem invalidar, chip e badge divergem
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: contactMediaCountsKey(CONTACT) });
    expect(invalidateSpy).toHaveBeenCalledTimes(3);
  });

  it('evento sem media_url NAO invalida nenhuma query', async () => {
    const { invalidateSpy } = render();
    await waitFor(() => expect(h.realtime.config).not.toBeNull());
    await waitFor(() => expect(h.fetchMessages).toHaveBeenCalled());

    act(() => { onInsert(row({ media_url: null, message_type: 'chat' })); });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('mensagem de outro contato nao invalida nada', async () => {
    const { invalidateSpy } = render();
    await waitFor(() => expect(h.realtime.config).not.toBeNull());

    act(() => { onInsert(row({ contact_id: 'outro-contato', media_url: 'https://x/a.jpg' })); });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
