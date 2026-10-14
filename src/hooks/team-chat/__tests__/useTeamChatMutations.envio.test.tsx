import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O envio de mensagem fazia um `update team_conversations.updated_at` logo
 * depois do INSERT em `team_messages`. Essa escrita é redundante: o trigger
 * `after_team_message_insert_bump_conversation`
 * (supabase/migrations/20260927270001_team_chat_e10_bump_conversation_updated_at_trigger.sql)
 * já copia `NEW.created_at` para `updated_at` no próprio INSERT. Além de
 * redundante, era um no-op silencioso para quem não criou a conversa: a policy
 * de UPDATE de `team_conversations` não deixa um agente comum alterar a linha,
 * o RLS filtra sem erro e a chamada não faz nada.
 *
 * O teste prova o outro lado: depois do envio, o único `.from(...)` tocado é
 * `team_messages`. Qualquer `update` em `team_conversations` no caminho do envio
 * faz o teste ficar VERMELHO.
 */
const h = vi.hoisted(() => {
  const tabelasTocadas: string[] = [];
  const updatesEm: string[] = [];
  let tabelaAtual = '';

  const builder = {
    insert: vi.fn(),
    select: vi.fn(),
    single: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
  };
  builder.insert.mockReturnValue(builder);
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.update.mockImplementation((payload: unknown) => {
    // registra a tabela do update: é o que o caminho do envio NÃO deve chamar
    // para `team_conversations`.
    void payload;
    updatesEm.push(tabelaAtual);
    return builder;
  });

  return {
    tabelasTocadas,
    updatesEm,
    builder,
    setTabela: (t: string) => {
      tabelaAtual = t;
    },
    inserted: undefined as undefined | Record<string, unknown>,
  };
});

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1' } }),
}));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      h.tabelasTocadas.push(table);
      h.setTabela(table);
      return h.builder;
    }),
  },
}));

import { useSendTeamMessage } from '@/hooks/team-chat/useTeamChatMutations';
import { queryKeys } from '@/hooks/team-chat/queryKeys';

describe('useSendTeamMessage — sem escrita redundante em team_conversations', () => {
  beforeEach(() => {
    h.tabelasTocadas.length = 0;
    h.updatesEm.length = 0;
    h.builder.insert.mockClear();
    h.builder.update.mockClear();
    h.builder.insert.mockReturnValue(h.builder);
    h.builder.select.mockReturnValue(h.builder);
    h.builder.eq.mockReturnValue(h.builder);
    h.inserted = undefined;
    h.builder.single.mockImplementation(async () => {
      h.inserted = (h.builder.insert.mock.calls[0]?.[0] as Record<string, unknown>) ?? undefined;
      return { data: { id: 'm-1', ...h.inserted }, error: null };
    });
  });

  function montar() {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(() => useSendTeamMessage(), { wrapper });
    return { result, invalidate };
  }

  it('insere a mensagem e NÃO toca em team_conversations', async () => {
    const { result, invalidate } = montar();

    await act(async () => {
      await result.current.mutateAsync({ conversationId: 'conv-1', content: 'oi' });
    });

    expect(h.inserted).toMatchObject({
      conversation_id: 'conv-1',
      sender_id: 'user-1',
      content: 'oi',
    });
    // o único `.from(...)` do caminho de envio é `team_messages`
    expect(h.tabelasTocadas).toEqual(['team_messages']);
    // e nenhum `update` saiu dele
    expect(h.updatesEm).toEqual([]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.messages('conv-1') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.inbox() });
  });
});
