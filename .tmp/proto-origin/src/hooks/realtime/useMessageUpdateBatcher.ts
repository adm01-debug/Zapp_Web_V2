import { useCallback, useEffect, useRef } from 'react';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { normalizeMessage, buildConversation } from './realtimeUtils';
import type { ConversationWithMessages, RealtimeMessage } from '../chat/useRealtimeMessages';

const BATCH_WINDOW_MS = 100;

/**
 * Teto de espera da janela: uma rajada continua (UPDATE a cada <100 ms) adia o
 * debounce indefinidamente e o lote pendente nunca e commitado. Passado o teto,
 * o lote sai mesmo com a rajada em curso.
 */
const BATCH_MAX_WAIT_MS = 500;

/**
 * Batches rapid message UPDATE events (e.g. status changes) to reduce renders.
 */
export function useMessageUpdateBatcher(
  conversationsRef: React.MutableRefObject<ConversationWithMessages[]>,
  commitConversations: (updater: (prev: ConversationWithMessages[]) => ConversationWithMessages[]) => void,
  hydrateConversationForMessage: (message: RealtimeMessage) => Promise<void>,
) {
  const pendingUpdatesRef = useRef<Map<string, RealtimeMessage>>(new Map());
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxWaitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (updateTimerRef.current) {
      clearTimeout(updateTimerRef.current);
      updateTimerRef.current = null;
    }
    if (maxWaitTimerRef.current) {
      clearTimeout(maxWaitTimerRef.current);
      maxWaitTimerRef.current = null;
    }
  }, []);

  // Desmontar com lote pendente nao pode disparar commit depois do desmonte: o
  // timer ficava solto e chamava commitConversations num componente ja fora.
  useEffect(() => () => {
    clearTimers();
    pendingUpdatesRef.current = new Map();
  }, [clearTimers]);

  const flushPendingUpdates = useCallback(() => {
    clearTimers();
    const pending = pendingUpdatesRef.current;
    if (pending.size === 0) return;

    const updates = Array.from(pending.values());
    pendingUpdatesRef.current = new Map();

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
        updatedMessages[msgIdx] = updatedMessage;
        next[convIdx] = buildConversation(conv.contact, updatedMessages);
      }

      return changed ? next : prev;
    });
  }, [clearTimers, commitConversations]);

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

      pendingUpdatesRef.current.set(updatedMessage.id, updatedMessage);

      if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
      updateTimerRef.current = setTimeout(flushPendingUpdates, BATCH_WINDOW_MS);
      if (!maxWaitTimerRef.current) {
        maxWaitTimerRef.current = setTimeout(flushPendingUpdates, BATCH_MAX_WAIT_MS);
      }
    },
    [flushPendingUpdates, hydrateConversationForMessage, conversationsRef]
  );

  return { handleMessageUpdate };
}
