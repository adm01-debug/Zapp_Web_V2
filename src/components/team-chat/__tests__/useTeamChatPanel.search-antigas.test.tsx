import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTeamChatPanel } from '../useTeamChatPanel';
import type { TeamConversation } from '@/hooks/chat/useTeamChat';

/**
 * SL-016 — busca acha mensagem FORA do trecho carregado, erro aparece com ação
 * de tentar de novo, e mensagem editada/apagada também some das antigas.
 *
 * Antes o painel filtrava em memória só a janela carregada (`messages.filter`),
 * então um termo que só existia no histórico antigo devolvia "Nenhuma mensagem
 * encontrada"; a falha de leitura/RLS aparecia como "Envie a primeira
 * mensagem!"; e uma edição/exclusão antiga ficava na tela com o texto velho
 * (a invalidação do realtime só refazia o trecho mais novo).
 */

type Row = { id: string; sender_id: string; content: string; created_at: string; sender_name: string | null };

const f = vi.hoisted(() => {
  const state = {
    rpcCalls: [] as unknown[][],
    rpcHandler: (_args: Record<string, unknown>) =>
      Promise.resolve({ data: [] as unknown, error: null as unknown }),
    messages: [] as unknown[],
    messagesError: false,
    refetchCount: 0,
    // Resposta do `supabase.from('team_messages')` da paginação de antigas.
    older: { data: [] as unknown, error: null as unknown },
    olderCalls: [] as unknown[][],
    listener: null as ((event: unknown) => void) | null,
  };
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'lt', 'gt', 'lte', 'gte', 'or', 'order', 'limit', 'neq', 'in']) {
    builder[m] = (...args: unknown[]) => { state.olderCalls.push([m, ...args]); return builder; };
  }
  // O posto de PostgREST é "thenable": o hook faz `await supabase...limit(60)`.
  (builder as { then?: unknown }).then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve(state.older).then(onFulfilled);
  return { state, builder };
});

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1', role: 'admin' } }),
}));

vi.mock('@/hooks/communication/useTextToSpeech', () => ({
  useTextToSpeech: () => ({
    speak: vi.fn(), stop: vi.fn(), isLoading: false, isPlaying: false,
    currentMessageId: null, voiceId: 'v1', setVoiceId: vi.fn(), speed: 1, setSpeed: vi.fn(),
  }),
}));

vi.mock('@/hooks/system/useUserSettings', () => ({
  useUserSettings: () => ({ settings: {}, isLoading: false }),
}));

vi.mock('@/hooks/chat/useTeamChat', () => ({
  useSendTeamMessage: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTeamMessage: () => ({ mutateAsync: vi.fn() }),
  useEditTeamMessage: () => ({ mutateAsync: vi.fn() }),
  useToggleMuteConversation: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/hooks/team-chat/useTeamChatMutations', () => ({
  useRenameConversation: () => ({ mutateAsync: vi.fn() }),
  useRemoveConversationMember: () => ({ mutateAsync: vi.fn() }),
  useLeaveConversation: () => ({ mutateAsync: vi.fn() }),
  useDeleteConversation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/hooks/team-chat/useTeamMessages', () => ({
  // Guarda o ouvinte que o painel registra para reconciliar as antigas.
  useTeamMessages: (_id: string | null, onEvent?: (event: unknown) => void) => {
    f.state.listener = onEvent ?? null;
    return {
      messages: f.state.messages,
      isLoading: false,
      isError: f.state.messagesError,
      refetch: () => { f.state.refetchCount += 1; },
    };
  },
}));

vi.mock('@/hooks/team-chat/useTeamMessageReactions', () => ({
  useTeamMessageReactions: () => ({ aggregate: () => [], toggle: vi.fn() }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => f.builder,
    rpc: (fn: string, args: Record<string, unknown>) => {
      f.state.rpcCalls.push([fn, args]);
      return f.state.rpcHandler(args);
    },
    storage: { from: vi.fn() },
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
    removeChannel: vi.fn(),
  },
}));

const conv = { id: 'conv-a', type: 'group' } as TeamConversation;

const row = (id: string, content: string): Row => ({
  id,
  sender_id: 'user-2',
  content,
  created_at: '2026-10-04T10:00:00+00:00',
  sender_name: 'Bruno',
});

