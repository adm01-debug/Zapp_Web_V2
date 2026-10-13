/**
 * PD-68/PD-69/PD-70 — "Canais de digitação, presença e visualização ainda eram públicos".
 *
 * Defeito: os quatro canais de colaboração (digitação do contato, digitação da equipe,
 * presença da equipe, "quem está visualizando") eram criados sem
 * `config: { private: true }`. Sem o flag, a Realtime NÃO consulta a RLS de
 * `realtime.messages`: qualquer pessoa com a anon key entrava no canal e lia/forjava a
 * presença (o `contact_typing` inclusive). A migration
 * `20261013210002_realtime_canais_privados.sql` criou a policy
 * `can_access_realtime_topic`; o front precisa MARCAR cada canal como privado para ela
 * valer.
 *
 * Como o defeito é provado: cada hook montado pede UM canal ao provedor; guardamos a
 * chamada inteira (tópico + opções) e conferimos que `config.private === true` e que o
 * tópico continua sendo o que a policy do banco conhece. Também injetamos o status que o
 * provedor devolve quando a policy NEGA (`CHANNEL_ERROR`) para provar que a tela não quebra.
 */
import { StrictMode, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, render } from '@testing-library/react';

interface ChannelOptions {
  config?: { private?: boolean; presence?: { key?: string } };
}
type SubscribeCb = (status: string) => void;

interface FakeChannel {
  name: string;
  opts: ChannelOptions;
  subscribeCallbacks: SubscribeCb[];
  presenceState: () => Record<string, unknown[]>;
  on: (type: string, filter: { event: string }, cb: (arg: unknown) => void) => FakeChannel;
  subscribe: (cb?: SubscribeCb) => FakeChannel;
  track: (payload: unknown) => Promise<string>;
  unsubscribe: () => void;
  send: (msg: unknown) => Promise<string>;
  emitSync: () => void;
}

const h = vi.hoisted(() => ({
  channels: [] as FakeChannel[],
  subscribeStatus: 'SUBSCRIBED' as string,
  removeChannel: vi.fn(async (_channel: unknown) => 'ok'),
}));

vi.mock('@/integrations/supabase/client', () => {
  const makeChannel = (name: string, opts: ChannelOptions): FakeChannel => {
    const handlers: Record<string, (arg: unknown) => void> = {};
    const ch: FakeChannel = {
      name,
      opts,
      subscribeCallbacks: [],
      presenceState: () => ({}),
      on: (type, filter, cb) => {
        handlers[`${type}:${filter.event}`] = cb;
        return ch;
      },
      subscribe: (cb) => {
        if (cb) ch.subscribeCallbacks.push(cb);
        // O provedor responde de forma SÍNCRONA (como o realtime-js quando já há socket).
        cb?.(h.subscribeStatus);
        return ch;
      },
      track: async () => 'ok',
      unsubscribe: () => {},
      send: async () => 'ok',
      emitSync: () => { handlers['presence:sync']?.({}); },
    };
    h.channels.push(ch);
    return ch;
  };
  return {
    supabase: {
      channel: makeChannel,
      removeChannel: (channel: unknown) => h.removeChannel(channel),
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
      }),
    },
  };
});

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'agente-ana' } }),
}));

import { useTypingPresence } from '@/hooks/chat/useTypingPresence';
import { useTeamTyping } from '@/hooks/team-chat/useTeamTyping';
import { useTeamPresence } from '@/hooks/team-chat/useTeamPresence';
import { useConversationViewers, ViewersIndicator } from '@/components/inbox/collaboration/ViewersIndicator';

/** monta os QUATRO canais de colaboração numa mesma renderização */
const montarOsQuatro = () => {
  const typing = renderHook(() => useTypingPresence({ conversationId: 'contato-1', currentUserId: 'agente-ana' }));
  const teamTyping = renderHook(() => useTeamTyping('equipe-1', 'agente-ana', 'Ana'));
  const teamPresence = renderHook(() => useTeamPresence('equipe-1', 'agente-ana', 'Ana'));
  const viewers = renderHook(() => useConversationViewers('contato-1'));
  return { typing, teamTyping, teamPresence, viewers };
};

describe('canais de digitação/presença/visualização são PRIVADOS (PD-68/69/70)', () => {
  beforeEach(() => {
    h.channels.length = 0;
    h.subscribeStatus = 'SUBSCRIBED';
    h.removeChannel.mockClear();
    vi.clearAllMocks();
  });

  it('os quatro canais pedem config.private = true (senão a policy do banco não é consultada)', () => {
    const { typing, teamTyping, teamPresence, viewers } = montarOsQuatro();

    expect(h.channels).toHaveLength(4);
    for (const canal of h.channels) {
      expect(canal.opts?.config?.private).toBe(true);
    }

    typing.unmount();
    teamTyping.unmount();
    teamPresence.unmount();
    viewers.unmount();
  });

  it('mantém os tópicos que a migration do banco conhece (nada de tópico novo sem policy)', () => {
    const { typing, teamTyping, teamPresence, viewers } = montarOsQuatro();

    expect(h.channels.map(c => c.name)).toEqual([
      'typing:contato-1',
      'team-typing-equipe-1',
      'team-presence-equipe-1',
      'conversation:contato-1',
    ]);

    typing.unmount();
    teamTyping.unmount();
    teamPresence.unmount();
    viewers.unmount();
  });

  it('a presença do "visualizando" continua identificada pelo usuário logado', () => {
    const viewers = renderHook(() => useConversationViewers('contato-1'));

    expect(h.channels[0].opts.config?.presence?.key).toBe('agente-ana');

    viewers.unmount();
  });

  it('autorização negada (CHANNEL_ERROR) não quebra a tela: hooks voltam vazios', () => {
    h.subscribeStatus = 'CHANNEL_ERROR';

    const { typing, teamTyping, teamPresence, viewers } = montarOsQuatro();

    // nenhum lançou: os estados ficam neutros e a conversa segue utilizável
    expect(typing.result.current.isContactTyping).toBe(false);
    expect(typing.result.current.typingUsers).toEqual([]);
    expect(teamTyping.result.current.typingLabel).toBeNull();
    expect(teamPresence.result.current.onlineUsers).toEqual([]);
    expect(viewers.result.current).toEqual([]);

    typing.unmount();
    teamTyping.unmount();
    teamPresence.unmount();
    viewers.unmount();
  });

  it('autorização negada não derruba o indicador de visualização (renderiza vazio)', () => {
    h.subscribeStatus = 'CHANNEL_ERROR';

    const { container } = render(
      <StrictMode>
        <ViewersIndicator contactId="contato-1" />
      </StrictMode>,
    );

    expect(container.textContent).toBe('');
  });

  it('StrictMode: montagem dupla cria o canal privado e limpa sem estourar', () => {
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const { unmount } = renderHook(
      () => useConversationViewers('contato-1'),
      { wrapper },
    );

    expect(h.channels.length).toBeGreaterThan(0);
    expect(h.channels[0].opts.config?.private).toBe(true);

    unmount();
    expect(h.removeChannel).toHaveBeenCalled();

    act(() => { /* nada pendente */ });
  });
});
