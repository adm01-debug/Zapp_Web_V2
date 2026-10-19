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

const { sendMessageMock, refetchMock, refetchSelectedMock, uploadAudioMock, toastErrorMock, toastMock, uiState } = vi.hoisted(() => ({
  sendMessageMock: vi.fn(),
  refetchMock: vi.fn(),
  refetchSelectedMock: vi.fn(),
  uploadAudioMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastMock: vi.fn(),
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
vi.mock('@/hooks/ui/use-toast', () => ({ toast: toastMock, useToast: () => ({ toast: toastMock }) }));

import { useRealtimeInbox } from '@/hooks/inbox/useRealtimeInbox';
import { MAX_PTT_SIZE_BYTES } from '@/lib/audio/pttLimits';

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
    expect(sendMessageMock).toHaveBeenCalledWith('c1', '[Áudio]', 'audio', 'audio/arquivo.webm', undefined, null, expect.any(String));
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

/**
 * PK-28 · paridade doc 06 — a citação junto do áudio.
 *
 * `handleSendMessage` já levava o id da resposta (R2-INB-001); a cadeia do áudio
 * parava antes do transporte e a gravação saía sem citação, mesmo com o gravador
 * aberto a partir da barra de resposta.
 */
describe('useRealtimeInbox.handleSendAudio — PK-28: citação da resposta', () => {
  it('o áudio citado viaja com o id da mensagem respondida até o transporte', async () => {
    const { result } = renderHook(() => useRealtimeInbox());

    await act(async () => {
      await result.current.handleSendAudio(blob, 'reply-audio-1');
    });

    expect(uploadAudioMock).toHaveBeenCalledWith('c1', blob);
    expect(sendMessageMock).toHaveBeenCalledWith(
      'c1', '[Áudio]', 'audio', 'audio/arquivo.webm', undefined, null, expect.any(String),
    );
  });

  it('sem resposta pendente o contrato continua igual (clientMessageId gerado automaticamente)', async () => {
    await expect(sendAudio()).resolves.toBe(true);

    expect(sendMessageMock).toHaveBeenCalledWith('c1', '[Áudio]', 'audio', 'audio/arquivo.webm', undefined, null, expect.any(String));
  });
});

// PE-24 — o áudio fora dos limites do WhatsApp não pode subir. A recusa é ANTES do
// `ChatService.uploadAudio` e o motivo é avisado aqui: é esta camada que conhece a
// mensagem exata da validação (a de cima só tem o texto genérico).
describe('useRealtimeInbox.handleSendAudio — limites de PTT antes do upload (PE-24)', () => {
  async function sendAudioBlob(audio: Blob) {
    const { result } = renderHook(() => useRealtimeInbox());
    let outcome: Promise<boolean> | undefined;
    await act(async () => {
      outcome = result.current.handleSendAudio(audio);
      outcome.catch(() => undefined);
    });
    return outcome!;
  }

  it('recusa áudio acima de 16 MB sem chamar o upload e explica o motivo', async () => {
    const grande = { size: MAX_PTT_SIZE_BYTES + 1, type: 'audio/webm' } as Blob;

    await expect(sendAudioBlob(grande)).rejects.toThrow(/muito grande/);

    expect(uploadAudioMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Áudio não enviado',
      description: expect.stringContaining('muito grande'),
      variant: 'destructive',
    });
  });

  it('recusa áudio vazio sem chamar o upload', async () => {
    await expect(sendAudioBlob(new Blob([]))).rejects.toThrow('Áudio vazio. Tente gravar novamente.');

    expect(uploadAudioMock).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith({
      title: 'Áudio não enviado',
      description: 'Áudio vazio. Tente gravar novamente.',
      variant: 'destructive',
    });
  });

  it('segue enviando quando o áudio está dentro dos limites, sem avisar', async () => {
    await expect(sendAudioBlob(blob)).resolves.toBe(true);

    expect(uploadAudioMock).toHaveBeenCalledWith('c1', blob);
    expect(toastMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });
});
