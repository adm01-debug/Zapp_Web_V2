import { useEffect, useRef } from 'react';

/**
 * DL1 — realce da mensagem alvo de um link direto (deep link `?message=` ou
 * resultado da busca global).
 *
 * Contrato do cartão (modelo por tempo, não por render):
 * - a cada 250 ms procura o alvo por id ou `external_id` na lista carregada;
 * - até 20 tentativas; na 5ª tentativa chama `onLoadOlder` UMA única vez
 *   (paga a página anterior do histórico, caso o alvo esteja nela);
 * - se esgotar as 20 tentativas sem achar, chama `onNotFound` UMA vez
 *   (o consumidor mostra o toast "Mensagem não encontrada");
 * - ao desmontar ou trocar de alvo, limpa o timer: nenhum callback dispara
 *   depois.
 *
 * O teto de 20 tentativas é também o prazo do alvo: com ele o `ChatPanel`
 * sempre resolve (acha ou desiste com aviso) em no máximo 5 s, então o
 * `initialHighlightMessageId` nunca fica preso — mesmo quando o contrato de
 * paginação é desconhecido (`hasOlderMessages === undefined`) ou a lista
 * ainda está em carga.
 *
 * Entrega o resultado por callback (achar/desistir); a rolagem e o realce
 * são do cartão seguinte.
 */

/** Intervalo entre tentativas (ms) — contrato do cartão. */
export const HIGHLIGHT_ATTEMPT_INTERVAL_MS = 250;
/** Teto de tentativas antes de desistir com aviso — contrato do cartão. */
export const HIGHLIGHT_MAX_ATTEMPTS = 20;
/** Tentativa em que se paga a página anterior do histórico (UMA única vez). */
export const HIGHLIGHT_LOAD_OLDER_AT_ATTEMPT = 5;

export interface HighlightableMessage {
  id: string;
  external_id?: string | null;
}

export interface UseInitialHighlightOptions {
  /** Alvo do link direto: id interno ou `external_id`. */
  messageId: string | null | undefined;
  /** Mensagens já carregadas da conversa aberta (lidas via ref a cada tick). */
  messages: HighlightableMessage[];
  /** Paga a página anterior do histórico; chamado UMA vez, na 5ª tentativa. */
  onLoadOlder?: () => Promise<void> | void;
  /** Chamado UMA vez quando a mensagem aparece na lista; recebe o id interno real. */
  onFound: (messageId: string) => void;
  /** Chamado UMA vez quando as 20 tentativas esgotam sem a mensagem. */
  onNotFound?: (messageId: string) => void;
}

/** Procura o alvo pelo id interno ou pelo `external_id` (id do WhatsApp). */
export function findHighlightTarget(
  messages: HighlightableMessage[],
  messageId: string | null | undefined,
): HighlightableMessage | null {
  if (!messageId) return null;
  return messages.find(
    (message) => message.id === messageId
      || (message.external_id != null && message.external_id === messageId),
  ) ?? null;
}

export function useInitialHighlight({
  messageId,
  messages,
  onLoadOlder,
  onFound,
  onNotFound,
}: UseInitialHighlightOptions): void {
  // A lista mais recente: o timer lê aqui para não ser recriado a cada render
  // (mensagem nova do realtime não zera a contagem de tentativas).
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  });

  const callbacksRef = useRef({ onLoadOlder, onFound, onNotFound });
  useEffect(() => {
    callbacksRef.current = { onLoadOlder, onFound, onNotFound };
  });

  useEffect(() => {
    if (!messageId) return;
    const target = messageId;
    let attempts = 0;
    let settled = false;
    let olderPaid = false;

    const timer = setInterval(() => {
      if (settled) return;
      const found = findHighlightTarget(messagesRef.current, target);
      if (found) {
        settled = true;
        clearInterval(timer);
        callbacksRef.current.onFound(found.id);
        return;
      }
      attempts += 1;
      if (attempts === HIGHLIGHT_LOAD_OLDER_AT_ATTEMPT && !olderPaid) {
        olderPaid = true;
        // Dispara-e-esquece: o erro da paginação é do loader (publicado no
        // `error` dele); se a página não chegar, o teto de 20 tentativas
        // desiste com o aviso — o alvo nunca fica preso.
        try {
          const result = callbacksRef.current.onLoadOlder?.();
          if (result && typeof (result as Promise<unknown>).catch === 'function') {
            (result as Promise<unknown>).catch(() => {});
          }
        } catch {
          // Idem acima: engolir aqui não esconde falha — o aviso de
          // "não encontrada" ao esgotar é o sinal visível.
        }
      }
      if (attempts >= HIGHLIGHT_MAX_ATTEMPTS) {
        settled = true;
        clearInterval(timer);
        callbacksRef.current.onNotFound?.(target);
      }
    }, HIGHLIGHT_ATTEMPT_INTERVAL_MS);

    // Desmontou ou trocou de alvo: o timer morre aqui e nenhum callback
    // dispara depois (o `settled` trava a última execução concorrente).
    return () => {
      settled = true;
      clearInterval(timer);
    };
  }, [messageId]);
}
