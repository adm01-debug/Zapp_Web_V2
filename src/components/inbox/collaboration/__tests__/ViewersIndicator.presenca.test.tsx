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
  on: (event: string, filter: { event: string }, cb: () => void) => FakeChannel;
  presenceState: () => Record<string, unknown>;
  subscribe: (cb?: (status: string) => void) => FakeChannel;
  track: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
  _cb: (status: string) => void;
  _state: Record<string, unknown>;
  _syncHandlers: Array<() => void>;
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
  createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withCorrelation: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })) })),
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
// Real (não mockado): é o mesmo store que o useTypingPresence publica em
// produção — exercitar via ele, não via um segundo canal fake, é o que prova
// que o ViewersIndicator não abre uma segunda inscrição no mesmo tópico.
import { publishTypingByUser } from '@/hooks/chat/typingPresenceStore';

function makeChannel(): FakeChannel {
  const channel: FakeChannel = {
    on: (_event, filter, cb) => {
      if (filter.event === 'sync') channel._syncHandlers.push(cb);
      return channel;
    },
    presenceState: () => channel._state,
    subscribe: (cb) => {
      if (cb) channel._cb = cb;
      return channel;
    },
    track: vi.fn(() => Promise.resolve('ok')),
    unsubscribe: vi.fn(() => {
      h.calls.push('unsubscribe');
    }),
    _cb: (_status: string) => {},
    _state: {},
    _syncHandlers: [],
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
    // Só o canal da própria conversa: não há segundo canal `typing:${id}` —
    // ler o is_typing real do `typingPresenceStore` não abre nem fecha canal.
    expect(h.calls).toEqual(['unsubscribe', 'removeChannel']);
  });

  it('acende is_typing quando o typingPresenceStore publica o colega digitando', async () => {
    // Prova do bug: a presença do canal da conversa (`channel`) sempre chega
    // com is_typing:false (é o que o track acima só manda); sem ler o que o
    // `useTypingPresence` publica no store (mesmo id desta conversa) o aviso
    // "Digitando..." nunca liga.
    h.maybeSingle = () => Promise.resolve({ data: { name: 'Eu', avatar_url: null }, error: null });
    const channel = h.channel as FakeChannel;

    const { result } = renderHook(() => useConversationViewers('c1'));

    await act(async () => {
      channel._cb('SUBSCRIBED');
    });

    channel._state = { ana: [{ name: 'Ana', is_typing: false }] };
    act(() => { channel._syncHandlers.forEach((cb) => cb()); });

    expect(result.current).toEqual([
      expect.objectContaining({ id: 'ana', is_typing: false }),
    ]);

    // Ana começa a digitar: useTypingPresence (dono real da inscrição em
    // `typing:c1`) publica isTyping:true para o id dela no store compartilhado.
    act(() => { publishTypingByUser('c1', { ana: true }); });

    expect(result.current).toEqual([
      expect.objectContaining({ id: 'ana', is_typing: true }),
    ]);
  });
});
