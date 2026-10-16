import { useCallback, useRef } from 'react';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { normalizeMessage, buildConversation } from './realtimeUtils';
import type { ConversationWithMessages, RealtimeMessage } from '../chat/useRealtimeMessages';

/**
 * Batches rapid message UPDATE events (e.g. status changes) to reduce renders.
 *
 * A transição para `played` (áudio ouvido) é evento discreto e NÃO entra na
 * janela: sai na hora, senão o tick da bolha fica 100 ms atrás do banco.
 */
export function useMessageUpdateBatcher(
  conversationsRef: React.MutableRefObject<ConversationWithMessages[]>,
  commitConversations: (updater: (prev: ConversationWithMessages[]) => ConversationWithMessages[]) => void,
  hydrateConversationForMessage: (message: RealtimeMessage) => Promise<void>,
) {
  const pendingUpdatesRef = useRef<Map<string, RealtimeMessage>>(new Map());
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyUpdates = useCallback((updates: RealtimeMessage[]) => {
    if (updates.length === 0) return;

    commitConversations((prev) => {
      let next = prev;
      let changed = false;

      for (const updatedMessage of updates) {
        if (!updatedMessage.contact_id) continue;
        const convIdx = next.findIndex(c => c.contact.id === updatedMessage.contact_id);
        if (convIdx < 0) continue;
        const conv = next[convIdx];
        const msgIdx = conv.messages.findIndex(m => m.id === updatedMessage.id);
        if (msgIdx < 0) continue;
        if (!changed) { next = [...next]; changed = true; }
        const updatedMessages = [...conv.messages];
        // O payload do UPDATE pode vir SEM as colunas grandes (TOAST): mesclar
        // sobre a linha em memória evita apagar content/caption/media_*.
        updatedMessages[msgIdx] = normalizeMessage({
          ...conv.messages[msgIdx],
          ...updatedMessage,
        } as RealtimeMessage);
        next[convIdx] = buildConversation(conv.contact, updatedMessages);
      }

      return changed ? next : prev;
    });
  }, [commitConversations]);

  const flushPendingUpdates = useCallback(() => {
    updateTimerRef.current = null;
    const pending = pendingUpdatesRef.current;
    if (pending.size === 0) return;

    const updates = Array.from(pending.values());
    pendingUpdatesRef.current = new Map();

    applyUpdates(updates);
  }, [applyUpdates]);

  const handleMessageUpdate = useCallback(
    (payload: RealtimePostgresChangesPayload<RealtimeMessage>) => {
      const updatedMessage = normalizeMessage(payload.new as RealtimeMessage);
      if (!updatedMessage.contact_id) return;

      const existingConversation = conversationsRef.current.find(
        (c) => c.contact.id === updatedMessage.contact_id
      );

      if (!existingConversation) {
        void hydrateConversationForMessage(updatedMessage);
        return;
      }

      // Fica na lista pendente o payload CRU: o `normalizeMessage` só serve para
      // achar id/contact_id e para a hidratação. Guardar o cru evita que um
      // campo que o UPDATE não trouxe vire default e apague o valor em memória.
      const rawUpdate = {
        ...(payload.new as RealtimeMessage),
        id: updatedMessage.id,
        contact_id: updatedMessage.contact_id,
      };

      // `played` é evento discreto (áudio ouvido): não espera a janela do lote.
      // Mescla sobre a pendência do mesmo id — algum campo que só o update
      // anterior trouxe (coluna grande/TOAST) não pode ser perdido.
      if (updatedMessage.status === 'played') {
        const pendente = pendingUpdatesRef.current.get(updatedMessage.id);
        pendingUpdatesRef.current.delete(updatedMessage.id);
        if (pendingUpdatesRef.current.size === 0 && updateTimerRef.current) {
          clearTimeout(updateTimerRef.current);
          updateTimerRef.current = null;
        }
        applyUpdates([{ ...pendente, ...rawUpdate }]);
        return;
      }

      const existente = pendingUpdatesRef.current.get(updatedMessage.id);
      pendingUpdatesRef.current.set(updatedMessage.id, { ...existente, ...rawUpdate });
      if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
      updateTimerRef.current = setTimeout(flushPendingUpdates, 100);
    },
    [applyUpdates, flushPendingUpdates, hydrateConversationForMessage, conversationsRef]
  );

  return { handleMessageUpdate };
}
