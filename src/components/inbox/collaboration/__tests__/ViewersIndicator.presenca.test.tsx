/**
 * L9 (auditoria de paridade V2 x V3): o `ViewersIndicator` usava
 * `subscribe(async ...)` com `await` solto da consulta de perfil e do `track`
 * — uma falha de rede em abrir a conversa virava rejeição não tratada e sumia;
 * e o cleanup chamava só `removeChannel`, sem encerrar a inscrição antes.
 * Estes testes travam os dois comportamentos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';

interface FakeChannel {
  on: () => FakeChannel;
  presenceState: () => Record<string, unknown>;
  subscribe: (cb: (status: string) => void) => FakeChannel;
  track: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
  _cb: (status: string) => void;
}

type MaybeSingle = () => Promise<{ data: unknown; error: unknown }>;

const h = vi.hoisted(() => ({
  channel: {} as unknown,
  warn: vi.fn(),
  calls: [] as string[],
  maybeSingle: null as unknown,
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ warn: h.warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: () => h.channel,
    removeChannel: () => {
      h.calls.push('removeChannel');
      return Promise.resolve('ok');
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => (h.maybeSingle as MaybeSingle)() }),
      }),
    }),
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}));

import { useConversationViewers } from '../ViewersIndicator';

function makeChannel(): FakeChannel {
  const channel: FakeChannel = {
    on: () => channel,
    presenceState: () => ({}),
    subscribe: (cb: (status: string) => void) => {
      channel._cb = cb;
      return channel;
    },
    track: vi.fn(() => Promise.resolve('ok')),
    unsubscribe: vi.fn(() => {
      h.calls.push('unsubscribe');
    }),
    _cb: (_status: string) => {},
  };
  return channel;
}

beforeEach(() => {
  h.calls = [];
  h.warn.mockReset();
  h.channel = makeChannel();
  h.maybeSingle = () => Promise.resolve({ data: null, error: null });
  cleanup();
});

describe('ViewersIndicator — presença (L9)', () => {
  it('falha ao buscar o perfil não vira rejeição solta e não registra presença', async () => {
    h.maybeSingle = () => Promise.reject(new Error('rede fora'));
    const channel = h.channel as FakeChannel;

    renderHook(() => useConversationViewers('c1'));

    await act(async () => {
      channel._cb('SUBSCRIBED');
    });

    await waitFor(() => expect(h.warn).toHaveBeenCalled());
    expect(channel.track).not.toHaveBeenCalled();
  });

  it('registra a presença (track) quando o perfil do agente responde', async () => {
    h.maybeSingle = () => Promise.resolve({ data: { name: 'Ana Lima', avatar_url: null }, error: null });
    const channel = h.channel as FakeChannel;

    renderHook(() => useConversationViewers('c1'));

    await act(async () => {
      channel._cb('SUBSCRIBED');
    });

    await waitFor(() =>
      expect(channel.track).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Ana Lima', is_typing: false })
      )
    );
  });

  it('no cleanup, encerra a inscrição antes de remover o canal', async () => {
    const channel = h.channel as FakeChannel;
    const { unmount } = renderHook(() => useConversationViewers('c1'));

    await act(async () => {
      channel._cb('SUBSCRIBED');
    });

    unmount();

    expect(channel.unsubscribe).toHaveBeenCalled();
    expect(h.calls).toEqual(['unsubscribe', 'removeChannel']);
  });
});
