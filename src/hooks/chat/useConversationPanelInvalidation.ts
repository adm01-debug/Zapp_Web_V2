import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { contactCrm360Key } from '@/hooks/crm/useContactCrm360';
import { contactStatsKey } from '@/hooks/crm/useContactStats';
import { nextBestActionKey } from '@/hooks/chat/useNextBestAction';

/**
 * Janela de agrupamento da invalidação. Uma conversa movimentada entrega dezenas de eventos
 * de realtime em segundos (INSERT + status + ack, dezenas de mensagens em rajada); invalidar
 * por evento saturava a fila de requisições do painel — era o RCA da V3. O painel é
 * atualizado ao vivo, mas no máximo uma vez por janela e por contato.
 */
export const CONVERSATION_PANEL_INVALIDATION_WINDOW_MS = 2000;

/**
 * Chaves do painel do contato que dependem das mensagens: contadores da faixa de estatísticas,
 * CRM 360°, histórico/Jornada e a "Próxima melhor ação". O histórico casa por PREFIXO
 * (`['conversation-history', contactId]`) porque a chave do J12 carrega período, tipo e limite
 * na cauda — a invalidação precisa alcançar todas as combinações abertas.
 */
export function conversationPanelQueryKeys(contactId: string) {
  return [
    contactStatsKey(contactId),
    contactCrm360Key(contactId),
    ['conversation-history', contactId],
    nextBestActionKey(contactId),
  ] as const;
}

/**
 * Acumula os contatos que receberam evento de mensagem e invalida as queries do painel uma vez
 * por janela. Devolve a função que `useMessages` chama nos handlers de INSERT/UPDATE/DELETE;
 * sem argumento, usa o contato da conversa aberta. O timer é limpo no unmount (nada é
 * invalidado depois que o painel saiu da tela).
 */
export function useConversationPanelInvalidation(contactId: string | null) {
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingContactIdsRef = useRef<Set<string>>(new Set());

  const flush = useCallback(() => {
    timerRef.current = null;
    const contactIds = [...pendingContactIdsRef.current];
    pendingContactIdsRef.current.clear();
    for (const id of contactIds) {
      for (const queryKey of conversationPanelQueryKeys(id)) {
        void queryClient.invalidateQueries({ queryKey });
      }
    }
  }, [queryClient]);

  const schedulePanelInvalidation = useCallback(
    (targetContactId?: string | null) => {
      const id = targetContactId ?? contactId;
      if (!id) return;
      pendingContactIdsRef.current.add(id);
      if (timerRef.current !== null) return;
      timerRef.current = setTimeout(flush, CONVERSATION_PANEL_INVALIDATION_WINDOW_MS);
    },
    [contactId, flush],
  );

  useEffect(() => () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingContactIdsRef.current.clear();
  }, []);

  return schedulePanelInvalidation;
}
