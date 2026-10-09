import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// R2-INB-007 (item 86 do BACKLOG_VERIFICADO): "Retry de texto duplica assinatura
// e rompe a idempotência". O handleSend aplicava a assinatura antes de enviar e,
// no erro, devolvia ao editor o texto JÁ assinado; o retry assinava de novo
// (duas assinaturas) e mudava o `content`, que participa da chave de idempotência
// do serviço (`actionKey` em src/services/outbound-message.service.ts). Resultado:
// um clientMessageId novo por tentativa e a duplicação que a retenção de ID
// tentava impedir.
//
// Contrato de `onSendMessage`: `(content, replyToId)`. O segundo argumento é o id
// da mensagem citada e sai como `null` quando não há resposta (R2-INB-001, ver
// useChatPanelHandlers.reply.test.tsx) — o payload assinado NUNCA é o único
// argumento. As asserções abaixo fixam os dois argumentos de propósito.
const mocks = vi.hoisted(() => ({
  undoToast: vi.fn(),
  toast: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: mocks.logError, debug: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/undoToast', () => ({
  undoToast: (...args: unknown[]) => mocks.undoToast(...args),
}));

vi.mock('@/lib/ai-vocabulary', () => ({
  normalizeOperationalPriority: () => ({ value: null }),
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  toast: (...args: unknown[]) => mocks.toast(...args),
}));

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
  tomorrowAtNine: () => new Date('2026-10-06T09:00:00.000Z'),
}));

vi.mock('@/hooks/system/useNavigationHistory', () => ({ navigateToView: vi.fn() }));

vi.mock('@/components/inbox/SlashCommands', () => ({}));

import { useChatPanelHandlers } from '../useChatPanelHandlers';

const ASSINATURA = '*Ana:';
const applySignature = (text: string) => `${ASSINATURA}*\n${text}`;

function montarHook(onSendMessage: (content: string, replyToId?: string | null) => Promise<void> | void) {
  return renderHook(() =>
    useChatPanelHandlers({
      conversationId: 'conv-1',
      contactId: 'contato-1',
      contactPhone: '5511999999999',
      instanceName: 'instancia-1',
      onSendMessage,
      editMessageApi: vi.fn(),
      applySignature,
      handleTypingStart: vi.fn(),
      handleTypingStop: vi.fn(),
      openDialog: vi.fn(),
      closeDialog: vi.fn(),
      handleSetActiveTool: vi.fn(),
    }),
  );
}

describe('useChatPanelHandlers — retry de texto não duplica a assinatura (R2-INB-007)', () => {
  beforeEach(() => {
    mocks.undoToast.mockReset();
    mocks.toast.mockReset();
    mocks.logError.mockReset();
  });

  it('restaura o texto ORIGINAL no erro e o retry mantém uma única assinatura', async () => {
    const onSendMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockResolvedValueOnce(undefined);
    const { result } = montarHook(onSendMessage);

    act(() => {
      result.current.setInputValue('Olá cliente');
    });

    // 1ª tentativa: envia o texto assinado uma única vez (sem resposta citada).
    await act(async () => {
      await result.current.handleSend();
    });

    expect(onSendMessage).toHaveBeenNthCalledWith(1, `${ASSINATURA}*\nOlá cliente`, null);

    // Após a falha (resultado ambíguo), o editor deve voltar com o texto SEM
    // assinatura — antes esta asserção falhava porque o payload assinado era
    // restaurado e o retry prefixava de novo.
    expect(result.current.inputValue).toBe('Olá cliente');

    // Retry: mesmo conteúdo → mesma chave de idempotência (clientMessageId reutilizado).
    await act(async () => {
      await result.current.handleSend();
    });

    expect(onSendMessage).toHaveBeenCalledTimes(2);
    expect(onSendMessage.mock.calls[1][0]).toBe(onSendMessage.mock.calls[0][0]);
    expect(onSendMessage.mock.calls[1][1]).toBe(onSendMessage.mock.calls[0][1]);
    expect(onSendMessage).toHaveBeenNthCalledWith(2, `${ASSINATURA}*\nOlá cliente`, null);
    // Sucesso limpa o editor e finaliza a ação (sem assinatura pendente).
    expect(result.current.inputValue).toBe('');
  });

  it('Desfazer também devolve o texto original sem assinatura', async () => {
    const onSendMessage = vi.fn().mockResolvedValue(undefined);
    const { result } = montarHook(onSendMessage);

    act(() => {
      result.current.setInputValue('Mensagem com undo');
    });

    await act(async () => {
      await result.current.handleSend();
    });

    expect(mocks.undoToast).toHaveBeenCalledTimes(1);
    const { onUndo } = mocks.undoToast.mock.calls[0][0] as { onUndo: () => void };

    act(() => {
      onUndo();
    });

    expect(result.current.inputValue).toBe('Mensagem com undo');
  });
});
