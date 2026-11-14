/**
 * Regressão apontada pela revisão (Devin + Codex) na PR que ligou o
 * ViewersIndicator ao is_typing real: `supabase.channel(topic)` devolve o MESMO
 * objeto de canal para o mesmo tópico (RealtimeClient.channel, real,
 * `@supabase/supabase-js`), e chamar `.on('presence', ...)` num canal que já
 * assinou lança `cannot add 'presence' callbacks ... after subscribe()`
 * (RealtimeChannel.on, real). A primeira versão do fix abria um SEGUNDO
 * `supabase.channel('typing:'+contactId)` dentro do ViewersIndicator — o mesmo
 * tópico que o `useTypingPresence` do campo de mensagem já assina quando os
 * detalhes do contato são abertos com o chat aberto (caso comum). Isso
 * quebrava com exceção, e o cleanup do ViewersIndicator ainda derrubava o
 * canal que o chat continuava usando.
 *
 * Este teste reproduz o cenário com um canal fake FIEL ao comportamento real
 * (singleton por tópico + `.on()` lança depois de `subscribe()`), prova que o
 * código antigo quebraria, e que o código atual (store compartilhado) não.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

interface FakeChannel {
  topic: string;
  subscribed: boolean;
  presenceState: () => Record<string, unknown>;
  _state: Record<string, unknown>;
  _syncHandlers: Array<() => void>;
  on: (type: string, filter: { event: string }, cb: (arg?: unknown) => void) => FakeChannel;
  subscribe: (cb?: (status: string) => void) => FakeChannel;
  track: ReturnType<typeof vi.fn>;
  untrack: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => ({
  registry: new Map<string, FakeChannel>(),
}));

function makeFakeChannel(topic: string): FakeChannel {
  const statusHandlers: Array<(status: string) => void> = [];
  const channel: FakeChannel = {
    topic,
    subscribed: false,
    _state: {},
    _syncHandlers: [],
    presenceState: () => channel._state,
    on: (type, filter) => {
      // Fiel ao RealtimeChannel.on real: lança se já assinado e for presence/postgres_changes.
      if (channel.subscribed && type === 'presence') {
        throw new Error(`cannot add \`presence\` callbacks for ${topic} after \`subscribe()\`.`);
      }
      if (type === 'presence' && filter.event === 'sync') channel._syncHandlers.push(() => {});
      return channel;
    },
    subscribe: (cb) => {
      if (cb) statusHandlers.push(cb);
      return channel;
    },
    track: vi.fn(async () => 'ok'),
    untrack: vi.fn(async () => 'ok'),
    unsubscribe: vi.fn(),
  };
  // Expondo um jeito de simular o SUBSCRIBED real (seta o estado e dispara os handlers).
  (channel as unknown as { __emit: (s: string) => void }).__emit = (status: string) => {
    if (status === 'SUBSCRIBED') channel.subscribed = true;
    statusHandlers.forEach((cb) => cb(status));
  };
  return channel;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    // Fiel ao RealtimeClient.channel real: MESMO tópico devolve o MESMO objeto,
    // ignorando os params da segunda chamada — é exatamente essa linha que faz
    // `typing:${contactId}` aberto duas vezes colidir.
    channel: (topic: string) => {
      const existing = mocks.registry.get(topic);
      if (existing) return existing;
      const fresh = makeFakeChannel(topic);
      mocks.registry.set(topic, fresh);
      return fresh;
    },
    removeChannel: (ch: FakeChannel) => {
      mocks.registry.delete(ch.topic);
      return Promise.resolve('ok');
    },
    getChannels: () => [...mocks.registry.values()],
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  getLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));

import { useTypingPresence } from '@/hooks/chat/useTypingPresence';
import { useConversationViewers } from '@/components/inbox/collaboration/ViewersIndicator';

beforeEach(() => {
  mocks.registry.clear();
});

describe('ViewersIndicator + useTypingPresence no mesmo contactId (regressão da revisão)', () => {
  it('useConversationViewers NÃO abre um segundo canal no mesmo tópico do ChatPanel', async () => {
    // ChatPanel/useTypingPresence abre e assina primeiro (ordem real: o chat já
    // está aberto quando o usuário abre os detalhes do contato).
    const { result: typingResult } = renderHook(() =>
      useTypingPresence({ conversationId: 'contato-1', currentUserId: 'colega-ana', currentUserName: 'Ana' })
    );
    const typingChannel = mocks.registry.get('typing:contato-1')!;
    expect(typingChannel).toBeDefined();
    await act(async () => { (typingChannel as unknown as { __emit: (s: string) => void }).__emit('SUBSCRIBED'); });
    expect(typingChannel.subscribed).toBe(true);

    // Agora o usuário abre os detalhes do contato: ViewersIndicator monta para
    // o MESMO contactId. Com o bug, isto chamaria `.on('presence', ...)` no
    // MESMO canal (já assinado) e lançaria — o teste não teria chegado aqui.
    expect(() => {
      renderHook(() => useConversationViewers('contato-1'));
    }).not.toThrow();

    expect(typingResult.current).toBeDefined();
  });

  it('ao fechar os detalhes, o chat continua recebendo "digitando" (canal não é derrubado por quem só lê)', async () => {
    const { result: typingResult } = renderHook(() =>
      useTypingPresence({ conversationId: 'contato-2', currentUserId: 'colega-ana', currentUserName: 'Ana' })
    );
    const typingChannel = mocks.registry.get('typing:contato-2')!;
    await act(async () => { (typingChannel as unknown as { __emit: (s: string) => void }).__emit('SUBSCRIBED'); });

    const { unmount: unmountViewers } = renderHook(() => useConversationViewers('contato-2'));
    unmountViewers(); // fecha os detalhes do contato

    // Canal de digitação do chat segue de pé: não foi removido do registro
    // nem chamado unsubscribe por quem só lia (ViewersIndicator).
    expect(mocks.registry.has('typing:contato-2')).toBe(true);
    expect(typingChannel.unsubscribe).not.toHaveBeenCalled();
    expect(typingResult.current).toBeDefined();
  });
});
