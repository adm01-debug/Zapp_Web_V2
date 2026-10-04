import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTeamChatPanel } from '../useTeamChatPanel';
import type { TeamConversation } from '@/hooks/chat/useTeamChat';

/**
 * TC-006 — o cursor de paginação era só `created_at`: com várias mensagens no
 * mesmo instante, o lote seguinte (`created_at < cursor`) pulava as empatadas.
 * O cursor tem que ser composto `(created_at, id)` para não repetir nem perder
 * mensagens em três páginas.
 */
const f = vi.hoisted(() => {
  const calls: unknown[][] = [];
  const result = { data: [] as unknown[], error: null };
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'lt', 'gt', 'lte', 'gte', 'or', 'order', 'limit', 'neq', 'in']) {
    builder[m] = (...args: unknown[]) => { calls.push([m, ...args]); return builder; };
  }
  // O posto de PostgREST é "thenable": o hook faz `await supabase...limit(60)`.
  (builder as { then?: unknown }).then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled);
  return {
    calls,
    builder,
    // Mensagem mais antiga do lote mais novo: vira o cursor da próxima página.
    messages: [
      {
        id: 'm-1',
        created_at: '2026-10-04T10:00:00+00:00',
        sender_id: 'user-2',
        conversation_id: 'conv-a',
        content: 'a',
      },
    ],
  };
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
  useTeamMessages: () => ({ messages: f.messages, isLoading: false }),
}));

vi.mock('@/hooks/team-chat/useTeamMessageReactions', () => ({
  useTeamMessageReactions: () => ({ aggregate: () => [], toggle: vi.fn() }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => f.builder,
    storage: { from: vi.fn() },
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
    removeChannel: vi.fn(),
  },
}));

const convA = { id: 'conv-a', type: 'group' } as TeamConversation;

describe('useTeamChatPanel — paginação usa cursor composto (created_at, id)', () => {
  beforeEach(() => { f.calls.length = 0; });

  it('busca mensagens anteriores com .or() sobre (created_at, id), não só created_at', async () => {
    const { result } = renderHook(() => useTeamChatPanel(convA));

    // Flush dos efeitos (o cursor inicial nasce de um efeito sobre as mensagens).
    await act(async () => { await Promise.resolve(); });

    await act(async () => { await result.current.fetchOlderMessages(); });

    const orCall = f.calls.find(c => c[0] === 'or');
    expect(orCall, 'a paginação deve usar um filtro composto (.or) com created_at + id').toBeTruthy();
    expect(orCall![1]).toBe(
      'created_at.lt."2026-10-04T10:00:00+00:00",and(created_at.eq."2026-10-04T10:00:00+00:00",id.lt.m-1)',
    );
    // O filtro antigo (só created_at) não pode mais aparecer na paginação.
    expect(f.calls.some(c => c[0] === 'lt' && c[1] === 'created_at')).toBe(false);
  });
});
