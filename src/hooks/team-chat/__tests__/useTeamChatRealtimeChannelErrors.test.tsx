import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * E91 — os canais Realtime do Team Chat não avisavam nada quando caiam: um
 * CHANNEL_ERROR/TIMED_OUT deixava a tela envelhecendo sem rastro no log (só a
 * re-inscrição posterior revalidava). Aqui a fronteira mockada é o cliente
 * Supabase — que captura o callback de `subscribe` de CADA canal — e o logger,
 * cujo `warn` é observado.
 */
const h = vi.hoisted(() => ({
  channels: [] as Array<{ name: string; callbacks: Array<(s: string) => void> }>,
  warn: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({
    warn: (...a: unknown[]) => h.warn(...a),
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'p1' } }),
}));

vi.mock('@/integrations/supabase/client', () => {
  const consulta: Record<string, unknown> = {};
  consulta.select = () => consulta;
  consulta.eq = () => consulta;
  consulta.in = () => consulta;
  consulta.order = () => consulta;
  consulta.limit = () => Promise.resolve({ data: [], error: null });
  return {
    supabase: {
      channel: (name: string) => {
        const entry = { name, callbacks: [] as Array<(s: string) => void> };
        h.channels.push(entry);
        const ch: Record<string, unknown> = {};
        ch.on = () => ch;
        ch.subscribe = (cb?: (s: string) => void) => {
          if (cb) entry.callbacks.push(cb);
          return ch;
        };
        ch.send = () => Promise.resolve();
        ch.track = () => Promise.resolve();
        ch.presenceState = () => ({});
        ch.unsubscribe = () => {};
        return ch;
      },
      removeChannel: vi.fn(),
      from: () => consulta,
      rpc: () => Promise.resolve({ data: [], error: null }),
    },
  };
});

import { useTeamConversations } from '@/hooks/team-chat/useTeamConversations';
import { useTeamMessages } from '@/hooks/team-chat/useTeamMessages';
import { useTeamTyping } from '@/hooks/team-chat/useTeamTyping';
import { useTeamMessageReactions } from '@/hooks/team-chat/useTeamMessageReactions';

function wrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const novoClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

/** Dispara o status em todo canal cujo nome começa pelo prefixo. */
function emit(prefix: string, status: string) {
  const alvos = h.channels.filter(c => c.name.startsWith(prefix));
  expect(alvos.length).toBeGreaterThan(0);
  act(() => {
    for (const c of alvos) for (const cb of c.callbacks) cb(status);
  });
}

beforeEach(() => {
  h.channels = [];
  h.warn.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('canais Realtime do Team Chat — log de CHANNEL_ERROR (E91)', () => {
  it('useTeamConversations loga CHANNEL_ERROR no canal da lista', async () => {
    renderHook(() => useTeamConversations(), { wrapper: wrapper(novoClient()) });
    await waitFor(() => expect(h.channels.some(c => c.name === 'team-chat-updates')).toBe(true));

    emit('team-chat-updates', 'CHANNEL_ERROR');

    expect(h.warn).toHaveBeenCalledWith(
      'team:inbox CHANNEL_ERROR',
      expect.objectContaining({ status: 'CHANNEL_ERROR' }),
    );
  });

  it('useTeamMessages loga CHANNEL_ERROR no canal da conversa', async () => {
    renderHook(() => useTeamMessages('c1'), { wrapper: wrapper(novoClient()) });
    await waitFor(() => expect(h.channels.some(c => c.name.startsWith('team-messages-c1'))).toBe(true));

    emit('team-messages-c1', 'TIMED_OUT');

    expect(h.warn).toHaveBeenCalledWith(
      'team:messages CHANNEL_ERROR',
      expect.objectContaining({ conversationId: 'c1', status: 'TIMED_OUT' }),
    );
  });

  it('useTeamTyping loga CHANNEL_ERROR no canal de digitacao', async () => {
    renderHook(() => useTeamTyping('c1', 'p1', 'Eu'));
    await waitFor(() => expect(h.channels.some(c => c.name === 'team-typing-c1')).toBe(true));

    emit('team-typing-c1', 'CHANNEL_ERROR');

    expect(h.warn).toHaveBeenCalledWith(
      'team-typing CHANNEL_ERROR',
      expect.objectContaining({ conversationId: 'c1', status: 'CHANNEL_ERROR' }),
    );
  });

  it('useTeamMessageReactions loga CHANNEL_ERROR no canal de reacoes', async () => {
    renderHook(() => useTeamMessageReactions('c1'), { wrapper: wrapper(novoClient()) });
    await waitFor(() => expect(h.channels.some(c => c.name.startsWith('team-reactions-c1'))).toBe(true));

    emit('team-reactions-c1', 'CHANNEL_ERROR');

    expect(h.warn).toHaveBeenCalledWith(
      'team:reactions CHANNEL_ERROR',
      expect.objectContaining({ conversationId: 'c1', status: 'CHANNEL_ERROR' }),
    );
  });

  it('nao loga quando o canal assina com sucesso', async () => {
    renderHook(() => useTeamConversations(), { wrapper: wrapper(novoClient()) });
    await waitFor(() => expect(h.channels.some(c => c.name === 'team-chat-updates')).toBe(true));

    emit('team-chat-updates', 'SUBSCRIBED');

    expect(h.warn).not.toHaveBeenCalled();
  });
});