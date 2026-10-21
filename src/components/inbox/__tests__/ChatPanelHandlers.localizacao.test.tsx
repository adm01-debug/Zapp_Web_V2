/**
 * U7 (paridade V3→V2, doc 11) — `handleSendLocation` de `useChatPanelHandlers` não tinha
 * teste na V2 (a V3 tinha `handleSendLocation`, 4 casos).
 *
 * Contrato pinado aqui: o transporte recebe `messageType: 'location'` e o `content` como
 * JSON com latitude/longitude e, SÓ quando presentes, name/address; o sucesso confirma
 * via toast e a falha avisa em tom destrutivo e RELANÇA (o chamador precisa saber).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useChatPanelHandlers } from '../chat/useChatPanelHandlers';
import type { LocationMessage } from '@/types/chat';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  sendOutboundMessage: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({ log: { debug: vi.fn(), warn: vi.fn(), error: mocks.logError }, createLogger: () => ({ debug: vi.fn(), warn: vi.fn(), error: mocks.logError }) }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: mocks.toast }));
vi.mock('@/lib/undoToast', () => ({ undoToast: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  },
}));
vi.mock('@/services/outbound-message.service', () => ({
  sendOutboundMessage: mocks.sendOutboundMessage,
  sendRichOutboundMessage: vi.fn(),
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
  contactPhone: '+551****9999',
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendOutboundMessage.mockResolvedValue({ id: 'm1', status: 'sent', externalId: 'wa-1', idempotent: false });
});

describe('useChatPanelHandlers — handleSendLocation (U7)', () => {
  it('envia latitude/longitude como JSON com messageType location', async () => {
    const { result } = renderHook(() => useChatPanelHandlers(opts));
    const local: LocationMessage = { latitude: -23.55, longitude: -46.63 };

    await result.current.handleSendLocation(local);

    expect(mocks.sendOutboundMessage).toHaveBeenCalledTimes(1);
    const input = mocks.sendOutboundMessage.mock.calls[0][0];
    expect(input.contactId).toBe('contato-1');
    expect(input.messageType).toBe('location');
    expect(JSON.parse(input.content)).toEqual({ latitude: -23.55, longitude: -46.63 });
  });

  it('inclui name e address no content só quando informados', async () => {
    const { result } = renderHook(() => useChatPanelHandlers(opts));
    const local: LocationMessage = {
      latitude: -23.55,
      longitude: -46.63,
      name: 'Promo Brindes',
      address: 'Av. Paulista, 1000',
    };

    await result.current.handleSendLocation(local);

    expect(JSON.parse(mocks.sendOutboundMessage.mock.calls[0][0].content)).toEqual({
      latitude: -23.55,
      longitude: -46.63,
      name: 'Promo Brindes',
      address: 'Av. Paulista, 1000',
    });
  });

  it('confirma com toast de sucesso usando o nome do local como descrição', async () => {
    const { result } = renderHook(() => useChatPanelHandlers(opts));

    await result.current.handleSendLocation({ latitude: 1, longitude: 2, name: 'Depósito' });

    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/localiza/i), description: 'Depósito' }),
    );
  });

  it('em falha: avisa em tom destrutivo e relança para o chamador', async () => {
    mocks.sendOutboundMessage.mockRejectedValueOnce(new Error('canal indisponível'));
    const { result } = renderHook(() => useChatPanelHandlers(opts));

    await expect(result.current.handleSendLocation({ latitude: 1, longitude: 2 })).rejects.toThrow('canal indisponível');

    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive' }),
    );
    expect(mocks.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/enviada/i) }),
    );
    expect(mocks.logError).toHaveBeenCalled();
  });
});
