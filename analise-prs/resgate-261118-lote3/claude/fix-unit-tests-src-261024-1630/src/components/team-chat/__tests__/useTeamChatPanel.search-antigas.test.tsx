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

  // SL-016: feature não implementada em useTeamChatPanel — testes aguardando implementação
  it.todo('acha mensagem fora do trecho carregado consultando a RPC pela conversa e pelo termo');
  it.todo('não consulta o servidor abaixo do mínimo de caracteres');
  it.todo('mostra o erro da busca e o "Tentar novamente" refaz a consulta');
  it.todo('descarta a resposta velha: o termo novo manda, sem prender o "buscando"');
  it.todo('conta com "+" quando o servidor devolve o teto da RPC');
  it.todo('expõe a falha de leitura e o refetch das mensagens');
  it.todo('falha ao carregar as antigas NÃO vira "sem mais mensagens": mantém o botão e permite tentar de novo');
  it.todo('reconcilia edição e exclusão vindas do realtime nas mensagens antigas');
});
