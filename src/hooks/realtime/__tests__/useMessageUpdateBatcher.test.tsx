/**
 * Paridade V3 -> V2 (doc 06) — batcher de UPDATE de mensagem.
 *
 * `useMessageUpdateBatcher` junta vários UPDATEs de status (enviado -> entregue ->
 * lido) num único commit por janela de 100 ms e hidrata a conversa quando o contato
 * ainda não está na lista. Não havia teste; um erro aqui faz o tick da bolha voltar
 * atrás (o update antigo sobrescreve o novo) ou a conversa nova nunca aparecer.
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { useMessageUpdateBatcher } from '@/hooks/realtime/useMessageUpdateBatcher';
import type {
  RealtimeMessage,
  ConversationContact,
  ConversationWithMessages,
} from '@/hooks/chat/useRealtimeMessages';

function msg(over: Partial<RealtimeMessage> & { id: string }): RealtimeMessage {
  return {
    contact_id: 'c1',
    sender: 'agent',
    content: 'texto',
    message_type: 'text',
    media_url: null,
    status: 'sent',
    created_at: '2026-10-11T10:00:00.000Z',
    status_updated_at: null,
    is_read: true,
    ...over,
  } as unknown as RealtimeMessage;
}

function conversaCom(mensagem: RealtimeMessage, contactId = 'c1'): ConversationWithMessages {
  return {
    contact: { id: contactId, name: 'Contato', created_at: '2026-10-11T09:00:00.000Z' } as unknown as ConversationContact,
    messages: [mensagem],
    unreadCount: 0,
    lastMessage: mensagem,
  };
}

function setup(initial: ConversationWithMessages[]) {
  const conversationsRef = { current: initial };
  const commitConversations = vi.fn(
    (updater: (prev: ConversationWithMessages[]) => ConversationWithMessages[]) => {
      conversationsRef.current = updater(conversationsRef.current);
    },
  );
  const hydrateConversationForMessage = vi.fn().mockResolvedValue(undefined);

  const { result } = renderHook(() =>
    useMessageUpdateBatcher(conversationsRef, commitConversations, hydrateConversationForMessage),
  );

  return { result, conversationsRef, commitConversations, hydrateConversationForMessage };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useMessageUpdateBatcher — agrupa UPDATE em um commit (100 ms)', () => {
  it('dois UPDATEs do mesmo id na janela viram UM commit, com o estado final', () => {
    const contexto = setup([conversaCom(msg({ id: 'm1', status: 'sent' }))]);

    act(() => {
      contexto.result.current.handleMessageUpdate({
        new: msg({ id: 'm1', status: 'delivered' }),
      } as never);
      contexto.result.current.handleMessageUpdate({
        new: msg({ id: 'm1', status: 'read' }),
      } as never);
    });

    // Nada commitado antes da janela fechar.
    expect(contexto.commitConversations).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(contexto.commitConversations).toHaveBeenCalledTimes(1);
    expect(contexto.conversationsRef.current[0].messages[0].status).toBe('read');
  });

  it('UPDATE de mensagem que não existe na conversa não muda nada', () => {
    const original = conversaCom(msg({ id: 'm1' }));
    const contexto = setup([original]);

    act(() => {
      contexto.result.current.handleMessageUpdate({ new: msg({ id: 'inexistente' }) } as never);
      vi.advanceTimersByTime(100);
    });

    // Mesmo commitando, o updater devolve a MESMA conversa (nenhuma mudança).
    expect(contexto.conversationsRef.current[0]).toBe(original);
  });
});

describe('useMessageUpdateBatcher — hidrata contato fora da lista', () => {
  it('contato desconhecido dispara hydrate e não commita', () => {
    const contexto = setup([]);

    act(() => {
      contexto.result.current.handleMessageUpdate({ new: msg({ id: 'm9', contact_id: 'c9' }) } as never);
      vi.advanceTimersByTime(100);
    });

    expect(contexto.hydrateConversationForMessage).toHaveBeenCalledTimes(1);
    expect(contexto.hydrateConversationForMessage.mock.calls[0][0].contact_id).toBe('c9');
    expect(contexto.commitConversations).not.toHaveBeenCalled();
  });

  it('UPDATE sem contact_id é ignorado (nada de hydrate nem commit)', () => {
    const contexto = setup([conversaCom(msg({ id: 'm1' }))]);

    act(() => {
      contexto.result.current.handleMessageUpdate({
        new: msg({ id: 'm1', contact_id: null as unknown as string }),
      } as never);
      vi.advanceTimersByTime(100);
    });

    expect(contexto.hydrateConversationForMessage).not.toHaveBeenCalled();
    expect(contexto.commitConversations).not.toHaveBeenCalled();
  });
});
