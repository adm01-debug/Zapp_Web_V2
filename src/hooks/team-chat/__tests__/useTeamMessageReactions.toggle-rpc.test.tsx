import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TestQueryWrapper } from '@/test/mocks/queryClient';

/**
 * SL-016 (F43) — alternar reação tem de passar pela RPC `toggle_team_reaction`.
 *
 * O caminho anterior escrevia direto em `team_message_reactions` (INSERT/DELETE
 * via PostgREST) e a policy de INSERT era justamente o buraco de reação
 * cross-team fechado em 30/09 (migration 20260930260000): a RPC confere o
 * vínculo do autor com a conversa da PRÓPRIA mensagem, sem aceitar a conversa
 * como parâmetro do cliente.
 *
 * O teste chama o hook real e prova que o cliente não faz mais INSERT/DELETE na
 * tabela — só a leitura da lista continua sendo um select.
 */
const h = vi.hoisted(() => {
  const ops: string[] = [];

  function cadeia(tabela: string) {
    const no: Record<string, unknown> = {};
    const registrar = (op: string) => { ops.push(`${tabela}.${op}`); return no; };
    no.select = () => registrar('select');
    no.eq = () => registrar('eq');
    no.insert = (payload: unknown) => { ops.push(`${tabela}.insert`); void payload; return no; };
    no.delete = () => registrar('delete');
    no.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
    return no;
  }

  return {
    ops,
    cadeia,
    from: vi.fn((tabela: string) => cadeia(tabela)),
    rpc: vi.fn(() => Promise.resolve({ data: { action: 'added', emoji: '👍' }, error: null })),
  };
});

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'profile-1' } }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: h.rpc,
    from: h.from,
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
  },
}));

import { useTeamMessageReactions } from '@/hooks/team-chat/useTeamMessageReactions';

describe('useTeamMessageReactions — alternância pela RPC toggle_team_reaction (SL-016/F43)', () => {
  beforeEach(() => {
    h.ops.length = 0;
    h.from.mockClear();
    h.rpc.mockClear();
    h.rpc.mockImplementation(() => Promise.resolve({ data: { action: 'added', emoji: '👍' }, error: null }));
  });

  it('alterna pela RPC e não escreve na tabela de reações', async () => {
    const { result } = renderHook(() => useTeamMessageReactions('conv-1'), {
      wrapper: TestQueryWrapper,
    });

    // A leitura da lista continua vindo da tabela (o realtime alimenta o cache).
    await waitFor(() => expect(h.ops).toContain('team_message_reactions.select'));

    act(() => {
      result.current.toggle({ messageId: 'm-1', emoji: '👍' });
    });

    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith('toggle_team_reaction', {
        p_message_id: 'm-1',
        p_emoji: '👍',
      }),
    );

    expect(h.ops.filter(op => op === 'team_message_reactions.insert' || op === 'team_message_reactions.delete'))
      .toEqual([]);
  });
});