const nova = { id: 'm-nova', created_at: '2026-10-04T12:00:00+00:00', sender_id: 'user-2', conversation_id: 'conv-a', content: 'recente' };

/** Espera o debounce da busca (400ms) e deixa o microtask da RPC assentar. */
const avancar = async (ms = 450) => {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
  await act(async () => { await Promise.resolve(); });
};

describe('useTeamChatPanel — busca server-side, erro com retry e antigas reconciliadas (SL-016)', () => {
  beforeEach(() => {
    f.state.rpcCalls.length = 0;
    f.state.olderCalls.length = 0;
    f.state.rpcHandler = () => Promise.resolve({ data: [], error: null });
    f.state.messages = [];
    f.state.messagesError = false;
    f.state.refetchCount = 0;
    f.state.older = { data: [], error: null };
    f.state.listener = null;
  });

  it('acha mensagem fora do trecho carregado consultando a RPC pela conversa e pelo termo', async () => {
    f.state.messages = [nova];
    f.state.rpcHandler = () => Promise.resolve({ data: [row('m-antiga', 'segredo antigo')], error: null });

    const { result } = renderHook(() => useTeamChatPanel(conv));

    act(() => { result.current.setShowSearch(true); result.current.setSearchQuery('segredo'); });
    await avancar();

    expect(f.state.rpcCalls).toHaveLength(1);
    expect(f.state.rpcCalls[0][0]).toBe('search_team_messages');
    expect(f.state.rpcCalls[0][1]).toMatchObject({
      p_conversation_id: 'conv-a',
      p_query: 'segredo',
      p_limit: 100,
    });

    // A antiga NÃO está em `messages` (janela carregada) e mesmo assim aparece.
    expect(result.current.messages.map(m => m.id)).toEqual(['m-nova']);
    expect(result.current.filteredMessages.map(m => m.id)).toEqual(['m-antiga']);
    expect(result.current.searchError).toBeNull();
    expect(result.current.isSearchingMessages).toBe(false);
  });

  it('não consulta o servidor abaixo do mínimo de caracteres', async () => {
    f.state.messages = [nova];
    const { result } = renderHook(() => useTeamChatPanel(conv));

    act(() => { result.current.setShowSearch(true); result.current.setSearchQuery('a'); });
    await avancar();

    expect(f.state.rpcCalls).toHaveLength(0);
    expect(result.current.searchBelowMinChars).toBe(true);
    // Sem busca aplicada, a lista carregada continua na tela.
    expect(result.current.filteredMessages.map(m => m.id)).toEqual(['m-nova']);
  });

  it('mostra o erro da busca e o "Tentar novamente" refaz a consulta', async () => {
    f.state.messages = [nova];
    f.state.rpcHandler = () => Promise.resolve({ data: null, error: { message: 'not_member' } });

    const { result } = renderHook(() => useTeamChatPanel(conv));
    act(() => { result.current.setShowSearch(true); result.current.setSearchQuery('segredo'); });
    await avancar();

    expect(result.current.searchError).toMatch(/não foi possível buscar/i);
    expect(result.current.isSearchingMessages).toBe(false);

    f.state.rpcHandler = () => Promise.resolve({ data: [row('m-antiga', 'segredo antigo')], error: null });
    act(() => { result.current.retrySearch(); });
    await avancar(0);

    expect(f.state.rpcCalls).toHaveLength(2);
    expect(result.current.searchError).toBeNull();
    expect(result.current.filteredMessages.map(m => m.id)).toEqual(['m-antiga']);
  });

  it('descarta a resposta velha: o termo novo manda, sem prender o "buscando"', async () => {
    f.state.messages = [];
    let resolverAntiga: ((v: { data: unknown; error: unknown }) => void) | null = null;
    let resolverNova: ((v: { data: unknown; error: unknown }) => void) | null = null;
    f.state.rpcHandler = (args) => new Promise(resolve => {
      if (args.p_query === 'antiga') resolverAntiga = resolve;
      else resolverNova = resolve;
    });

    const { result } = renderHook(() => useTeamChatPanel(conv));
    act(() => { result.current.setShowSearch(true); result.current.setSearchQuery('antiga'); });
    await avancar();

    act(() => { result.current.setSearchQuery('nova'); });
    await avancar();

    await act(async () => { resolverNova?.({ data: [row('m-nova-busca', 'nova')], error: null }); await Promise.resolve(); });
    expect(result.current.filteredMessages.map(m => m.id)).toEqual(['m-nova-busca']);
    expect(result.current.isSearchingMessages).toBe(false);

    // A resposta atrasada do termo antigo chega DEPOIS e não pode sobrescrever.
    await act(async () => { resolverAntiga?.({ data: [row('m-antiga-busca', 'antiga')], error: null }); await Promise.resolve(); });
    expect(result.current.filteredMessages.map(m => m.id)).toEqual(['m-nova-busca']);
    expect(result.current.isSearchingMessages).toBe(false);
  });

  it('conta com "+" quando o servidor devolve o teto da RPC', async () => {
    f.state.messages = [];
    const cheias: Row[] = Array.from({ length: 100 }, (_, i) => row(`m-${i}`, 'x'));
    f.state.rpcHandler = () => Promise.resolve({ data: cheias, error: null });

    const { result } = renderHook(() => useTeamChatPanel(conv));
    act(() => { result.current.setShowSearch(true); result.current.setSearchQuery('xx'); });
    await avancar();

    expect(result.current.searchIsCapped).toBe(true);
    expect(result.current.filteredMessages).toHaveLength(100);
  });

  it('rejeição de rede vira erro recuperável, nunca promessa sem tratamento', async () => {
    f.state.rpcHandler = () => Promise.reject(new Error('offline'));
    const { result } = renderHook(() => useTeamChatPanel(conv));
    act(() => result.current.setSearchQuery('segredo'));
    await avancar();
    expect(result.current.searchError).toMatch(/não foi possível buscar/i);
    expect(result.current.isSearchingMessages).toBe(false);
  });

  it('expõe a falha de leitura e o refetch das mensagens', async () => {
    f.state.messagesError = true;
    const { result } = renderHook(() => useTeamChatPanel(conv));

    expect(result.current.messagesError).toBe(true);
    act(() => { result.current.refetchMessages(); });
    expect(f.state.refetchCount).toBe(1);
  });

  it('falha ao carregar as antigas NÃO vira "sem mais mensagens": mantém o botão e permite tentar de novo', async () => {
    f.state.messages = [nova];
    f.state.older = { data: null, error: { message: 'timeout' } };
    const { result } = renderHook(() => useTeamChatPanel(conv));
    await act(async () => { await Promise.resolve(); });

    await act(async () => { await result.current.fetchOlderMessages(); });
    expect(result.current.olderError).toBe(true);
    expect(result.current.hasOlderMessages).toBe(true);

    f.state.older = { data: [{ ...row('m-antiga-2', 'mais antiga'), conversation_id: 'conv-a' }], error: null };
    await act(async () => { await result.current.fetchOlderMessages(); });

    expect(result.current.olderError).toBe(false);
    expect(result.current.messages.map(m => m.id)).toContain('m-antiga-2');
  });

  it('reconcilia edição e exclusão vindas do realtime nas mensagens antigas', async () => {
    f.state.messages = [nova];
    f.state.older = { data: [{ ...row('m-antiga-3', 'texto velho'), conversation_id: 'conv-a' }], error: null };
    const { result } = renderHook(() => useTeamChatPanel(conv));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await result.current.fetchOlderMessages(); });
    expect(result.current.messages.map(m => m.id)).toContain('m-antiga-3');

    await act(async () => {
      f.state.listener?.({ type: 'update', id: 'm-antiga-3', content: 'texto editado', is_edited: true, updated_at: '2026-10-05T00:00:00+00:00' });
    });
    const editada = result.current.messages.find(m => m.id === 'm-antiga-3');
    expect(editada?.content).toBe('texto editado');
    expect(editada?.is_edited).toBe(true);

    await act(async () => { f.state.listener?.({ type: 'delete', id: 'm-antiga-3' }); });
    expect(result.current.messages.map(m => m.id)).not.toContain('m-antiga-3');
  });
});
