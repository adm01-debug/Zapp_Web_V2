import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * QA5-10 (P1, cartão t_ab98c520): a policy tcm_delete_own_or_admin filtra a linha
 * do último owner sem levantar erro — o DELETE volta com 0 linhas e a tela
 * mostrava "Membro removido"/saía como se tivesse funcionado. O hook agora pede
 * `.select('id')` no delete e trata 0 linhas retornadas como erro
 * ('membership_delete_blocked'): o último owner só sai depois de transferir.
 */
const f = vi.hoisted(() => ({
  deleteResult: { data: [{ id: 'linha-1' }] as Array<{ id: string }> | null, error: null as unknown },
  captured: undefined as
    | undefined
    | { mutationFn: (vars: Record<string, unknown>) => Promise<unknown> },
}));

const deleteChain = vi.hoisted(() => {
  const chain: { eq: ReturnType<typeof vi.fn>; select: ReturnType<typeof vi.fn> } = {
    eq: vi.fn(),
    select: vi.fn(() => Promise.resolve(f.deleteResult)),
  };
  chain.eq.mockImplementation(() => chain);
  return chain;
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ delete: () => deleteChain }),
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'profile-1' } }),
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: (config: { mutationFn: (vars: Record<string, unknown>) => Promise<unknown> }) => {
    f.captured = config;
    return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
  },
}));

import { useLeaveConversation, useRemoveConversationMember } from '@/hooks/team-chat/useTeamChatMutations';

describe('useTeamChatMutations — DELETE com 0 linhas é erro, não sucesso (QA5-10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.captured = undefined;
    f.deleteResult = { data: [{ id: 'linha-1' }], error: null };
    deleteChain.select.mockImplementation(() => Promise.resolve(f.deleteResult));
  });

  it('useLeaveConversation: 0 linhas deletadas (último owner filtrado pela RLS) rejeita', async () => {
    renderHook(() => useLeaveConversation());
    f.deleteResult = { data: [], error: null };

    await expect(f.captured!.mutationFn({ conversationId: 'conv-1' })).rejects.toThrow(
      'membership_delete_blocked',
    );
  });

  it('useLeaveConversation: 1 linha deletada resolve normalmente', async () => {
    renderHook(() => useLeaveConversation());

    await expect(f.captured!.mutationFn({ conversationId: 'conv-1' })).resolves.toBeUndefined();
    expect(deleteChain.eq).toHaveBeenCalledWith('conversation_id', 'conv-1');
    expect(deleteChain.eq).toHaveBeenCalledWith('profile_id', 'profile-1');
  });

  it('useLeaveConversation: data null (sem retorno) também rejeita', async () => {
    renderHook(() => useLeaveConversation());
    f.deleteResult = { data: null, error: null };

    await expect(f.captured!.mutationFn({ conversationId: 'conv-1' })).rejects.toThrow(
      'membership_delete_blocked',
    );
  });

  it('useRemoveConversationMember: 0 linhas deletadas rejeita em vez de mostrar sucesso', async () => {
    renderHook(() => useRemoveConversationMember());
    f.deleteResult = { data: [], error: null };

    await expect(
      f.captured!.mutationFn({ conversationId: 'conv-1', profileId: 'profile-2' }),
    ).rejects.toThrow('membership_delete_blocked');
  });

  it('useRemoveConversationMember: remoção real continua resolvendo', async () => {
    renderHook(() => useRemoveConversationMember());

    await expect(
      f.captured!.mutationFn({ conversationId: 'conv-1', profileId: 'profile-2' }),
    ).resolves.toEqual({ conversationId: 'conv-1' });
  });

  it('erro do PostgREST continua propagando como erro', async () => {
    renderHook(() => useLeaveConversation());
    f.deleteResult = { data: null, error: { message: 'rls violada' } };

    await expect(f.captured!.mutationFn({ conversationId: 'conv-1' })).rejects.toMatchObject({
      message: 'rls violada',
    });
  });
});
