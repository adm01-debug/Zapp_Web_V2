/**
 * Comportamento de `useTeamConversations` — lista de conversas do chat de equipe (nome/avatar
 * de conversa direta, prévia da última mensagem, não lidas) e a assinatura de Realtime que a
 * mantém viva. A fronteira mockada é o cliente Supabase; o hook é o real.
 *
 * SL-016 (F53): a caixa de entrada (última mensagem + não lidas) passou a vir da RPC
 * `get_team_inbox`, numa chamada só. Antes eram três consultas próprias
 * (`team_conversation_members` + `get_team_conversation_previews` +
 * `get_team_unread_counts`) e o badge saía de uma contagem à parte da última mensagem.
 * Este arquivo foi atualizado para o contrato novo; as consultas antigas não podem voltar.
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

/** Linha da RPC `get_team_inbox` — a caixa de entrada com a última mensagem e o não-lido. */
const linhaInbox = (over: Partial<Record<string, unknown>> = {}) => ({
  conversation_id: 'c1',
  conversation_name: null as string | null,
  conversation_type: 'direct',
  department_id: null as string | null,
  is_muted: false,
  last_message_at: '2026-10-07T09:00:00.000Z' as string | null,
  last_message_text: 'já resolvi' as string | null,
  last_sender_id: 'p2' as string | null,
  member_count: 2,
  unread_count: 4,
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
    expect(handlers.rpc).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  it('caixa de entrada vazia não busca conversa nenhuma', async () => {
    rpcRespostas.set('get_team_inbox', { data: [], error: null });
    const { result } = render();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(handlers.rpc).toHaveBeenCalledWith('get_team_inbox');
    expect(handlers.from).not.toHaveBeenCalled();
  });

  it('erro na RPC da caixa de entrada vira erro da consulta', async () => {
    rpcRespostas.set('get_team_inbox', { data: null, error: { message: 'permission denied' } });
    const { result } = render();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as { message: string }).message).toBe('permission denied');
    expect(handlers.from).not.toHaveBeenCalled();
  });

  it('erro ao ler as conversas também vira erro (não devolve lista vazia)', async () => {
    rpcRespostas.set('get_team_inbox', { data: [linhaInbox()], error: null });
    enfileirar('team_conversations', { data: null, error: { message: 'RLS negou' } });
    enfileirar('team_conversation_members', { data: [], error: null });
    const { result } = render();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as { message: string }).message).toBe('RLS negou');
  });

  it('erro ao ler os membros também vira erro (não devolve lista pela metade)', async () => {
    rpcRespostas.set('get_team_inbox', { data: [linhaInbox()], error: null });
    enfileirar('team_conversations', { data: [conversa()], error: null });
    enfileirar('team_conversation_members', { data: null, error: { message: 'membros negados' } });
    const { result } = render();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as { message: string }).message).toBe('membros negados');
  });

  it('busca as conversas pelos ids da caixa de entrada, da mais recente para a mais antiga', async () => {
    rpcRespostas.set('get_team_inbox', {
      data: [
        linhaInbox({ conversation_id: 'c1' }),
        linhaInbox({ conversation_id: 'c2' }),
      ],
      error: null,
    });
    enfileirar('team_conversations', { data: [conversa({ id: 'c1' }), conversa({ id: 'c2' })], error: null });
    enfileirar('team_conversation_members', {
      data: [membroDe('c1', 'p1'), membroDe('c1', 'p2'), membroDe('c2', 'p1')],
      error: null,
    });

    const { result } = render();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const comIn = registro.filter((r) => r.metodo === 'in' && r.args[0] === 'id');
    expect(comIn[0]?.args[1]).toEqual(['c1', 'c2']);
    const comOrdem = registro.find((r) => r.metodo === 'order');
    expect(comOrdem?.args).toEqual(['updated_at', { ascending: false }]);
    expect(result.current.data).toHaveLength(2);
  });

  it('conversa direta sem nome usa o nome do outro participante e o avatar dele', async () => {
    rpcRespostas.set('get_team_inbox', { data: [linhaInbox()], error: null });
    enfileirar('team_conversations', { data: [conversa()], error: null });
    enfileirar('team_conversation_members', {
      data: [
        membroDe('c1', 'p1', { id: 'p1', name: 'Ana', email: 'ana@ex.com', avatar_url: null, is_active: true }),
        membroDe('c1', 'p2'),
      ],
      error: null,
    });

    const { result } = render();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const c = result.current.data?.[0];
    expect(c?.name).toBe('Bruno Lima');
    expect(c?.avatar_url).toBe('https://cdn/bruno.png');
    expect(c?.members).toHaveLength(2);
  });

  it('conversa direta sem o perfil do outro cai em "Chat Direto"', async () => {
    rpcRespostas.set('get_team_inbox', { data: [linhaInbox()], error: null });
    enfileirar('team_conversations', { data: [conversa()], error: null });
    enfileirar('team_conversation_members', { data: [membroDe('c1', 'p1', null)], error: null });

    const { result } = render();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].name).toBe('Chat Direto');
    expect(result.current.data?.[0].avatar_url).toBeNull();
  });

  it('conversa de grupo mantém o próprio nome e avatar', async () => {
    rpcRespostas.set('get_team_inbox', { data: [linhaInbox({ conversation_type: 'group' })], error: null });
    enfileirar('team_conversations', {
      data: [conversa({ type: 'group', name: 'Suporte N1', avatar_url: 'https://cdn/grupo.png' })],
      error: null,
    });
    enfileirar('team_conversation_members', { data: [membroDe('c1', 'p1'), membroDe('c1', 'p2')], error: null });

    const { result } = render();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const c = result.current.data?.[0];
    expect(c?.type).toBe('group');
    expect(c?.name).toBe('Suporte N1');
    expect(c?.avatar_url).toBe('https://cdn/grupo.png');
  });

  it('monta a prévia da última mensagem e a contagem de não lidas a partir da caixa de entrada', async () => {
    rpcRespostas.set('get_team_inbox', {
      data: [
        linhaInbox({
          last_message_at: '2026-10-07T09:00:00.000Z',
          last_message_text: 'já resolvi',
          last_sender_id: 'p2',
          unread_count: 4,
        }),
      ],
      error: null,
    });
    enfileirar('team_conversations', { data: [conversa()], error: null });
    enfileirar('team_conversation_members', { data: [membroDe('c1', 'p1')], error: null });

    const { result } = render();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const c = result.current.data?.[0];
    expect(c?.last_message).toMatchObject({
      conversation_id: 'c1',
      content: 'já resolvi',
      sender_id: 'p2',
      status: 'delivered',
      created_at: '2026-10-07T09:00:00.000Z',
    });
    expect(c?.unread_count).toBe(4);
  });

  it('conversa sem prévia e sem contagem fica com null e zero', async () => {
    rpcRespostas.set('get_team_inbox', {
      data: [linhaInbox({ last_message_at: null, last_message_text: null, last_sender_id: null, unread_count: 0 })],
      error: null,
    });
    enfileirar('team_conversations', { data: [conversa()], error: null });
    enfileirar('team_conversation_members', { data: [membroDe('c1', 'p1')], error: null });

    const { result } = render();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].last_message).toBeNull();
    expect(result.current.data?.[0].unread_count).toBe(0);
  });

  it('não usa mais as RPCs antigas de prévia e contagem de não lidas', async () => {
    rpcRespostas.set('get_team_inbox', { data: [linhaInbox()], error: null });
    enfileirar('team_conversations', { data: [conversa()], error: null });
    enfileirar('team_conversation_members', { data: [membroDe('c1', 'p1')], error: null });

    const { result } = render();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const nomes = handlers.rpc.mock.calls.map((c) => c[0]);
    expect(nomes).toContain('get_team_inbox');
    expect(nomes).not.toContain('get_team_conversation_previews');
    expect(nomes).not.toContain('get_team_unread_counts');
  });
});

describe('Realtime', () => {
  it('assina as três tabelas e invalida a lista em qualquer evento', async () => {
    rpcRespostas.set('get_team_inbox', { data: [], error: null });
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
