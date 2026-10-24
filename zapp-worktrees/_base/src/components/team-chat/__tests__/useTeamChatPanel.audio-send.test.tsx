import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { TeamConversation } from '@/hooks/chat/useTeamChat';

/**
 * R2-INB-058 (#350-B) — `handleAudioSend` devolvia `undefined` em TODOS os
 * caminhos (inclusive falha). O `TextToAudioButton` lê esse retorno como
 * sucesso e descarta a prévia do áudio gerado. Contrato: `Promise<boolean>`,
 * `true` SÓ quando a mutação de envio confirma.
 */
const send = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
const upload = vi.hoisted(() => ({ uploadTeamMedia: vi.fn() }));
const auth = vi.hoisted(() => ({
  profile: { id: 'user-1', role: 'admin' } as { id?: string; role?: string } | null,
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: auth.profile }),
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
  uploadTeamMedia: upload.uploadTeamMedia,
  TEAM_CHAT_FILES_BUCKET: 'team-chat-files',
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), storage: { from: vi.fn() } },
}));

import { toast } from 'sonner';
import { useTeamChatPanel } from '../useTeamChatPanel';

const conv = { id: 'conv-a' } as TeamConversation;
const blob = new Blob(['audio'], { type: 'audio/webm' });

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useTeamChatPanel — handleAudioSend sinaliza o resultado do envio (#350-B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.profile = { id: 'user-1', role: 'admin' };
  });

  it('devolve true quando o upload e o envio confirmam', async () => {
    upload.uploadTeamMedia.mockResolvedValueOnce({
      mediaPath: 'conv-a/audio.webm',
      mediaBucket: 'team-chat-files',
    });
    send.mutateAsync.mockResolvedValueOnce({ id: 'msg-1' });

    const { result } = renderHook(() => useTeamChatPanel(conv), { wrapper });

    let enviado: unknown;
    await act(async () => { enviado = await result.current.handleAudioSend(blob); });

    expect(enviado).toBe(true);
    expect(send.mutateAsync).toHaveBeenCalledTimes(1);
    expect(send.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conv-a',
      mediaPath: 'conv-a/audio.webm',
      mediaBucket: 'team-chat-files',
      mediaType: 'audio',
    }));
  });

  it('devolve false (e não chama upload nem envio) quando falta profile.id', async () => {
    auth.profile = { role: 'admin' };

    const { result } = renderHook(() => useTeamChatPanel(conv), { wrapper });

    let enviado: unknown;
    await act(async () => { enviado = await result.current.handleAudioSend(blob); });

    expect(enviado).toBe(false);
    expect(upload.uploadTeamMedia).not.toHaveBeenCalled();
    expect(send.mutateAsync).not.toHaveBeenCalled();
  });

  it('devolve false quando o upload não devolve locator', async () => {
    upload.uploadTeamMedia.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useTeamChatPanel(conv), { wrapper });

    let enviado: unknown;
    await act(async () => { enviado = await result.current.handleAudioSend(blob); });

    expect(enviado).toBe(false);
    expect(send.mutateAsync).not.toHaveBeenCalled();
  });

  it('devolve false e avisa na tela quando o envio rejeita', async () => {
    upload.uploadTeamMedia.mockResolvedValueOnce({
      mediaPath: 'conv-a/audio.webm',
      mediaBucket: 'team-chat-files',
    });
    send.mutateAsync.mockRejectedValueOnce(new Error('offline'));

    const { result } = renderHook(() => useTeamChatPanel(conv), { wrapper });

    let enviado: unknown;
    await act(async () => { enviado = await result.current.handleAudioSend(blob); });

    expect(enviado).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('Erro ao enviar áudio');
  });
});
