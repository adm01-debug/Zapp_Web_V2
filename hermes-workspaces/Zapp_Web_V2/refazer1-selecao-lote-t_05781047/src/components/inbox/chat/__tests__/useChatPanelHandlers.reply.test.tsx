/**
 * R2-INB-001 — a resposta/citação escolhida no Composer perde o id antes do transporte.
 *
 * `handleSend` lê `replyToMessage`, limpa o preview e desmonta o vínculo: a string
 * assinada ia sozinha para `onSendMessage`, então o destinatário recebia texto puro,
 * sem citação. O teste fixa o contrato: o id da mensagem respondida precisa seguir
 * junto (segundo argumento) para o transporte.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Message } from '@/types/chat';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
  },
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
  tomorrowAtNine: () => new Date('2026-10-06T12:00:00Z'),
}));
vi.mock('@/hooks/system/useNavigationHistory', () => ({ navigateToView: vi.fn() }));
vi.mock('@/lib/undoToast', () => ({ undoToast: vi.fn() }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));

import { useChatPanelHandlers } from '../useChatPanelHandlers';

const MENSAGEM_RESPONDIDA = {
  id: 'msg-reply-1',
  content: 'mensagem original',
  sender: 'contact',
  timestamp: new Date('2026-10-05T12:00:00Z'),
  type: 'text',
} as Message;

function montar(onSendMessage: (content: string, replyToId?: string | null) => void) {
  return renderHook(() =>
    useChatPanelHandlers({
      conversationId: 'conv-1',
      contactId: 'contact-1',
      contactPhone: '5511999999999',
      instanceName: 'inst',
      onSendMessage,
      editMessageApi: vi.fn(),
      applySignature: (t: string) => t,
      handleTypingStart: vi.fn(),
      handleTypingStop: vi.fn(),
      openDialog: vi.fn(),
      closeDialog: vi.fn(),
      handleSetActiveTool: vi.fn(),
    })
  );
}

describe('useChatPanelHandlers — resposta preserva o id citado (R2-INB-001)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('encaminha o id da mensagem respondida para onSendMessage', async () => {
    const onSendMessage = vi.fn();
    const { result } = montar(onSendMessage);

    act(() => {
      result.current.handleReplyToMessage(MENSAGEM_RESPONDIDA);
    });
    await act(async () => {
      result.current.setInputValue('resposta');
    });
    await act(async () => {
      await result.current.handleSend();
    });

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage).toHaveBeenCalledWith('resposta', 'msg-reply-1');
  });

  it('envio sem resposta segue com replyToId nulo (não inventa vínculo)', async () => {
    const onSendMessage = vi.fn();
    const { result } = montar(onSendMessage);

    await act(async () => {
      result.current.setInputValue('sem resposta');
    });
    await act(async () => {
      await result.current.handleSend();
    });

    expect(onSendMessage).toHaveBeenCalledWith('sem resposta', null);
  });
});
