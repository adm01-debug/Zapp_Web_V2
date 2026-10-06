import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TeamConversation, TeamMessage } from '@/hooks/chat/useTeamChat';

/**
 * TC-010 (#165) — o envio textual limpava `text` e `replyTo` ANTES do await e
 * não devolvia nada no catch: uma falha de rede/RLS apagava o rascunho do
 * usuário sem recuperação.
 */
const send = vi.hoisted(() => ({ mutateAsync: vi.fn() }));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1', role: 'admin' } }),
}));

vi.mock('@/hooks/communication/useTextToSpeech', () => ({
  useTextToSpeech: () => ({ setVoiceId: vi.fn(), setSpeed: vi.fn() }),
}));

vi.mock('@/hooks/system/useUserSettings', () => ({
  useUserSettings: () => ({ settings: {}, isLoading: false }),
}));

vi.mock('@/hooks/chat/useTeamChat', () => ({
  useSendTeamMessage: () => send,
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

vi.mock('@/hooks/team-chat/uploadTeamMedia', () => ({
  uploadTeamMedia: vi.fn(),
  TEAM_CHAT_FILES_BUCKET: 'team-chat-files',
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), storage: { from: vi.fn() } },
}));

import { useTeamChatPanel } from '../useTeamChatPanel';

const conv = { id: 'conv-a' } as TeamConversation;

describe('useTeamChatPanel — rascunho sobrevive ao erro de envio (TC-010)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devolve o texto e a resposta quando o envio falha', async () => {
    send.mutateAsync.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useTeamChatPanel(conv));

    act(() => { result.current.setText('mensagem importante'); });
    act(() => { result.current.setReplyTo({ id: 'msg-1', content: 'resposta' } as TeamMessage); });

    await act(async () => { await result.current.handleSend(); });

    expect(send.mutateAsync).toHaveBeenCalledTimes(1);
    expect(result.current.text).toBe('mensagem importante');
    expect(result.current.replyTo?.id).toBe('msg-1');
  });

  it('não sobrescreve o texto que o usuário digitou durante o envio', async () => {
    let reject!: (err: unknown) => void;
    send.mutateAsync.mockImplementationOnce(
      () => new Promise((_resolve, rej) => { reject = rej; }),
    );
    const { result } = renderHook(() => useTeamChatPanel(conv));

    act(() => { result.current.setText('primeira'); });
    let pending!: Promise<void>;
    act(() => { pending = result.current.handleSend(); });
    act(() => { result.current.setText('segunda'); });

    await act(async () => { reject(new Error('offline')); await pending; });

    expect(result.current.text).toBe('segunda');
  });

  it('limpa o campo quando o envio dá certo', async () => {
    send.mutateAsync.mockResolvedValueOnce({ id: 'msg-9' });
    const { result } = renderHook(() => useTeamChatPanel(conv));

    act(() => { result.current.setText('vai'); });
    await act(async () => { await result.current.handleSend(); });

    expect(result.current.text).toBe('');
  });
});
