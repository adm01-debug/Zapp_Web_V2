import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TC-007 (refazer 2) — prova executável do outro lado da fonte única: a mutação
 * real grava `team_conversation_members.is_muted` e revalida `team-conversations`.
 *
 * O painel (`src/components/team-chat/useTeamChatPanel.ts`) consome este escritor
 * pelo re-export `@/hooks/chat/useTeamChat`, não pelo módulo de implementação. Um
 * teste que importasse `../useTeamChatMutations` provaria apenas a implementação:
 * um re-export divergente (símbolo fantasma ou implementação paralela) passaria
 * batido. Por isso o import abaixo é o MESMO specifier do painel e o módulo do
 * painel é envolvido por um contador (`chamadasViaModuloDoPainel`), que só sobe
 * quando o símbolo executado chega por `@/hooks/chat/useTeamChat`. Trocar o import
 * de volta para `../useTeamChatMutations` zera o contador e o teste fica VERMELHO
 * — é assim que o defeito é detectado. O hook executado continua sendo o real:
 * o wrapper repassa para a implementação (`actual`).
 */
const h = vi.hoisted(() => ({
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  chamadasViaModuloDoPainel: 0,
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1' } }),
}));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: h.from },
}));

// Tripwire do caminho do painel: só conta quando o hook chega pelo re-export
// `@/hooks/chat/useTeamChat`.
vi.mock('@/hooks/chat/useTeamChat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/chat/useTeamChat')>();
  return {
    ...actual,
    useToggleMuteConversation: () => {
      h.chamadasViaModuloDoPainel += 1;
      return actual.useToggleMuteConversation();
    },
  };
});

import { useToggleMuteConversation } from '@/hooks/chat/useTeamChat';

describe('TC-007 — escrita do mute usa a mesma membership lida pelo painel', () => {
  beforeEach(() => {
    h.from.mockReset();
    h.update.mockReset();
    h.eq.mockReset();
    h.chamadasViaModuloDoPainel = 0;

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

    // o escritor executado chegou pelo módulo que o painel importa
    expect(h.chamadasViaModuloDoPainel).toBeGreaterThan(0);

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
