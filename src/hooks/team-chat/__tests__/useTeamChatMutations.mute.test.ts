import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TC-007 (refazer 2) — prova executável do outro lado da fonte única: a mutação
 * real grava a preferência de mute na membership autenticada e revalida
 * `team-conversations`.
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
 *
 * SL-016 (F44): a escrita passou a ser a RPC `set_team_member_pref` — o UPDATE
 * direto anterior não distinguia "silenciado" de "0 linhas afetadas" (sem
 * membership o RLS filtrava sem erro e a tela mostrava um mute inexistente).
 */
const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  chamadasViaModuloDoPainel: 0,
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1' } }),
}));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: h.rpc, from: h.from },
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

describe('TC-007/SL-016 — escrita do mute usa a mesma membership lida pelo painel', () => {
  beforeEach(() => {
    h.rpc.mockReset();
    h.from.mockReset();
    h.rpc.mockResolvedValue({ data: null, error: null });
    h.chamadasViaModuloDoPainel = 0;
  });

  it('grava a preferência pela RPC set_team_member_pref e invalida team-conversations', async () => {
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

    expect(h.rpc).toHaveBeenCalledWith('set_team_member_pref', {
      p_conversation_id: 'conv-a',
      p_is_muted: true,
    });
    // Sem escrita direta na tabela: a RPC é quem decide (e falha) sobre a
    // membership ausente.
    expect(h.from).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['team-conversations'] });
  });

  it('propaga o erro da RPC quando a membership não existe (not_member)', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: 'not_member' } });

    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(() => useToggleMuteConversation(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ conversationId: 'conv-inexistente', muted: true }),
      ).rejects.toMatchObject({ message: 'not_member' });
    });
  });
});
