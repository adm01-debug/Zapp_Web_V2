/**
 * IB1 — o clique num botão de mensagem interativa tem de RESPONDER ao cliente.
 *
 * Antes: `handleInteractiveButtonClick` só mostrava o aviso 'Botão clicado' e não
 * enviava nada. Agora o título do botão sai como texto pelo caminho de envio
 * canônico do compositor (`onSendMessage`), com trava contra duplo clique/erro.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { InteractiveButton, Message } from '@/types/chat';

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
import { toast } from '@/hooks/ui/use-toast';

const BOTAO: InteractiveButton = { id: 'b1', title: 'Sim, quero!' } as InteractiveButton;

const MENSAGEM_RESPONDIDA = {
  id: 'msg-reply-1',
  content: 'mensagem original',
  sender: 'contact',
  timestamp: new Date('2026-10-05T12:00:00Z'),
  type: 'text',
} as Message;

function montar(onSendMessage: (content: string, replyToId?: string | null) => Promise<void> | void) {
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
    }),
  );
}

describe('useChatPanelHandlers — botão interativo responde ao cliente (IB1)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('um clique envia o título do botão uma vez e não mostra mais o aviso fake', async () => {
    const onSendMessage = vi.fn();
    const { result } = montar(onSendMessage);

    await act(async () => {
      await result.current.handleInteractiveButtonClick(BOTAO);
    });

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage).toHaveBeenCalledWith('Sim, quero!', null);
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Botão clicado' }));
  });

  it('usa o id como fallback quando o botão não tem título', async () => {
    const onSendMessage = vi.fn();
    const { result } = montar(onSendMessage);

    await act(async () => {
      await result.current.handleInteractiveButtonClick({ id: 'b1' } as InteractiveButton);
    });

    expect(onSendMessage).toHaveBeenCalledWith('b1', null);
  });

  it('referencia a resposta do compositor como reply_to quando houver', async () => {
    const onSendMessage = vi.fn();
    const { result } = montar(onSendMessage);

    act(() => {
      result.current.handleReplyToMessage(MENSAGEM_RESPONDIDA);
    });
    await act(async () => {
      await result.current.handleInteractiveButtonClick(BOTAO);
    });

    expect(onSendMessage).toHaveBeenCalledWith('Sim, quero!', 'msg-reply-1');
  });

  it('duplo clique no mesmo botão envia uma única vez (janela de 5 s)', async () => {
    const onSendMessage = vi.fn();
    const { result } = montar(onSendMessage);

    await act(async () => {
      await result.current.handleInteractiveButtonClick(BOTAO);
      await result.current.handleInteractiveButtonClick(BOTAO);
    });

    expect(onSendMessage).toHaveBeenCalledTimes(1);
  });

  it('clique durante o envio em andamento não duplica (trava)', async () => {
    let resolver: () => void = () => {};
    const onSendMessage = vi.fn(
      () => new Promise<void>((resolve) => { resolver = () => resolve(); }),
    );
    const { result } = montar(onSendMessage);

    let primeira: Promise<void> | undefined;
    act(() => {
      primeira = result.current.handleInteractiveButtonClick(BOTAO) as Promise<void>;
    });
    // Segundo clique com o primeiro envio ainda em andamento.
    await act(async () => {
      await result.current.handleInteractiveButtonClick(BOTAO);
    });

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    await act(async () => { resolver(); await primeira; });
    expect(onSendMessage).toHaveBeenCalledTimes(1);
  });

  it('falha mostra erro, não marca dedup e libera a trava para nova tentativa', async () => {
    const onSendMessage = vi.fn()
      .mockRejectedValueOnce(new Error('delivery indisponível'))
      .mockResolvedValueOnce(undefined);
    const { result } = montar(onSendMessage);

    await act(async () => {
      await result.current.handleInteractiveButtonClick(BOTAO);
    });

    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Erro ao responder',
      variant: 'destructive',
    }));

    await act(async () => {
      await result.current.handleInteractiveButtonClick(BOTAO);
    });

    expect(onSendMessage).toHaveBeenCalledTimes(2);
    expect(toast).toHaveBeenCalledTimes(1);
  });
});
