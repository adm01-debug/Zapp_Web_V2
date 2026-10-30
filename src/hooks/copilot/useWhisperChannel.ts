/**
 * CV-122 — Canal de sussúrro supervisor → vendedor.
 *
 * Permite ao supervisor enviar orientações privadas ao vendedor durante a
 * conversa sem que o cliente veja. O vendedor recebe o "sussúrro" como
 * uma anotação no painel RADAR, não como mensagem enviada ao contato.
 * Stub — integração com canal Realtime pendente de CV-011.
 */
import { useState, useCallback, useEffect } from 'react';

export interface WhisperMessage {
  id: string;
  supervisorName: string;
  text: string;
  receivedAt: Date;
  /** False até o vendedor clicar em "ok". */
  acknowledged: boolean;
}

export interface WhisperChannelState {
  messages: WhisperMessage[];
  unreadCount: number;
  /** Marca uma mensagem como lida. */
  acknowledge: (id: string) => void;
  /** Limpa mensagens lidas há mais de 5 minutos. */
  clearOld: () => void;
}

export interface UseWhisperChannelOptions {
  conversationId: string;
  /** Função de subscribe — injetável para testes; default é no-op até Realtime estar pronto. */
  subscribe?: (
    conversationId: string,
    onMessage: (msg: Omit<WhisperMessage, 'acknowledged'>) => void,
  ) => () => void;
}

const DEFAULT_SUBSCRIBE = (
  _conversationId: string,
  _onMessage: (msg: Omit<WhisperMessage, 'acknowledged'>) => void,
) => () => {};

export function useWhisperChannel({
  conversationId,
  subscribe = DEFAULT_SUBSCRIBE,
}: UseWhisperChannelOptions): WhisperChannelState {
  const [messages, setMessages] = useState<WhisperMessage[]>([]);

  useEffect(() => {
    const unsubscribe = subscribe(conversationId, (msg) => {
      setMessages((prev) => [...prev, { ...msg, acknowledged: false }]);
    });
    return unsubscribe;
  }, [conversationId, subscribe]);

  const acknowledge = useCallback((id: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, acknowledged: true } : m)),
    );
  }, []);

  const clearOld = useCallback(() => {
    const cutoff = Date.now() - 5 * 60 * 1000;
    setMessages((prev) =>
      prev.filter((m) => !m.acknowledged || m.receivedAt.getTime() > cutoff),
    );
  }, []);

  return {
    messages,
    unreadCount: messages.filter((m) => !m.acknowledged).length,
    acknowledge,
    clearOld,
  };
}
