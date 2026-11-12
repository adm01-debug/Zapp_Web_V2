/**
 * Console de produção (12/11/2026): `[WARN] Typing presence channel not subscribed: CLOSED`
 * dez vezes em dez segundos, sempre com a pilha `unsubscribe`/`removeChannel` do
 * PRÓPRIO desmonte do `ChatPanel`.
 *
 * Duas causas, as duas provadas aqui:
 *  1. O Supabase Realtime chama o callback do `subscribe` com `CLOSED` quando o
 *     cliente sai do canal (`unsubscribe` e de novo no `removeChannel`). O hook
 *     tratava isso como falha e avisava — 2 avisos por troca de conversa.
 *  2. O `ChatPanel` abria o canal com a chave provisória (identidade ainda
 *     carregando) e o reabria quando a identidade chegava: um par abrir/fechar
 *     extra por conversa. Agora `enabled: false` adia o canal.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

interface FakeChannel {
  name: string;
  opts: { config: { presence: { key: string } } };
  emitStatus: (status: string) => void;
  unsubscribe: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => ({
  channels: [] as FakeChannel[],
  warn: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: (name: string, opts: FakeChannel['opts']) => {
      const handlers: Array<(status: string) => void> = [];
      const channel = {
        name,
        opts,
        presenceState: () => ({}),
        on: () => channel,
        subscribe: (cb?: (status: string) => void) => {
          if (cb) handlers.push(cb);
          return channel;
        },
        track: vi.fn(async () => 'ok'),
        untrack: vi.fn(async () => 'ok'),
        emitStatus: (status: string) => handlers.forEach((cb) => cb(status)),
        // Como o provedor real: sair do canal avisa `CLOSED` ao callback do subscribe.
        unsubscribe: vi.fn(() => channel.emitStatus('CLOSED')),
      };
      mocks.channels.push(channel as unknown as FakeChannel);
      return channel;
    },
    removeChannel: vi.fn((channel: FakeChannel) => channel.emitStatus('CLOSED')),
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: mocks.warn, error: vi.fn() },
  getLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

import { useTypingPresence } from '@/hooks/chat/useTypingPresence';

describe('useTypingPresence — desmonte e abertura adiada', () => {
  beforeEach(() => {
    mocks.channels.length = 0;
    vi.clearAllMocks();
  });

  it('o CLOSED gerado pelo próprio desmonte não vira aviso', () => {
    const { unmount } = renderHook(() =>
      useTypingPresence({ conversationId: 'conv-1', currentUserId: 'agente-ana', currentUserName: 'Ana' }),
    );
    mocks.channels[0].emitStatus('SUBSCRIBED');

    unmount();

    expect(mocks.channels[0].unsubscribe).toHaveBeenCalled();
    expect(mocks.warn).not.toHaveBeenCalled();
  });

  it('trocar de conversa derruba o canal antigo sem aviso', () => {
    const { rerender } = renderHook(
      ({ id }) => useTypingPresence({ conversationId: id, currentUserId: 'agente-ana' }),
      { initialProps: { id: 'conv-1' } },
    );
    mocks.channels[0].emitStatus('SUBSCRIBED');

    rerender({ id: 'conv-2' });

    expect(mocks.channels).toHaveLength(2);
    expect(mocks.warn).not.toHaveBeenCalled();
  });

  it('CLOSED/erro com o canal ainda em uso continua avisando (queda real)', () => {
    const { unmount } = renderHook(() =>
      useTypingPresence({ conversationId: 'conv-1', currentUserId: 'agente-ana' }),
    );
    mocks.channels[0].emitStatus('SUBSCRIBED');
    mocks.channels[0].emitStatus('CHANNEL_ERROR');

    expect(mocks.warn).toHaveBeenCalledTimes(1);
    expect(mocks.warn).toHaveBeenCalledWith('Typing presence channel not subscribed:', 'CHANNEL_ERROR');
    unmount();
    expect(mocks.warn).toHaveBeenCalledTimes(1);
  });

  it('enabled=false não abre canal; ao habilitar abre UM, já com a identidade real', () => {
    const { rerender, unmount } = renderHook(
      ({ enabled, userId }: { enabled: boolean; userId?: string }) =>
        useTypingPresence({ conversationId: 'conv-1', currentUserId: userId, enabled }),
      { initialProps: { enabled: false, userId: undefined as string | undefined } },
    );
    expect(mocks.channels).toHaveLength(0);

    rerender({ enabled: true, userId: 'agente-ana' });

    expect(mocks.channels).toHaveLength(1);
    expect(mocks.channels[0].opts.config.presence.key.startsWith('agente-ana#')).toBe(true);
    unmount();
  });
});
