/**
 * R2-INB-003 / item 82 — transporte canônico das mensagens interativas.
 *
 * Antes: o handler confirmava o envio sem transporte (toast de sucesso sem nada
 * entregue); depois passou a rejeitar com "indisponível". Agora o transporte
 * existe: o handler enfileira a composição via `sendRichOutboundMessage`
 * (enqueue_rich_outbound_message → message-delivery → sendButtons/sendList),
 * resolve SÓ no aceite e rejeita em falha — o builder preserva a composição.
 *
 * Prova (vermelho antes / verde depois): os três tipos (botões, lista e CTA URL
 * — botão type 'url', não tipo novo) chegam ao transporte no payload canônico,
 * e uma rejeição do transporte propaga a falha sem toast de sucesso.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useChatPanelHandlers } from '../useChatPanelHandlers';
import type { InteractiveMessage } from '@/types/chat';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  sendRichOutboundMessage: vi.fn(),
  sendOutboundMessage: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({ log: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: mocks.toast }));
vi.mock('@/lib/undoToast', () => ({ undoToast: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  },
}));
vi.mock('@/services/outbound-message.service', () => ({
  sendRichOutboundMessage: mocks.sendRichOutboundMessage,
  sendOutboundMessage: mocks.sendOutboundMessage,
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

const botoes: InteractiveMessage = {
  type: 'buttons',
  body: 'Escolha uma opção do menu',
  footer: 'Promo Brindes',
  buttons: [{ id: 'b1', title: 'Atendimento', type: 'reply' }],
};

const lista: InteractiveMessage = {
  type: 'list',
  body: 'Selecione uma categoria',
  listButtonText: 'Ver opções',
  sections: [
    { title: 'Produtos', rows: [{ id: 'r1', title: 'Smartphones', description: 'Linha completa' }] },
  ],
};

const ctaUrl: InteractiveMessage = {
  type: 'buttons',
  body: 'Confira a oferta',
  header: { type: 'text', text: 'Oferta da semana' },
  buttons: [{ id: 'b-url', title: 'Ver oferta', type: 'url', url: 'https://loja.example/oferta' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendRichOutboundMessage.mockResolvedValue({ id: 'm1', status: 'sent', externalId: 'wa-1', idempotent: false });
});

describe('useChatPanelHandlers — envio interativo real (R2-INB-003)', () => {
  it('botões: enfileira no transporte com o payload canônico e confirma só após o aceite', async () => {
    const { result } = renderHook(() => useChatPanelHandlers(opts));

    await result.current.handleSendInteractiveMessage(botoes);

    expect(mocks.sendRichOutboundMessage).toHaveBeenCalledTimes(1);
    const input = mocks.sendRichOutboundMessage.mock.calls[0][0];
    expect(input.contactId).toBe('contato-1');
    expect(input.messageType).toBe('buttons');
    expect(input.deliveryPayload).toEqual({
      body: 'Escolha uma opção do menu',
      footer: 'Promo Brindes',
      buttons: [{ type: 'reply', displayText: 'Atendimento', id: 'b1' }],
    });
    expect(input.displayContent).toContain('Escolha uma opção do menu');
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/enviada/i) }),
    );
  });

  it('lista: enfileira com buttonText e sections/rows no shape canônico', async () => {
    const { result } = renderHook(() => useChatPanelHandlers(opts));

    await result.current.handleSendInteractiveMessage(lista);

    const input = mocks.sendRichOutboundMessage.mock.calls[0][0];
    expect(input.messageType).toBe('list');
    expect(input.deliveryPayload).toEqual({
      body: 'Selecione uma categoria',
      buttonText: 'Ver opções',
      sections: [
        { title: 'Produtos', rows: [{ id: 'r1', title: 'Smartphones', description: 'Linha completa' }] },
      ],
    });
  });

  it('CTA URL: vai como botão type url dentro de buttons (não é tipo novo)', async () => {
    const { result } = renderHook(() => useChatPanelHandlers(opts));

    await result.current.handleSendInteractiveMessage(ctaUrl);

    const input = mocks.sendRichOutboundMessage.mock.calls[0][0];
    expect(input.messageType).toBe('buttons');
    expect(input.deliveryPayload.title).toBe('Oferta da semana');
    expect(input.deliveryPayload.buttons).toEqual([
      { type: 'url', displayText: 'Ver oferta', id: 'b-url', url: 'https://loja.example/oferta' },
    ]);
  });

  it('rejeição do transporte: propaga a falha (composição preservada) sem toast de sucesso', async () => {
    mocks.sendRichOutboundMessage.mockRejectedValue(new Error('no_connected_whatsapp_connection'));
    const { result } = renderHook(() => useChatPanelHandlers(opts));

    await expect(result.current.handleSendInteractiveMessage(botoes)).rejects.toThrow('no_connected_whatsapp_connection');

    expect(mocks.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/enviada/i) }),
    );
  });

  it('o envio interativo não tem mais motivo de indisponibilidade', () => {
    const { result } = renderHook(() => useChatPanelHandlers(opts));

    expect(result.current.interactiveSendUnavailableReason).toBeNull();
  });
});
