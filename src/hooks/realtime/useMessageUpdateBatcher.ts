import { useCallback, useRef } from 'react';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { normalizeMessage, buildConversation } from './realtimeUtils';
import type { ConversationWithMessages, RealtimeMessage } from '../chat/useRealtimeMessages';

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

  const flushPendingUpdates = useCallback(() => {
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
  }, [commitConversations]);

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
      updateTimerRef.current = setTimeout(flushPendingUpdates, 100);
    },
    [flushPendingUpdates, hydrateConversationForMessage, conversationsRef]
  );

  return { handleMessageUpdate };
}
