/**
 * HZ3-008 — `useTypingPresence` publicava presença antes de o canal assinar.
 *
 * Defeito (código anterior a este cartão): `setTyping` chamava `track` sem olhar o
 * estado da assinatura. O provedor (Supabase Realtime) DESCARTA o `track` enviado
 * antes do `SUBSCRIBED` — e o erro é silencioso: o primeiro "digitando" de quem
 * acabou de abrir o painel sumia sem deixar rastro. No desmontar, o canal era
 * derrubado sem `untrack`, então quem já tinha avisado "digitando" e fechava a aba
 * deixava o colega vendo o aviso até o servidor expirar a presença.
 *
 * Como é provado: o canal mockado NÃO assina sozinho — o teste decide quando o
 * `SUBSCRIBED` (ou um `CHANNEL_ERROR`) chega, e observa `track`/`untrack`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

interface FakeChannel {
  name: string;
  opts: { config: { presence: { key: string } } };
  presenceState: () => Record<string, unknown>;
  on: (type: string, filter: { event: string }, cb: (arg: unknown) => void) => FakeChannel;
  subscribe: (cb?: (status: string) => void) => FakeChannel;
  track: ReturnType<typeof vi.fn>;
  untrack: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
  emitStatus: (status: string) => void;
}

const mocks = vi.hoisted(() => ({ channels: [] as FakeChannel[] }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: (name: string, opts: FakeChannel['opts']): FakeChannel => {
      const statusHandlers: Array<(status: string) => void> = [];
      const channel = {
        name,
        opts,
        presenceState: () => ({}),
        on: () => channel,
        // O provedor leva um tempo para assinar; aqui o teste manda no momento.
        subscribe: (cb?: (status: string) => void) => {
          if (cb) statusHandlers.push(cb);
          return channel;
        },
        track: vi.fn(async () => 'ok'),
        untrack: vi.fn(async () => 'ok'),
        unsubscribe: vi.fn(),
        emitStatus: (status: string) => statusHandlers.forEach((cb) => cb(status)),
      };
      mocks.channels.push(channel as unknown as FakeChannel);
      return channel as unknown as FakeChannel;
    },
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { useTypingPresence } from '@/hooks/chat/useTypingPresence';

describe('useTypingPresence — assinatura do canal (HZ3-008)', () => {
  beforeEach(() => {
    mocks.channels.length = 0;
    vi.clearAllMocks();
  });

  it('guarda o "digitando" pedido antes do SUBSCRIBED e o envia ao assinar', async () => {
    const { result, unmount } = renderHook(() =>
      useTypingPresence({
        conversationId: 'conv-1',
        currentUserId: 'agente-ana',
        currentUserName: 'Ana',
      }),
    );
    const canal = mocks.channels[0];

    await act(async () => {
      await result.current.handleTypingStart();
    });

    // Ainda não assinado: o provedor descartaria o pacote — nada de `track`.
    expect(canal.track).not.toHaveBeenCalled();

    await act(async () => {
      canal.emitStatus('SUBSCRIBED');
    });

    expect(canal.track).toHaveBeenCalledTimes(1);
    expect(canal.track.mock.calls[0][0]).toMatchObject({ oderId: 'agente-ana', isTyping: true });

    unmount();
  });

  it('sai da presença no desmontar enquanto avisa "digitando" (untrack antes de derrubar o canal)', async () => {
    const { result, unmount } = renderHook(() =>
      useTypingPresence({ conversationId: 'conv-2', currentUserId: 'agente-ana' }),
    );
    const canal = mocks.channels[0];

    await act(async () => {
      canal.emitStatus('SUBSCRIBED');
    });

    await act(async () => {
      await result.current.handleTypingStart();
    });

    expect(canal.track).toHaveBeenCalledTimes(1);
    expect(canal.untrack).not.toHaveBeenCalled();

    unmount();

    expect(canal.untrack).toHaveBeenCalledTimes(1);
  });

  it('canal com erro não publica presença e mantém o pedido guardado', async () => {
    const { result, unmount } = renderHook(() =>
      useTypingPresence({ conversationId: 'conv-3', currentUserId: 'agente-ana' }),
    );
    const canal = mocks.channels[0];

    await act(async () => {
      canal.emitStatus('CHANNEL_ERROR');
    });

    await act(async () => {
      await result.current.handleTypingStart();
    });

    expect(canal.track).not.toHaveBeenCalled();

    unmount();
  });
});
