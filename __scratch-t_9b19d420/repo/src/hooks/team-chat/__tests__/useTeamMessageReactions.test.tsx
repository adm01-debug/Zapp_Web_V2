/**
 * Comportamento de `useTeamMessageReactions` — agregação por emoji, alternar (inserir/apagar)
 * a própria reação, atualização otimista com desfazer no erro e Realtime por conversa.
 * A fronteira mockada é o cliente Supabase (e o `toast`); o hook é o real.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactionGroup } from '@/components/ui/message-reactions';

interface RowReaction {
  id: string;
  message_id: string;
  profile_id: string;
  emoji: string;
  conversation_id: string;
  created_at: string;
}

const estado = vi.hoisted(() => ({
  auth: { profile: { id: 'p1' } as { id: string } | null },
  linhas: [] as RowReaction[],
  erroSelecao: null as unknown,
  erroEscrita: null as unknown,
  selecoes: [] as { coluna: string; valor: unknown }[],
  escritas: [] as { tipo: 'insert' | 'delete'; dados?: unknown; id?: unknown }[],
  insercao: null as Promise<{ error: unknown }> | null,
  eventos: [] as { nome: string; filtro?: string; callback: () => void }[],
  removeChannel: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ profile: estado.auth.profile }) }));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => estado.toastError(...args),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/integrations/supabase/client', () => {
  const criarBuilder = () => {
    let modo: 'select' | 'delete' = 'select';
    const builder: Record<string, unknown> = {};
    builder.select = () => {
      modo = 'select';
      return builder;
    };
    builder.delete = () => {
      modo = 'delete';
      return builder;
    };
    builder.eq = (coluna: string, valor: unknown) => {
      if (modo === 'delete') {
        estado.escritas.push({ tipo: 'delete', id: { coluna, valor } as unknown });
      } else {
        estado.selecoes.push({ coluna, valor });
      }
      return builder;
    };
    builder.insert = (dados: unknown) => {
      estado.escritas.push({ tipo: 'insert', dados });
      return estado.insercao ?? Promise.resolve({ error: estado.erroEscrita });
    };
    builder.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(
        modo === 'delete'
          ? { error: estado.erroEscrita }
          : { data: estado.linhas, error: estado.erroSelecao },
      ).then(onFulfilled, onRejected);
    return builder;
  };

  return {
    supabase: {
      from: () => criarBuilder(),
      channel: (nome: string) => {
        const canal: Record<string, unknown> = {};
        canal.on = (evento: string, config: { filter?: string }, callback: () => void) => {
          estado.eventos.push({ nome: `${nome}:${evento}`, filtro: config?.filter, callback });
          return canal;
        };
        canal.subscribe = () => ({ unsubscribe: vi.fn() });
        return canal;
      },
      removeChannel: (...args: unknown[]) => estado.removeChannel(...args),
    },
  };
});

import { useTeamMessageReactions } from '../useTeamMessageReactions';

const reacao = (over: Partial<RowReaction> = {}): RowReaction => ({
  id: 'rx1',
  message_id: 'm1',
  profile_id: 'p2',
  emoji: '👍',
  conversation_id: 'c1',
  created_at: '2026-10-07T10:00:00.000Z',
  ...over,
});

function deferido<T>() {
  let resolver!: (valor: T) => void;
  let rejeitar!: (erro: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolver = res;
    rejeitar = rej;
  });
  return { promise, resolver, rejeitar };
}

function render(conversationId = 'c1', queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { ...renderHook(() => useTeamMessageReactions(conversationId), { wrapper }), queryClient };
}

const emoji = (grupos: ReactionGroup[], alvo: string) => grupos.find((g) => g.emoji === alvo);

beforeEach(() => {
  estado.auth.profile = { id: 'p1' };
  estado.linhas = [];
  estado.erroSelecao = null;
  estado.erroEscrita = null;
  estado.selecoes = [];
  estado.escritas = [];
  estado.insercao = null;
  estado.eventos = [];
  estado.removeChannel.mockReset();
  estado.toastError.mockReset();
});

afterEach(() => {
  estado.linhas = [];
});

describe('leitura e agregação', () => {
  it('busca as reações da conversa informada', async () => {
    estado.linhas = [reacao()];
    const { result } = render('c9');
    await waitFor(() => expect(result.current.reactions).toHaveLength(1));
    expect(estado.selecoes).toContainEqual({ coluna: 'conversation_id', valor: 'c9' });
    expect(result.current.aggregate('m1')).toHaveLength(1);
  });

  it('agrupa por emoji, conta os participantes e marca a minha reação', async () => {
    estado.linhas = [
      reacao({ id: 'a', emoji: '👍', profile_id: 'p2' }),
      reacao({ id: 'b', emoji: '👍', profile_id: 'p1' }),
      reacao({ id: 'c', emoji: '❤️', profile_id: 'p3' }),
      reacao({ id: 'd', message_id: 'm2', emoji: '🎉', profile_id: 'p2' }),
    ];
    const { result } = render();
    await waitFor(() => expect(result.current.reactions).toHaveLength(4));

    const doM1 = result.current.aggregate('m1');
    expect(doM1).toHaveLength(2);
    expect(emoji(doM1, '👍')).toMatchObject({ count: 2, reactedByMe: true });
    expect(emoji(doM1, '👍')?.profileIds).toEqual(['p2', 'p1']);
    expect(emoji(doM1, '❤️')).toMatchObject({ count: 1, reactedByMe: false });
    expect(emoji(result.current.aggregate('m2'), '🎉')?.count).toBe(1);
  });

  it('mensagem sem reação devolve lista vazia', async () => {
    estado.linhas = [reacao()];
    const { result } = render();
    await waitFor(() => expect(result.current.reactions).toHaveLength(1));
    expect(result.current.aggregate('m-inexistente')).toEqual([]);
  });

  it('erro de RLS na leitura deixa o estado em erro', async () => {
    estado.linhas = [reacao({ id: 'vazamento-rls' })];
    estado.erroSelecao = { message: 'permission denied' };
    const { result, queryClient } = render();
    await waitFor(() =>
      expect(queryClient.getQueryState(['team-reactions', 'c1'])?.status).toBe('error'),
    );
    expect(queryClient.getQueryData(['team-reactions', 'c1'])).toBeUndefined();
    expect(result.current.reactions).toEqual([]);
    expect(result.current.aggregate('m1')).toEqual([]);
  });
});

describe('alternar reação', () => {
  it('insere a reação quando ainda não existe', async () => {
    estado.linhas = [];
    const { result } = render();
    await waitFor(() => expect(result.current.reactions).toEqual([]));

    act(() => {
      result.current.toggle({ messageId: 'm1', emoji: '🎉' });
    });

    await waitFor(() => expect(estado.escritas).toHaveLength(1));
    expect(estado.escritas[0]).toEqual({
      tipo: 'insert',
      dados: { message_id: 'm1', profile_id: 'p1', emoji: '🎉', conversation_id: 'c1' },
    });
  });

  it('apaga a reação quando ela já é minha', async () => {
    estado.linhas = [reacao({ id: 'rx9', emoji: '👍', profile_id: 'p1' })];
    const { result } = render();
    await waitFor(() => expect(result.current.reactions).toHaveLength(1));

    act(() => {
      result.current.toggle({ messageId: 'm1', emoji: '👍' });
    });

    await waitFor(() => expect(estado.escritas).toHaveLength(1));
    expect(estado.escritas[0]).toEqual({ tipo: 'delete', id: { coluna: 'id', valor: 'rx9' } });
  });

  it('mostra a reação na hora, antes de a rede responder', async () => {
    estado.linhas = [];
    const insercao = deferido<{ error: unknown }>();
    estado.insercao = insercao.promise;
    const { result } = render();
    await waitFor(() => expect(result.current.reactions).toEqual([]));

    act(() => {
      result.current.toggle({ messageId: 'm1', emoji: '🎉' });
    });

    await waitFor(() => expect(emoji(result.current.aggregate('m1'), '🎉')).toBeDefined());
    expect(emoji(result.current.aggregate('m1'), '🎉')).toMatchObject({ count: 1, reactedByMe: true });
    expect(result.current.isToggling).toBe(true);

    await act(async () => {
      insercao.resolver({ error: null });
      await insercao.promise;
    });
    await waitFor(() => expect(result.current.isToggling).toBe(false));
  });

  it('desfaz a reação otimista quando a escrita falha', async () => {
    estado.linhas = [];
    const insercao = deferido<{ error: unknown }>();
    estado.insercao = insercao.promise;

    const { result } = render();
    await waitFor(() => expect(result.current.reactions).toEqual([]));

    act(() => {
      result.current.toggle({ messageId: 'm1', emoji: '🎉' });
    });
    await waitFor(() => expect(emoji(result.current.aggregate('m1'), '🎉')).toBeDefined());

    await act(async () => {
      insercao.resolver({ error: { message: 'RLS negou' } });
      await insercao.promise;
    });

    await waitFor(() => expect(estado.toastError).toHaveBeenCalledWith('Erro ao reagir'));
    await waitFor(() => expect(result.current.aggregate('m1')).toEqual([]));
    expect(result.current.isToggling).toBe(false);
  });

  it('sem usuário logado não escreve e avisa o operador', async () => {
    estado.auth.profile = null;
    estado.linhas = [];
    const { result } = render();
    await waitFor(() => expect(result.current.reactions).toEqual([]));

    act(() => {
      result.current.toggle({ messageId: 'm1', emoji: '🎉' });
    });

    await waitFor(() => expect(estado.toastError).toHaveBeenCalledWith('Erro ao reagir'));
    expect(estado.escritas).toHaveLength(0);
  });
});

describe('Realtime', () => {
  it('assina por conversa, com filtro, e invalida a lista no evento', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = render('c1', queryClient);
    await waitFor(() => expect(result.current.reactions).toEqual([]));

    const invalidar = vi.spyOn(queryClient, 'invalidateQueries');
    expect(estado.eventos).toHaveLength(1);
    expect(estado.eventos[0].nome).toBe('team-reactions-c1:postgres_changes');
    expect(estado.eventos[0].filtro).toBe('conversation_id=eq.c1');

    act(() => {
      estado.eventos[0].callback();
    });
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['team-reactions', 'c1'] });
  });

  it('remove o canal ao desmontar', async () => {
    const { result, unmount } = render();
    await waitFor(() => expect(result.current.reactions).toEqual([]));
    unmount();
    expect(estado.removeChannel).toHaveBeenCalled();
  });
});
