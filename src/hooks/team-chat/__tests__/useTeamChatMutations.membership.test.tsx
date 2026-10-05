import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * QA5-10: a policy tcm_delete_own_or_admin filtra a linha do último owner sem erro —
 * o DELETE volta 0 linhas e a tela mostrava sucesso numa saída/remoção que não
 * aconteceu. Os hooks agora pedem .select('id') e tratam 0 linhas como erro.
 */
const f = vi.hoisted(() => {
  const builder = {
    delete: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
  };
  builder.delete.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return {
    builder,
    toast: vi.fn(),
    captured: undefined as
      | undefined
      | {
          mutationFn: (vars: { conversationId: string; profileId?: string }) => Promise<unknown>;
          onError?: () => void;
        },
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(() => f.builder) },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'profile-self' } }),
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: f.toast }));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (config: { mutationFn: unknown }) => {
    f.captured = config as NonNullable<typeof f.captured>;
    return { mutate: vi.fn(), mutateAsync: vi.fn() };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import { useLeaveConversation, useRemoveConversationMember } from '@/hooks/team-chat/useTeamChatMutations';

describe('useLeaveConversation — DELETE filtrado pela RLS (0 linhas)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.captured = undefined;
    f.builder.delete.mockReturnValue(f.builder);
    f.builder.eq.mockReturnValue(f.builder);
  });

  it('rejeita com membership_delete_blocked quando o DELETE não removeu nada (último dono)', async () => {
    f.builder.select.mockResolvedValue({ data: [], error: null });
    renderHook(() => useLeaveConversation());

    await expect(f.captured!.mutationFn({ conversationId: 'conv-1' }))
      .rejects.toThrow('membership_delete_blocked');
    expect(f.builder.select).toHaveBeenCalledWith('id');
  });

  it('o erro da mutationFn dispara o toast destrutivo (a tela mostra erro, não sucesso)', async () => {
    f.builder.select.mockResolvedValue({ data: [], error: null });
    renderHook(() => useLeaveConversation());

    await expect(f.captured!.mutationFn({ conversationId: 'conv-1' })).rejects.toThrow();
    f.captured!.onError?.();
    expect(f.toast).toHaveBeenCalledWith({ title: 'Erro ao sair do grupo', variant: 'destructive' });
  });

  it('resolve quando a linha foi removida de verdade', async () => {
    f.builder.select.mockResolvedValue({ data: [{ id: 'mem-1' }], error: null });
    renderHook(() => useLeaveConversation());

    await expect(f.captured!.mutationFn({ conversationId: 'conv-1' })).resolves.toBeUndefined();
  });

  it('propaga erro do PostgREST', async () => {
    f.builder.select.mockResolvedValue({ data: null, error: new Error('rls') });
    renderHook(() => useLeaveConversation());

    await expect(f.captured!.mutationFn({ conversationId: 'conv-1' })).rejects.toThrow('rls');
  });
});

describe('useRemoveConversationMember — DELETE filtrado pela RLS (0 linhas)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.captured = undefined;
    f.builder.delete.mockReturnValue(f.builder);
    f.builder.eq.mockReturnValue(f.builder);
  });

  it('rejeita com membership_delete_blocked quando a remoção não afetou linhas (último dono)', async () => {
    f.builder.select.mockResolvedValue({ data: [], error: null });
    renderHook(() => useRemoveConversationMember());

    await expect(f.captured!.mutationFn({ conversationId: 'conv-1', profileId: 'profile-alvo' }))
      .rejects.toThrow('membership_delete_blocked');
    expect(f.builder.select).toHaveBeenCalledWith('id');
  });

  it('resolve e devolve a conversa quando a linha foi removida', async () => {
    f.builder.select.mockResolvedValue({ data: [{ id: 'mem-9' }], error: null });
    renderHook(() => useRemoveConversationMember());

    await expect(f.captured!.mutationFn({ conversationId: 'conv-1', profileId: 'profile-alvo' }))
      .resolves.toEqual({ conversationId: 'conv-1' });
  });
});
