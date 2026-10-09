/**
 * R2-INB-026 — "Presença de digitação entre agentes colide na identidade literal agent".
 *
 * Defeito (código anterior a este cartão): `ChatPanel` passava `currentUserId: 'agent'`
 * para TODOS os agentes, e `useTypingPresence` usava esse valor literal como CHAVE do
 * canal de presença e como critério de exclusão ("toda presença cuja chave é igual a
 * currentUserId"). Dois agentes no mesmo contato caíam na MESMA chave, então cada
 * cliente descartava o grupo inteiro — inclusive o colega — e o aviso de "colega
 * digitando" nunca aparecia. Além disso, presença de agente ligava `isContactTyping`,
 * o que fazia o aviso ser atribuído ao CONTATO.
 *
 * Como o defeito é provado: cada hook montado cria UM canal real (mockado) e podemos
 * ler a chave de presença pedida ao provedor e injetar o estado de presença de outro
 * cliente, exatamente o que o `sync` do provedor entrega em produção.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

type PresenceEntry = { oderId?: string; name?: string; isTyping?: boolean; lastTyped?: string };
type PresenceStateMap = Record<string, PresenceEntry[]>;
interface ChannelOptions { config: { presence: { key: string } } }

interface FakeChannel {
  name: string;
  opts: ChannelOptions;
  presenceState: () => PresenceStateMap;
  on: (type: string, filter: { event: string }, cb: (arg: unknown) => void) => FakeChannel;
  subscribe: (cb?: (status: string) => void) => FakeChannel;
  track: (payload: unknown) => Promise<string>;
  untrack: () => Promise<string>;
  unsubscribe: () => void;
  send: () => void;
  emitSync: () => void;
  emitBroadcast: (event: string, payload: unknown) => void;
}

const mocks = vi.hoisted(() => ({ channels: [] as FakeChannel[] }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: (name: string, opts: ChannelOptions): FakeChannel => {
      const handlers: Record<string, (arg: unknown) => void> = {};
      const channel: FakeChannel = {
        name,
        opts,
        presenceState: () => ({}),
        on: (type, filter, cb) => {
          handlers[`${type}:${filter.event}`] = cb;
          return channel;
        },
        subscribe: (cb) => {
          cb?.('SUBSCRIBED');
          return channel;
        },
        track: async () => 'ok',
        untrack: async () => 'ok',
        unsubscribe: () => {},
        send: () => {},
        /** dispara o handler de `presence:sync` como o provedor faz */
        emitSync: () => { handlers['presence:sync']?.({}); },
        emitBroadcast: (event, payload) => { handlers[`broadcast:${event}`]?.({ payload }); },
      };
      mocks.channels.push(channel);
      return channel;
    },
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { useTypingPresence } from '@/hooks/chat/useTypingPresence';

/** chave de presença que o hook pediu ao provedor neste cliente */
const presenceKeyOf = (index: number) => mocks.channels[index].opts.config.presence.key;

