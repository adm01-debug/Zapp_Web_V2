/**
 * Retentativa de áudio no Inbox — idempotência POR GRAVAÇÃO.
 *
 * Sintoma: quando a resposta de um despacho se perde depois de o POST já ter saído
 * (rede do celular, 502 do gateway), o usuário toca em "enviar" de novo. Como cada
 * tentativa subia um arquivo NOVO (nome com `Date.now()`) e mandava outro
 * `client_message_id`, o WhatsApp do cliente recebia DUAS notas de voz iguais.
 *
 * Contrato provado aqui: enquanto a entrega de uma gravação não é confirmada, a
 * retentativa da MESMA gravação reenvia o objeto já subido e o MESMO
 * `client_message_id` (o `UNIQUE (contact_id, client_message_id)` do servidor
 * deduplica). Gravação nova, conversa nova ou descarte explícito (cancelamento)
 * geram upload e id próprios. Envio aceito encerra a retentativa.
 *
 * Mockado só o transporte (`ChatService.uploadAudio`, `sendMessage`); o hook é o REAL.
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

const gravacao1 = new Blob(['audio-1'], { type: 'audio/webm' });
const gravacao2 = new Blob(['audio-2'], { type: 'audio/webm' });

/** Url de mídia (4º argumento) e id de entrega (7º) de cada chamada ao transporte. */
const urlDaChamada = (i: number) => sendMessageMock.mock.calls[i][3] as string;
const idDaChamada = (i: number) => sendMessageMock.mock.calls[i][6] as string;

function renderInbox() {
  return renderHook(() => useRealtimeInbox());
}

async function tentarEnvio(
  result: { current: { handleSendAudio: (blob: Blob) => Promise<boolean> } },
  blob: Blob,
) {
  let outcome: Promise<boolean> | undefined;
  await act(async () => {
    outcome = result.current.handleSendAudio(blob);
    // Evita "unhandled rejection" quando o contrato em teste é a rejeição.
    outcome.catch(() => undefined);
  });
  return outcome!;
}

beforeEach(() => {
  vi.clearAllMocks();
  uiState.selectedContactId = 'c1';
  uploadAudioMock.mockResolvedValue('audio/arquivo.webm');
  sendMessageMock.mockResolvedValue(undefined);
  refetchMock.mockResolvedValue(undefined);
  refetchSelectedMock.mockResolvedValue(undefined);
});

describe('useRealtimeInbox.handleSendAudio — retentativa idempotente da mesma gravação', () => {
  it('reusa o objeto já subido e o MESMO client_message_id na retentativa', async () => {
    // O primeiro upload tem url própria: se a retentativa subir de novo, a url muda.
    uploadAudioMock
      .mockResolvedValueOnce('audio/primeiro.webm')
      .mockResolvedValue('audio/segundo.webm');
    sendMessageMock.mockRejectedValueOnce(new Error('resposta perdida'));

    const { result } = renderInbox();

    await expect(tentarEnvio(result, gravacao1)).rejects.toThrow('resposta perdida');
    await expect(tentarEnvio(result, gravacao1)).resolves.toBe(true);

    expect(uploadAudioMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).toHaveBeenCalledTimes(2);
    expect(urlDaChamada(1)).toBe('audio/primeiro.webm');
    expect(urlDaChamada(1)).toBe(urlDaChamada(0));
    expect(idDaChamada(0)).toMatch(/^[0-9a-f-]{36}$/);
    expect(idDaChamada(1)).toBe(idDaChamada(0));
  });

  it('gravação nova (o usuário gravou de novo) tem upload e id próprios', async () => {
    uploadAudioMock
      .mockResolvedValueOnce('audio/primeiro.webm')
      .mockResolvedValue('audio/segundo.webm');
    sendMessageMock.mockRejectedValueOnce(new Error('resposta perdida'));

    const { result } = renderInbox();

    await expect(tentarEnvio(result, gravacao1)).rejects.toThrow('resposta perdida');
    await expect(tentarEnvio(result, gravacao2)).resolves.toBe(true);

    expect(uploadAudioMock).toHaveBeenCalledTimes(2);
    expect(uploadAudioMock.mock.calls[1][1]).toBe(gravacao2);
    expect(urlDaChamada(1)).toBe('audio/segundo.webm');
    expect(idDaChamada(1)).not.toBe(idDaChamada(0));
  });

  it('descartar a gravação (cancelamento) volta a subir e a gerar id novo', async () => {
    uploadAudioMock
      .mockResolvedValueOnce('audio/primeiro.webm')
      .mockResolvedValue('audio/segundo.webm');
    sendMessageMock.mockRejectedValueOnce(new Error('resposta perdida'));

    const { result } = renderInbox();

    await expect(tentarEnvio(result, gravacao1)).rejects.toThrow('resposta perdida');

    act(() => {
      result.current.discardPendingAudioSend();
    });

    await expect(tentarEnvio(result, gravacao1)).resolves.toBe(true);

    expect(uploadAudioMock).toHaveBeenCalledTimes(2);
    expect(idDaChamada(1)).not.toBe(idDaChamada(0));
  });

  it('envio aceito encerra a retentativa: a mesma gravação reenviada é ação nova', async () => {
    const { result } = renderInbox();

    await expect(tentarEnvio(result, gravacao1)).resolves.toBe(true);
    await expect(tentarEnvio(result, gravacao1)).resolves.toBe(true);

    expect(uploadAudioMock).toHaveBeenCalledTimes(2);
    expect(idDaChamada(1)).not.toBe(idDaChamada(0));
  });

  it('troca de conversa não reusa o id da conversa anterior', async () => {
    uploadAudioMock
      .mockResolvedValueOnce('audio/primeiro.webm')
      .mockResolvedValue('audio/segundo.webm');
    sendMessageMock.mockRejectedValueOnce(new Error('resposta perdida'));

    const { result, rerender } = renderInbox();

    await expect(tentarEnvio(result, gravacao1)).rejects.toThrow('resposta perdida');

    uiState.selectedContactId = 'c2';
    await act(async () => {
      rerender();
    });

    await expect(tentarEnvio(result, gravacao1)).resolves.toBe(true);

    expect(sendMessageMock.mock.calls[1][0]).toBe('c2');
    expect(uploadAudioMock).toHaveBeenCalledTimes(2);
    expect(idDaChamada(1)).not.toBe(idDaChamada(0));
  });
});
