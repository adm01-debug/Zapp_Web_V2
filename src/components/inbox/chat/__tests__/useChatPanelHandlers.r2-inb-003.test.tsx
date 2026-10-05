/**
 * R2-INB-003 / item 82 — o handler do construtor de mensagens interativas confirmava
 * o envio sem transporte: só exibia o toast de sucesso "Mensagem interativa enviada!"
 * enquanto nenhum enqueue/entrega era chamado e a composição era descartada.
 *
 * Prova (vermelho antes / verde depois): o contrato de envio do handler NÃO pode
 * resolver como se tivesse enviado. Sem transporte canônico para botões/lista, ele
 * rejeita com o motivo — e a UI mantém a composição.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useChatPanelHandlers, ENVIO_INTERATIVO_INDISPONIVEL } from '../useChatPanelHandlers';
import type { InteractiveMessage } from '@/types/chat';

const mocks = vi.hoisted(() => ({ toast: vi.fn() }));

vi.mock('@/lib/logger', () => ({ log: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: mocks.toast }));
vi.mock('@/lib/undoToast', () => ({ undoToast: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  },
}));
vi.mock('@/hooks/chat/useConversationActions', () => ({
  useConversationActions: () => ({
    isFavorite: false,
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

const opts = {
  conversationId: 'conv-1',
  contactId: 'contato-1',
  contactPhone: '+5511999999999',
  instanceName: 'inst-1',
  onSendMessage: vi.fn(),
  editMessageApi: vi.fn(),
  applySignature: (texto: string) => texto,
  handleTypingStart: vi.fn(),
  handleTypingStop: vi.fn(),
  openDialog: vi.fn(),
  closeDialog: vi.fn(),
  handleSetActiveTool: vi.fn(),
};

const mensagem: InteractiveMessage = {
  type: 'buttons',
  body: 'Escolha uma opção do menu',
  buttons: [{ id: 'b1', title: 'Atendimento', type: 'reply' }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useChatPanelHandlers — envio interativo (R2-INB-003)', () => {
  it('não confirma envio sem transporte: rejeita com o motivo e não anuncia sucesso', async () => {
    const { result } = renderHook(() => useChatPanelHandlers(opts));

    await expect(result.current.handleSendInteractiveMessage(mensagem)).rejects.toThrow(/indisponível/i);

    // O antigo toast de sucesso ("Mensagem interativa enviada!") não pode aparecer.
    expect(mocks.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/enviada/i) }),
    );
  });

  it('expõe o motivo do envio indisponível para a UI apresentar', () => {
    const { result } = renderHook(() => useChatPanelHandlers(opts));

    expect(result.current.interactiveSendUnavailableReason).toBe(ENVIO_INTERATIVO_INDISPONIVEL);
  });
});