describe('useTypingPresence — identidade de presença entre agentes (R2-INB-026)', () => {
  beforeEach(() => {
    mocks.channels.length = 0;
    vi.clearAllMocks();
  });

  it('dois agentes no mesmo contato nunca compartilham a mesma chave de presença', () => {
    // Cenário do defeito: o chamador repassa a identidade literal 'agent' para todos.
    const ana = renderHook(() => useTypingPresence({
      conversationId: 'conv-1', currentUserId: 'agent', currentUserName: 'Ana',
    }));
    const bruno = renderHook(() => useTypingPresence({
      conversationId: 'conv-1', currentUserId: 'agent', currentUserName: 'Bruno',
    }));

    expect(presenceKeyOf(0)).not.toBe('agent');
    expect(presenceKeyOf(0)).not.toBe(presenceKeyOf(1));

    ana.unmount();
    bruno.unmount();
  });

  it('sem identidade real, cada cliente recebe chave própria (o literal compartilhado não volta)', () => {
    const clienteA = renderHook(() => useTypingPresence({ conversationId: 'conv-2' }));
    const clienteB = renderHook(() => useTypingPresence({ conversationId: 'conv-2' }));

    expect(presenceKeyOf(0)).not.toBe(presenceKeyOf(1));

    clienteA.unmount();
    clienteB.unmount();
  });

  it('presença de colega produz o nome do colega e NÃO vira digitação do contato', () => {
    const ana = renderHook(() => useTypingPresence({ conversationId: 'conv-3', currentUserId: 'agente-ana' }));
    const canalAna = mocks.channels[0];
    const bruno = renderHook(() => useTypingPresence({ conversationId: 'conv-3', currentUserId: 'agente-bruno' }));

    // O colega digitando chega como presença real do provedor.
    canalAna.presenceState = () => ({
      [presenceKeyOf(1)]: [{ oderId: 'agente-bruno', name: 'Bruno', isTyping: true, lastTyped: '2026-10-06T10:00:00.000Z' }],
    });
    act(() => { canalAna.emitSync(); });

    expect(ana.result.current.typingUsers.map(u => u.name)).toEqual(['Bruno']);
    // Colega digitando é aviso de colega, jamais do contato (usuário final).
    expect(ana.result.current.isContactTyping).toBe(false);

    ana.unmount();
    bruno.unmount();
  });

  it('exclui só a própria presença (de qualquer aba) e não duplica colega em duas abas', () => {
    const aba1 = renderHook(() => useTypingPresence({ conversationId: 'conv-4', currentUserId: 'agente-ana' }));
    const canalAba1 = mocks.channels[0];
    const aba2 = renderHook(() => useTypingPresence({ conversationId: 'conv-4', currentUserId: 'agente-ana' }));
    const canalAba2 = mocks.channels[1];
    const colega = renderHook(() => useTypingPresence({ conversationId: 'conv-4', currentUserId: 'agente-bruno' }));

    // Mesmo agente em duas abas: chaves distintas (uma aba não sobrescreve a outra).
    expect(presenceKeyOf(0)).not.toBe(presenceKeyOf(1));

    canalAba1.presenceState = () => ({
      [canalAba2.opts.config.presence.key]: [{ oderId: 'agente-ana', name: 'Ana', isTyping: true }],
      [presenceKeyOf(2)]: [{ oderId: 'agente-bruno', name: 'Bruno', isTyping: true }],
      [`${presenceKeyOf(2)}-outra-aba`]: [{ oderId: 'agente-bruno', name: 'Bruno', isTyping: true }],
    });
    act(() => { canalAba1.emitSync(); });

    expect(aba1.result.current.typingUsers.map(u => u.name)).toEqual(['Bruno']);

    aba1.unmount();
    aba2.unmount();
    colega.unmount();
  });

  it('guarda de regressão: a digitação do CONTATO continua vindo do broadcast e convive com a do colega', () => {
    const ana = renderHook(() => useTypingPresence({ conversationId: 'conv-5', currentUserId: 'agente-ana' }));
    const canalAna = mocks.channels[0];

    act(() => { canalAna.emitBroadcast('contact_typing', { isTyping: true }); });
    expect(ana.result.current.isContactTyping).toBe(true);
    expect(ana.result.current.typingUsers).toEqual([]);

    // Presença de colega não substitui nem apaga o aviso do contato.
    const bruno = renderHook(() => useTypingPresence({ conversationId: 'conv-5', currentUserId: 'agente-bruno' }));
    canalAna.presenceState = () => ({ [presenceKeyOf(1)]: [{ oderId: 'agente-bruno', name: 'Bruno', isTyping: true }] });
    act(() => { canalAna.emitSync(); });
    expect(ana.result.current.isContactTyping).toBe(true);
    expect(ana.result.current.typingUsers.map(u => u.name)).toEqual(['Bruno']);

    // O contato parou de digitar e o aviso dele sai de cena.
    act(() => { canalAna.emitBroadcast('contact_typing', { isTyping: false }); });
    expect(ana.result.current.isContactTyping).toBe(false);

    ana.unmount();
    bruno.unmount();
  });
});
