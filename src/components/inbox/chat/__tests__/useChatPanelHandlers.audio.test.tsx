/**
 * R2-INB-022 (item 91 / P1) — "Falha ao enviar áudio desmonta gravador e descarta gravação recuperável".
 *
 * Cadeia do defeito: o `AudioRecorder` guarda o blob SÓ no próprio estado e é montado enquanto
 * `handlers.isRecordingAudio` for true. `useChatPanelHandlers.handleAudioSend` fechava o gravador
 * (`setIsRecordingAudio(false)`) INCONDICIONALMENTE — inclusive quando o envio falhava. Como a ponte
 * principal (`useRealtimeInbox.handleSendAudio`) engolia o erro, o popup nunca sabia da falha: o
 * usuário via "Tente novamente", mas o áudio já tinha sido descartado (componente desmontado).
 *
 * Provamos aqui a regra de fechamento do gravador diretamente no handler dono do estado:
 *   - falha do transporte (rejeição) => gravador PERMANECE aberto (blob recuperável)   [vermelho antes]
 *   - falha reportada pela ponte (retorno false) => gravador PERMANECE aberto          [vermelho antes]
 *   - sucesso => gravador fecha                                                        [regressão]
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));
vi.mock('@/lib/undoToast', () => ({ undoToast: vi.fn() }));
vi.mock('@/lib/ai-vocabulary', () => ({ normalizeOperationalPriority: vi.fn() }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/services/outbound-message.service', () => ({ sendOutboundMessage: vi.fn() }));
vi.mock('@/hooks/chat/useConversationActions', () => ({
  useConversationActions: () => ({
    isFavorite: () => false,
    favoriteContact: vi.fn(),
    unfavoriteContact: vi.fn(),
    snoozeConversation: vi.fn(),
  }),
}));
vi.mock('@/hooks/tasks/useMyWorkItems', () => ({
  useMyWorkItems: () => ({ createAndGetId: vi.fn() }),
  tomorrowAtNine: () => new Date(),
}));
vi.mock('@/hooks/system/useNavigationHistory', () => ({ navigateToView: vi.fn() }));

import { useChatPanelHandlers } from '../useChatPanelHandlers';

const baseOpts = {
  conversationId: 'conv-1',
  contactId: 'contact-1',
  contactPhone: '+5511999999999',
  instanceName: 'inst-1',
  onSendMessage: vi.fn(),
  editMessageApi: vi.fn(),
  applySignature: (t: string) => t,
  handleTypingStart: vi.fn(),
  handleTypingStop: vi.fn(),
  openDialog: vi.fn(),
  closeDialog: vi.fn(),
  handleSetActiveTool: vi.fn(),
};

const blob = new Blob(['audio'], { type: 'audio/webm' });

function renderHandlers() {
  return renderHook(() => useChatPanelHandlers(baseOpts));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useChatPanelHandlers — gravação de áudio sobrevive à falha de envio', () => {
  it('mantém o gravador aberto quando o transporte rejeita (recuperável para reenvio)', async () => {
    const { result } = renderHandlers();
    act(() => { result.current.setIsRecordingAudio(true); });

    await act(async () => {
      await result.current.handleAudioSend(blob, vi.fn().mockRejectedValue(new Error('upload falhou')));
    });

    expect(result.current.isRecordingAudio).toBe(true);
  });

  it('mantém o gravador aberto quando a ponte sinaliza falha por retorno false', async () => {
    const { result } = renderHandlers();
    act(() => { result.current.setIsRecordingAudio(true); });

    await act(async () => {
      await result.current.handleAudioSend(blob, vi.fn().mockResolvedValue(false));
    });

    expect(result.current.isRecordingAudio).toBe(true);
  });

  it('fecha o gravador quando o envio confirma (retorno true)', async () => {
    const { result } = renderHandlers();
    act(() => { result.current.setIsRecordingAudio(true); });

    await act(async () => {
      await result.current.handleAudioSend(blob, vi.fn().mockResolvedValue(true));
    });

    expect(result.current.isRecordingAudio).toBe(false);
  });

  it('reporta sucesso (true) e falha (false) para o chamador', async () => {
    const { result } = renderHandlers();

    let ok: unknown;
    await act(async () => {
      ok = await result.current.handleAudioSend(blob, vi.fn().mockResolvedValue(true));
    });
    expect(ok).toBe(true);

    let fail: unknown;
    await act(async () => {
      fail = await result.current.handleAudioSend(blob, vi.fn().mockResolvedValue(false));
    });
    expect(fail).toBe(false);
  });
});
