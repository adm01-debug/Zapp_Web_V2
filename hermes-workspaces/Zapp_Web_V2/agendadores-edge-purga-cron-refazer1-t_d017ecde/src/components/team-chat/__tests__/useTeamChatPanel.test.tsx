import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTeamChatPanel } from '../useTeamChatPanel';
import type { TeamConversation, TeamMessage } from '@/hooks/chat/useTeamChat';

// R2-AUTH-010: texto digitado e mensagem em resposta não podem atravessar
// conversas — o painel fica montado quando o usuário troca de conversa.
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1', role: 'admin' } }),
}));

vi.mock('@/hooks/communication/useTextToSpeech', () => ({
  useTextToSpeech: () => ({
    speak: vi.fn(),
    stop: vi.fn(),
    isLoading: false,
    isPlaying: false,
    currentMessageId: null,
    voiceId: 'v1',
    setVoiceId: vi.fn(),
    speed: 1,
    setSpeed: vi.fn(),
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
  useTeamMessages: () => ({ messages: [], isLoading: false }),
}));

vi.mock('@/hooks/team-chat/useTeamMessageReactions', () => ({
  useTeamMessageReactions: () => ({}),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), storage: { from: vi.fn() } },
}));

const convA = { id: 'conv-a' } as TeamConversation;
const convB = { id: 'conv-b' } as TeamConversation;

describe('useTeamChatPanel — estado por conversa (R2-AUTH-010)', () => {
  it('texto digitado e resposta não atravessam para a próxima conversa', () => {
    const { result, rerender } = renderHook(
      ({ conv }: { conv: TeamConversation }) => useTeamChatPanel(conv),
      { initialProps: { conv: convA } },
    );

    act(() => { result.current.setText('texto da conversa A'); });
    act(() => { result.current.setReplyTo({ id: 'msg-1', content: 'mensagem de A' } as TeamMessage); });
    expect(result.current.text).toBe('texto da conversa A');
    expect(result.current.replyTo?.id).toBe('msg-1');

    rerender({ conv: convB });

    expect(result.current.text).toBe('');
    expect(result.current.replyTo).toBeNull();
  });

  it('na mesma conversa, texto e resposta permanecem', () => {
    const { result, rerender } = renderHook(
      ({ conv }: { conv: TeamConversation }) => useTeamChatPanel(conv),
      { initialProps: { conv: convA } },
    );

    act(() => { result.current.setText('continuo aqui'); });
    act(() => { result.current.setReplyTo({ id: 'msg-2', content: 'resposta' } as TeamMessage); });
    rerender({ conv: { ...convA } });

    expect(result.current.text).toBe('continuo aqui');
    expect(result.current.replyTo?.id).toBe('msg-2');
  });
});
