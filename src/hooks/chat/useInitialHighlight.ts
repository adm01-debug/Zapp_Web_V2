import { useEffect, useRef } from 'react';

/**
 * DL1 — realce da mensagem alvo de um link direto (deep link `?message=` ou
 * resultado da busca global).
 *
 * O alvo pode chegar como id interno (UUID) ou como `external_id` (id do
 * WhatsApp, o que um link colado de outro sistema costuma carregar), então a
 * procura cobre os dois. A mensagem pode estar fora da primeira página do
 * histórico — nesse caso o hook paga a paginação anterior (`loadOlderMessages`)
 * até encontrá-la. Só desiste (e avisa) quando o histórico realmente acabou:
 * `hasOlderMessages === false`. Enquanto o contrato de paginação for
 * desconhecido (`undefined`), o hook espera em vez de acusar "não encontrada" —
 * assim uma lista ainda em carga nunca produz o aviso falso.
 *
 * Os callbacks disparam UMA vez por alvo: cada efeito roda de novo a cada
 * mensagem nova, e sem a trava o realce/aviso repetiriam.
 */

export interface HighlightableMessage {
  id: string;
  external_id?: string | null;
}

export interface UseInitialHighlightOptions {
  /** Alvo do link direto: id interno ou `external_id`. */
  messageId: string | null | undefined;
  /** Mensagens já carregadas da conversa aberta. */
  messages: HighlightableMessage[];
  /** Há histórico mais antigo a paginar. `undefined` = contrato ausente (não desiste). */
  hasOlderMessages?: boolean;
  /** Paginação em andamento — evita chamadas concorrentes. */
  loadingOlderMessages?: boolean;
  /** Paga a página anterior do histórico. */
  loadOlderMessages?: () => Promise<void> | void;
  /** Chamado UMA vez quando a mensagem aparece na lista; recebe o id interno real. */
  onFound: (messageId: string) => void;
  /** Chamado UMA vez quando o histórico acaba sem a mensagem. */
  onNotFound?: (messageId: string) => void;
  /** Teto de páginas paginadas antes de desistir (default 5). */
  maxRounds?: number;
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
  hasOlderMessages,
  loadingOlderMessages,
  loadOlderMessages,
  onFound,
  onNotFound,
  maxRounds = 5,
}: UseInitialHighlightOptions): void {
  const roundsRef = useRef(0);
  const targetRef = useRef<string | null>(null);
  const settledRef = useRef<string | null>(null);
  const callbacksRef = useRef({ onFound, onNotFound });
  useEffect(() => {
    callbacksRef.current = { onFound, onNotFound };
  });

  // Alvo novo (outro deep link, ou conversa A → B): zera rodadas e trava, para
  // um resultado atrasado da conversa anterior não contaminar a nova.
  useEffect(() => {
    if (messageId !== targetRef.current) {
      targetRef.current = messageId ?? null;
      roundsRef.current = 0;
      settledRef.current = null;
    }
  }, [messageId]);

  useEffect(() => {
    if (!messageId || settledRef.current === messageId) return;

    const found = findHighlightTarget(messages, messageId);
    if (found) {
      settledRef.current = messageId;
      callbacksRef.current.onFound(found.id);
      return;
    }

    // Paginação em voo: espera a próxima lista antes de decidir.
    if (loadingOlderMessages) return;

    if (hasOlderMessages === false) {
      settledRef.current = messageId;
      callbacksRef.current.onNotFound?.(messageId);
      return;
    }

    // Contrato desconhecido (undefined): aguarda em vez de acusar falso negativo.
    if (hasOlderMessages === undefined) return;

    if (loadOlderMessages && roundsRef.current < maxRounds) {
      roundsRef.current += 1;
      void loadOlderMessages();
      return;
    }

    // Teto de paginação atingido (ou não há como paginar): desiste com aviso,
    // para o painel não ficar num realce que nunca chega.
    settledRef.current = messageId;
    callbacksRef.current.onNotFound?.(messageId);
  }, [messageId, messages, hasOlderMessages, loadingOlderMessages, loadOlderMessages, maxRounds]);
}
