import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTeamChatPanel } from '@/components/team-chat/useTeamChatPanel';
import type { TeamConversation } from '@/hooks/team-chat/teamChatTypes';

// #350 (Talk X / team-chat) — `handleAudioSend` tem de SINALIZAR o resultado do envio:
// `true` só depois do envio confirmado, `false` em qualquer falha. O `TextToAudioButton`
// (corrigido em t_d892b7f3) só descarta a prévia do áudio gerado quando o envio confirma —
// `false` ou rejeição mantêm o áudio em tela para reenvio. Antes o hook resolvia
// `undefined` no sucesso E na falha, então a prévia do Talk X sumia mesmo quando o envio
// falhava. Aqui o hook é o REAL (`renderHook`); só o upload de mídia e o envio são
// controlados para fixar os desfechos do contrato.

const uploadMock = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({
  profile: { id: 'profile-1' } as { id: string } | null,
}));
const sendMutateAsync = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const logError = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/team-chat/uploadTeamMedia', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/team-chat/uploadTeamMedia')>();
  return { ...actual, uploadTeamMedia: uploadMock };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: { from: vi.fn() },
    from: vi.fn(),
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: authState.profile }),
}));

vi.mock('@/hooks/chat/useTeamChat', () => ({
  useSendTeamMessage: () => ({ mutateAsync: sendMutateAsync, isPending: false }),
  useDeleteTeamMessage: () => ({ mutateAsync: vi.fn() }),
  useEditTeamMessage: () => ({ mutateAsync: vi.fn() }),
  useToggleMuteConversation: () => ({ mutate: vi.fn() }),
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

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: logError,
  }),
}));

vi.mock('sonner', () => ({
  toast: { error: toastError, success: vi.fn(), warning: vi.fn(), info: vi.fn(), message: vi.fn() },
}));

const CONV = { id: 'conv-1' } as TeamConversation;
const LOCATOR = { mediaBucket: 'team-chat-files', mediaPath: 'profile-1/conv-1/uuid.webm' };

function renderPanel() {
  return renderHook(() => useTeamChatPanel(CONV));
}

/** Chama o envio dentro de `act` e devolve o retorno, sem descartar `undefined`. */
async function enviarAudio(): Promise<unknown> {
  const blob = new Blob(['audio'], { type: 'audio/webm' });
  const { result } = renderPanel();
  let retorno: unknown = 'envio-nao-executado';
  await act(async () => {
    retorno = await result.current.handleAudioSend(blob);
  });
  return retorno;
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.profile = { id: 'profile-1' };
  uploadMock.mockResolvedValue(LOCATOR);
  sendMutateAsync.mockResolvedValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('handleAudioSend sinaliza o resultado do envio (#350)', () => {
  it('envio confirmado devolve true', async () => {
    const retorno = await enviarAudio();

    expect(sendMutateAsync).toHaveBeenCalledTimes(1);
    expect(retorno).toBe(true);
  });

  it('rejeição do envio devolve false (não resolve undefined) e avisa o usuário', async () => {
    sendMutateAsync.mockRejectedValueOnce(new Error('falha de rede'));

    const retorno = await enviarAudio();

    expect(retorno).toBe(false);
    expect(logError).toHaveBeenCalledWith('Erro ao enviar áudio', expect.any(Error));
    expect(toastError).toHaveBeenCalledWith('Erro ao enviar áudio');
  });

  it('upload sem locator devolve false e não tenta enviar', async () => {
    uploadMock.mockResolvedValueOnce(null);

    const retorno = await enviarAudio();

    expect(retorno).toBe(false);
    expect(sendMutateAsync).not.toHaveBeenCalled();
  });

  it('sem profile autenticado devolve false (falha também não passa como sucesso)', async () => {
    authState.profile = null;

    const retorno = await enviarAudio();

    expect(retorno).toBe(false);
    expect(uploadMock).not.toHaveBeenCalled();
    expect(sendMutateAsync).not.toHaveBeenCalled();
  });
});
