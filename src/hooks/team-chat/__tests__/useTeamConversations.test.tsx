/**
 * Comportamento de `useTeamConversations` — lista de conversas do chat de equipe (nome/avatar
 * de conversa direta, prévia da última mensagem, não lidas) e a assinatura de Realtime que a
 * mantém viva. A fronteira mockada é o cliente Supabase; o hook é o real.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { auth, handlers, cliente } = vi.hoisted(() => ({
  auth: { profile: null as { id: string; name: string } | null },
  handlers: {
    on: vi.fn(),
    subscribe: vi.fn(),
    removeChannel: vi.fn(),
    from: vi.fn(),
    rpc: vi.fn(),
  },
  cliente: { canal: null as { on: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> } | null },
}));

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ profile: auth.profile }) }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => handlers.from(...args),
    rpc: (...args: unknown[]) => handlers.rpc(...args),
    channel: () => {
      const canal = { on: vi.fn(), subscribe: vi.fn() };
      canal.on.mockReturnValue(canal);
      canal.subscribe.mockReturnValue({ unsubscribe: vi.fn() });
      cliente.canal = canal;
      return canal;
    },
    removeChannel: (...args: unknown[]) => handlers.removeChannel(...args),
  },
}));

import { useTeamConversations } from '../useTeamConversations';

interface Resultado {
  data?: unknown;
  error?: unknown;
}

const registro: { metodo: string; args: unknown[] }[] = [];
const filas = new Map<string, Resultado[]>();
const rpcRespostas = new Map<string, Resultado>();

function enfileirar(tabela: string, ...resultados: Resultado[]) {
  filas.set(tabela, resultados);
}

function builder(resultado: Resultado) {
  const b: Record<string, unknown> = {};
  for (const metodo of ['select', 'eq', 'in', 'order']) {
    b[metodo] = vi.fn((...args: unknown[]) => {
      registro.push({ metodo, args });
      return b;
    });
  }
  b.then = (onFulfilled: (v: Resultado) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(resultado).then(onFulfilled, onRejected);
  return b;
}

const perfilOutro = {
  id: 'p2',
  name: 'Bruno Lima',
  email: 'bruno@exemplo.com',
  avatar_url: 'https://cdn/bruno.png',
  is_active: true,
};

const membroDe = (conversationId: string, profileId: string, profile: unknown = perfilOutro) => ({
  conversation_id: conversationId,
  profile_id: profileId,
  last_read_at: '2026-10-06T10:00:00.000Z',
  is_muted: false,
  is_pinned: false,
  is_archived: false,
  member_role: 'member',
  profile,
});

const conversa = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'c1',
  type: 'direct',
  name: null,
  avatar_url: null,
  updated_at: '2026-10-07T10:00:00.000Z',
  ...over,
});

function render(queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { ...renderHook(() => useTeamConversations(), { wrapper }), queryClient };
}

beforeEach(() => {
  auth.profile = { id: 'p1', name: 'Ana' };
  registro.length = 0;
  filas.clear();
  rpcRespostas.clear();
  handlers.from.mockImplementation((tabela: string) => {
    const fila = filas.get(tabela) ?? [];
    return builder(fila.shift() ?? { data: [], error: null });
  });
  handlers.rpc.mockImplementation((nome: string) => Promise.resolve(rpcRespostas.get(nome) ?? { data: [], error: null }));
  handlers.removeChannel.mockReset();
  vi.clearAllMocks();
});

afterEach(() => {
  cliente.canal = null;
});

describe('lista de conversas', () => {
  it('sem perfil logado não consulta o banco', () => {
    auth.profile = null;
    const { result } = render();
    expect(handlers.from).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  it('sem participação não busca conversa nenhuma', async () => {
    enfileirar('team_conversation_members', { data: [], error: null });
    const { result } = render();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(handlers.from).toHaveBeenCalledTimes(1);
  });

  it('erro ao ler as participações vira erro da consulta', async () => {
    enfileirar('team_conversation_members', { data: null, error: { message: 'permission denied' } });
    const { result } = render();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as { message: string }).message).toBe('permission denied');
  });

  it('erro ao ler as conversas também vira erro (não devolve lista vazia)', async () => {
    enfileirar('team_conversation_members', { data: [membroDe('c1', 'p1')], error: null });
    enfileirar('team_conversations', { data: null, error: { message: 'RLS negou' } });
    const { result } = render();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as { message: string }).message).toBe('RLS negou');
  });

  it('busca as conversas pelos ids das participações, da mais recente para a mais antiga', async () => {
    enfileirar(
      'team_conversation_members',
      { data: [membroDe('c1', 'p1'), membroDe('c2', 'p1')], error: null },
      { data: [membroDe('c1', 'p1'), membroDe('c1', 'p2'), membroDe('c2', 'p1')], error: null },
    );
    enfileirar('team_conversations', { data: [conversa({ id: 'c1' }), conversa({ id: 'c2' })], error: null });

    const { result } = render();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const comIn = registro.filter((r) => r.metodo === 'in' && r.args[0] === 'id');
    expect(comIn[0]?.args[1]).toEqual(['c1', 'c2']);
    const comOrdem = registro.find((r) => r.metodo === 'order');
    expect(comOrdem?.args).toEqual(['updated_at', { ascending: false }]);
    expect(result.current.data).toHaveLength(2);
  });

  it('conversa direta sem nome usa o nome do outro participante e o avatar dele', async () => {
    enfileirar(
      'team_conversation_members',
      { data: [membroDe('c1', 'p1'), membroDe('c1', 'p2')], error: null },
      {
        data: [membroDe('c1', 'p1', { id: 'p1', name: 'Ana', email: 'ana@ex.com', avatar_url: null, is_active: true }), membroDe('c1', 'p2')],
        error: null,
      },
    );
    enfileirar('team_conversations', { data: [conversa()], error: null });

    const { result } = render();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const c = result.current.data?.[0];
    expect(c?.name).toBe('Bruno Lima');
    expect(c?.avatar_url).toBe('https://cdn/bruno.png');
    expect(c?.members).toHaveLength(2);
  });

  it('conversa direta sem o perfil do outro cai em "Chat Direto"', async () => {
    enfileirar(
      'team_conversation_members',
      { data: [membroDe('c1', 'p1')], error: null },
      { data: [membroDe('c1', 'p1', null)], error: null },
    );
    enfileirar('team_conversations', { data: [conversa()], error: null });

    const { result } = render();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].name).toBe('Chat Direto');
    expect(result.current.data?.[0].avatar_url).toBeNull();
  });

  it('conversa de grupo mantém o próprio nome e avatar', async () => {
    enfileirar(
      'team_conversation_members',
      { data: [membroDe('c1', 'p1')], error: null },
      { data: [membroDe('c1', 'p1'), membroDe('c1', 'p2')], error: null },
    );
    enfileirar('team_conversations', {
      data: [conversa({ type: 'group', name: 'Suporte N1', avatar_url: 'https://cdn/grupo.png' })],
      error: null,
    });

    const { result } = render();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const c = result.current.data?.[0];
    expect(c?.type).toBe('group');
    expect(c?.name).toBe('Suporte N1');
    expect(c?.avatar_url).toBe('https://cdn/grupo.png');
  });

  it('monta a prévia da última mensagem e a contagem de não lidas', async () => {
    enfileirar(
      'team_conversation_members',
      { data: [membroDe('c1', 'p1')], error: null },
      { data: [membroDe('c1', 'p1')], error: null },
    );
    enfileirar('team_conversations', { data: [conversa()], error: null });
    rpcRespostas.set('get_team_conversation_previews', {
      data: [
        {
          conversation_id: 'c1',
          last_message_id: 'm9',
          last_message_content: 'já resolvi',
          last_message_type: 'text',
          last_message_sender_id: 'p2',
          last_message_created_at: '2026-10-07T09:00:00.000Z',
        },
      ],
      error: null,
    });
    rpcRespostas.set('get_team_unread_counts', {
      data: [{ conversation_id: 'c1', unread_count: '4' }],
      error: null,
    });

    const { result } = render();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const c = result.current.data?.[0];
    expect(c?.last_message).toMatchObject({
      id: 'm9',
      conversation_id: 'c1',
      content: 'já resolvi',
      status: 'delivered',
    });
    expect(c?.unread_count).toBe(4);
  });

  it('conversa sem prévia e sem contagem fica com null e zero', async () => {
    enfileirar(
      'team_conversation_members',
      { data: [membroDe('c1', 'p1')], error: null },
      { data: [membroDe('c1', 'p1')], error: null },
    );
    enfileirar('team_conversations', { data: [conversa()], error: null });
    rpcRespostas.set('get_team_conversation_previews', { data: [], error: null });
    rpcRespostas.set('get_team_unread_counts', { data: [], error: null });

    const { result } = render();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].last_message).toBeNull();
    expect(result.current.data?.[0].unread_count).toBe(0);
  });
});

describe('Realtime', () => {
  it('assina as três tabelas e invalida a lista em qualquer evento', async () => {
    enfileirar('team_conversation_members', { data: [], error: null });
    const { result, queryClient, unmount } = render();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const invalidar = vi.spyOn(queryClient, 'invalidateQueries');
    const canal = cliente.canal;
    expect(canal).not.toBeNull();
    expect(canal?.subscribe).toHaveBeenCalled();
    expect(canal?.on).toHaveBeenCalledTimes(3);

    const tabelas = canal?.on.mock.calls.map((c) => (c[1] as { table: string }).table);
    expect(tabelas).toEqual([
      'team_messages',
      'team_conversation_members',
      'team_message_receipts',
    ]);

    // dispara o callback registrado para team_messages
    const callback = canal?.on.mock.calls[0][2] as () => void;
    act(() => {
      callback();
    });
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['team-conversations'] });

    unmount();
    expect(handlers.removeChannel).toHaveBeenCalled();
  });
});
