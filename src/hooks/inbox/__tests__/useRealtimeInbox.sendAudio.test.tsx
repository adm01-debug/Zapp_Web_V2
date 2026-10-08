/**
 * R2-INB-058 / #350-C — a ponte do Inbox precisa SINALIZAR a falha do áudio.
 *
 * Cadeia (elo de baixo): TextToAudioButton/AudioRecorder → ChatPanel
 * (`handlers.handleAudioSend(blob, onSendAudio)`) → `useRealtimeInbox.handleSendAudio`.
 * Enquanto esse elo RESOLVE na falha, quem está acima não tem como distinguir
 * "áudio enviado" de "áudio descartado" — e a prévia/gravação é jogada fora.
 *
 * Contrato provado aqui: `handleSendAudio` REJEITA quando não há contato
 * selecionado e quando `ChatService.uploadAudio`/`sendMessage` rejeita; resolve
 * `true` no sucesso (é o valor que o ChatPanel lê para fechar o gravador).
 * Mockado só o transporte (`ChatService`, `sendMessage`); o hook é o REAL.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { sendMessageMock, refetchMock, refetchSelectedMock, uploadAudioMock, toastErrorMock, uiState } = vi.hoisted(() => ({
  sendMessageMock: vi.fn(),
  refetchMock: vi.fn(),
  refetchSelectedMock: vi.fn(),
  uploadAudioMock: vi.fn(),
  toastErrorMock: vi.fn(),
  uiState: { selectedContactId: 'c1' as string | null },
}));

vi.mock('@/hooks/inbox/useInboxUIState', () => ({
  useInboxUIState: () => ({
    selectedContactId: uiState.selectedContactId,
    setSelectedContactId: vi.fn(),
    soundOn: true,
    setSoundOn: vi.fn(),
    setPendingContactId: vi.fn(),
  }),
}));
vi.mock('@/hooks/chat/useRealtimeMessages', () => ({
  useRealtimeMessages: () => ({
    conversations: [],
    loading: false,
    error: null,
    sendMessage: sendMessageMock,
    markAsRead: vi.fn(),
    refetch: refetchMock,
    newMessageNotification: null,
    dismissNotification: vi.fn(),
    setSelectedContact: vi.fn(),
    setSoundEnabled: vi.fn(),
  }),
}));
vi.mock('@/hooks/integrations/useExternalEvolution', () => ({
  useExternalConversations: () => ({ conversations: [], loading: false, error: null, refetch: vi.fn() }),
  useExternalMessages: () => ({ messages: [], loading: false, refetch: refetchSelectedMock }),
}));
vi.mock('@/hooks/system/useOfflineCache', () => ({
  useOfflineCache: () => ({ conversations: [], usingCache: false }),
}));
vi.mock('@/hooks/chat/useMessages', () => ({
  useMessages: () => ({
    messages: [],
    loading: false,
    refetch: refetchSelectedMock,
    hasOlder: false,
    loadingOlder: false,
    loadOlderMessages: vi.fn(),
    addMessage: vi.fn(),
    updateMessage: vi.fn(),
    removeMessage: vi.fn(),
  }),
}));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ profile: null }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));
vi.mock('@/services/chat.service', () => ({
  ChatService: { uploadAudio: uploadAudioMock },
}));
vi.mock('sonner', () => ({ toast: { error: toastErrorMock, success: vi.fn() } }));

import { useRealtimeInbox } from '@/hooks/inbox/useRealtimeInbox';

const blob = new Blob(['audio'], { type: 'audio/webm' });

beforeEach(() => {
  vi.clearAllMocks();
  uiState.selectedContactId = 'c1';
  uploadAudioMock.mockResolvedValue('audio/arquivo.webm');
  sendMessageMock.mockResolvedValue(undefined);
  refetchMock.mockResolvedValue(undefined);
  refetchSelectedMock.mockResolvedValue(undefined);
});

async function sendAudio() {
  const { result } = renderHook(() => useRealtimeInbox());
  let outcome: Promise<boolean> | undefined;
  await act(async () => {
    outcome = result.current.handleSendAudio(blob);
    // Evita "unhandled rejection" quando o contrato em teste é a rejeição.
    outcome.catch(() => undefined);
  });
  return outcome!;
}

describe('useRealtimeInbox.handleSendAudio — falha sinalizada ao chamador (#350-C)', () => {
  it('rejeita quando não há contato selecionado (não resolve em silêncio)', async () => {
    uiState.selectedContactId = null;

    await expect(sendAudio()).rejects.toThrow();

    expect(uploadAudioMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('rejeita com o erro do upload quando o envio do áudio falha', async () => {
    uploadAudioMock.mockRejectedValue(new Error('upload falhou'));

    await expect(sendAudio()).rejects.toThrow('upload falhou');

    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('rejeita com o erro do transporte quando a mensagem de áudio falha', async () => {
    sendMessageMock.mockRejectedValue(new Error('envio falhou'));

    await expect(sendAudio()).rejects.toThrow('envio falhou');

    expect(uploadAudioMock).toHaveBeenCalledWith('c1', blob);
  });

  it('resolve true no sucesso e encaminha o objeto de áudio ao transporte', async () => {
    await expect(sendAudio()).resolves.toBe(true);

    expect(uploadAudioMock).toHaveBeenCalledWith('c1', blob);
    expect(sendMessageMock).toHaveBeenCalledWith('c1', '[Áudio]', 'audio', 'audio/arquivo.webm');
  });

  it('não anuncia sucesso falso: falha do envio rejeita mesmo se o refresh cair', async () => {
    uploadAudioMock.mockRejectedValue(new Error('upload falhou'));
    refetchMock.mockRejectedValue(new Error('refresh falhou'));
    refetchSelectedMock.mockRejectedValue(new Error('refresh falhou'));

    await expect(sendAudio()).rejects.toThrow('upload falhou');
  });

  it('não duplica o aviso ao usuário (o toast fica na camada de cima)', async () => {
    uploadAudioMock.mockRejectedValue(new Error('upload falhou'));

    await expect(sendAudio()).rejects.toThrow('upload falhou');

    expect(toastErrorMock).not.toHaveBeenCalled();
  });
});
