import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TestQueryWrapper } from '@/test/mocks/queryClient';

/**
 * SL-016 (F53) — a caixa de entrada do Team Chat tem de sair da RPC
 * `get_team_inbox`.
 *
 * Antes o hook montava a lista com três consultas próprias
 * (`team_conversation_members` + `get_team_conversation_previews` +
 * `get_team_unread_counts`) e o badge de não-lidas vinha de uma contagem
 * calculada à parte da última mensagem exibida.
 *
 * O teste chama o hook REAL (react-query real) com a fronteira Supabase
 * dublada e prova: a RPC é chamada, o não-lido e a última mensagem saem dela, e
 * o nome/avatar do chat direto continuam vindo dos membros — que a RPC não traz.
 */
const h = vi.hoisted(() => {
  const chamadas: string[] = [];
  let inbox: unknown[] = [];
  let inboxError: unknown = null;
  let tabelas: Record<string, { data: unknown; error: unknown }> = {};

  // Cadeia mínima do PostgREST: registra a operação e resolve com o resultado da
  // tabela quando o `await` chega (thenable).
  function cadeia(tabela: string) {
    const no: Record<string, unknown> = {};
    const registrar = (op: string) => { chamadas.push(`${tabela}.${op}`); return no; };
    no.select = () => registrar('select');
    no.in = () => registrar('in');
    no.order = () => registrar('order');
    no.eq = () => registrar('eq');
    no.then = (res: (v: unknown) => unknown) =>
      Promise.resolve(tabelas[tabela] ?? { data: [], error: null }).then(res);
    return no;
  }

  return {
    chamadas,
    rpc: vi.fn((nome: string) => {
      chamadas.push(`rpc:${nome}`);
      if (nome === 'get_team_inbox') return Promise.resolve({ data: inbox, error: inboxError });
      return Promise.resolve({ data: null, error: null });
    }),
    from: vi.fn((tabela: string) => cadeia(tabela)),
    definirTabela: (tabela: string, valor: { data: unknown; error: unknown }) => { tabelas[tabela] = valor; },
    definirInbox: (linhas: unknown[], erro: unknown = null) => { inbox = linhas; inboxError = erro; },
    limpar: () => { chamadas.length = 0; inbox = []; inboxError = null; tabelas = {}; },
  };
});

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'profile-1' } }),
}));

vi.mock('@/integrations/supabase/client', () => {
  // Canal encadeável: o hook registra três `.on(...)` antes do `subscribe()`.
  const canal = { on: () => canal, subscribe: () => ({}) };
  return {
    supabase: {
      rpc: h.rpc,
      from: h.from,
      channel: () => canal,
      removeChannel: () => {},
    },
  };
});

import { useTeamConversations } from '@/hooks/team-chat/useTeamConversations';

const CONVERSA = {
  id: 'conv-a',
  type: 'group',
  name: 'Time Comercial',
  avatar_url: null,
  created_by: 'profile-1',
  created_at: '2026-10-01T10:00:00+00:00',
  updated_at: '2026-10-08T15:00:00+00:00',
  department_id: null,
};

const MEMBRO = {
  id: 'mem-1',
  conversation_id: 'conv-a',
  profile_id: 'profile-1',
  joined_at: '2026-10-01T10:00:00+00:00',
  last_read_at: null,
  is_muted: false,
  profile: { id: 'profile-1', name: 'Eu', email: null, avatar_url: null, is_active: true },
};

describe('useTeamConversations — caixa de entrada pela RPC get_team_inbox (SL-016/F53)', () => {
  beforeEach(() => {
    h.rpc.mockClear();
    h.from.mockClear();
    h.limpar();
  });

  it('monta a lista com o não-lido e a última mensagem da RPC, sem as consultas antigas', async () => {
    h.definirInbox([
      {
        conversation_id: 'conv-a',
        conversation_type: 'group',
        conversation_name: 'Time Comercial',
        department_id: null,
        last_message_at: '2026-10-08T15:00:00+00:00',
        last_message_text: 'bom dia',
        last_sender_id: 'profile-2',
        unread_count: 3,
        is_muted: false,
        member_count: 2,
      },
    ]);
    h.definirTabela('team_conversations', { data: [CONVERSA], error: null });
    h.definirTabela('team_conversation_members', { data: [MEMBRO], error: null });

    const { result } = renderHook(() => useTeamConversations(), { wrapper: TestQueryWrapper });

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    const conversa = result.current.data![0];

    expect(conversa.id).toBe('conv-a');
    expect(conversa.unread_count).toBe(3);
    expect(conversa.last_message?.content).toBe('bom dia');
    expect(conversa.last_message?.sender_id).toBe('profile-2');
    expect(conversa.last_message?.created_at).toBe('2026-10-08T15:00:00+00:00');
    expect(conversa.members).toHaveLength(1);

    expect(h.rpc).toHaveBeenCalledWith('get_team_inbox');
    expect(h.chamadas).not.toContain('rpc:get_team_unread_counts');
    expect(h.chamadas).not.toContain('rpc:get_team_conversation_previews');
  });

  it('o nome do chat direto continua vindo do membro (a RPC não resolve o nome)', async () => {
    h.definirTabela('team_conversations', {
      data: [{ ...CONVERSA, type: 'direct', name: null }],
      error: null,
    });
    h.definirTabela('team_conversation_members', {
      data: [
        MEMBRO,
        {
          ...MEMBRO,
          id: 'mem-2',
          profile_id: 'profile-2',
          profile: { id: 'profile-2', name: 'Ana', email: null, avatar_url: 'https://x/a.png', is_active: true },
        },
      ],
      error: null,
    });
    h.definirInbox([
      {
        conversation_id: 'conv-a',
        conversation_type: 'direct',
        conversation_name: null,
        department_id: null,
        last_message_at: null,
        last_message_text: null,
        last_sender_id: null,
        unread_count: 0,
        is_muted: false,
        member_count: 2,
      },
    ]);

    const { result } = renderHook(() => useTeamConversations(), { wrapper: TestQueryWrapper });

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    const conversa = result.current.data![0];

    expect(conversa.name).toBe('Ana');
    expect(conversa.avatar_url).toBe('https://x/a.png');
    // Sem mensagem na conversa, o preview é nulo (não inventa linha).
    expect(conversa.last_message).toBeNull();
    expect(conversa.unread_count).toBe(0);
  });
});
