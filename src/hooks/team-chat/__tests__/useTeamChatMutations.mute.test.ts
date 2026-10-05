import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TC-007 — prova executável do outro lado da fonte única: a mutação real grava
 * `team_conversation_members.is_muted` e revalida `team-conversations`.
 */
const h = vi.hoisted(() => ({
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1' } }),
}));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: h.from },
}));

import { useToggleMuteConversation } from '../useTeamChatMutations';

describe('TC-007 — escrita do mute usa a mesma membership lida pelo painel', () => {
  beforeEach(() => {
    h.from.mockReset();
    h.update.mockReset();
    h.eq.mockReset();

    h.eq
      .mockReturnValueOnce({ eq: h.eq })
      .mockResolvedValueOnce({ error: null });
    h.update.mockReturnValue({ eq: h.eq });
    h.from.mockReturnValue({ update: h.update });
  });

  it('grava is_muted na membership autenticada e invalida team-conversations', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(() => useToggleMuteConversation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ conversationId: 'conv-a', muted: true });
    });

    expect(h.from).toHaveBeenCalledWith('team_conversation_members');
    expect(h.update).toHaveBeenCalledWith({ is_muted: true });
    expect(h.eq).toHaveBeenNthCalledWith(1, 'conversation_id', 'conv-a');
    expect(h.eq).toHaveBeenNthCalledWith(2, 'profile_id', 'user-1');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['team-conversations'] });
  });
});
