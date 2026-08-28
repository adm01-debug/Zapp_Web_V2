import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { getLogger } from '@/lib/logger';
import { MessageRow } from '@/types/chat';
import { ContactRow } from '@/types/contact';
import { RealtimeService } from '@/services/realtime.service';
import { useSupabaseRealtime } from '../realtime/useSupabaseRealtime';
import { sendMessageToContact } from '../realtime/messageSender';
import {
  normalizeMessage, buildConversation,
} from '../realtime/realtimeUtils';
import { useRealtimeNotifications } from '../realtime/useRealtimeNotifications';
import { useMessageUpdateBatcher } from '../realtime/useMessageUpdateBatcher';

const log = getLogger('RealtimeMessages');

export interface NewMessageNotification {
  id: string;
  contactId: string;
  contactName: string;
  contactAvatar: string | null;
  message: string;
  timestamp: Date;
}

export type RealtimeMessage = MessageRow;
export type ConversationContact = ContactRow;

export interface ConversationWithMessages {
  contact: ConversationContact;
  messages: RealtimeMessage[];
  unreadCount: number;
  lastMessage: RealtimeMessage | null;
}

export function useRealtimeMessages() {
  const [conversations, setConversations] = useState<ConversationWithMessages[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const conversationsRef = useRef<ConversationWithMessages[]>([]);

  const {
    newMessageNotification, notifyAboutIncomingMessage,
    dismissNotification, setSelectedContact, setSoundEnabled,
  } = useRealtimeNotifications();

  const commitConversations = useCallback(
    (updater: ConversationWithMessages[] | ((prev: ConversationWithMessages[]) => ConversationWithMessages[])) => {
      setConversations((prev) => {
        const next = typeof updater === 'function'
          ? (updater as (prev: ConversationWithMessages[]) => ConversationWithMessages[])(prev)
          : updater;
        conversationsRef.current = next;
        return next;
      });
    },
    []
  );

  const hydrateConversationForMessage = useCallback(
    async (message: RealtimeMessage) => {
      if (!message.contact_id) return;
      try {
        const [contact] = await RealtimeService.fetchContactsByIds([message.contact_id]);
        if (!contact) { log.warn('Incoming message received for unknown contact', { contactId: message.contact_id }); return; }
        commitConversations((prev) => {
          const idx = prev.findIndex((c) => c.contact.id === contact.id);
          if (idx >= 0) {
            const existing = prev[idx];
            if (existing.messages.some((m) => m.id === message.id)) return prev;
            const updated = [...prev];
            updated.splice(idx, 1);
            updated.unshift(buildConversation(contact, [...existing.messages, message]));
            return updated;
          }
          return [buildConversation(contact, [message]), ...prev];
        });
        notifyAboutIncomingMessage(contact, message);
      } catch (err) { log.error('Error hydrating conversation for incoming message:', err); }
    },
    [commitConversations, notifyAboutIncomingMessage]
  );

  const { handleMessageUpdate } = useMessageUpdateBatcher(conversationsRef, commitConversations, hydrateConversationForMessage);

  const handleNewMessage = useCallback(
    (payload: RealtimePostgresChangesPayload<RealtimeMessage>) => {
      const newMessage = normalizeMessage(payload.new as RealtimeMessage);
      if (!newMessage.contact_id) return;

      const existingConversation = conversationsRef.current.find((c) => c.contact.id === newMessage.contact_id);
      if (!existingConversation) { void hydrateConversationForMessage(newMessage); return; }

      commitConversations((prev) => {
        const idx = prev.findIndex((c) => c.contact.id === newMessage.contact_id);
        if (idx < 0) return prev;
        const conv = prev[idx];
        if (conv.messages.some((m) => m.id === newMessage.id)) return prev;
        const updated = [...prev];
        updated.splice(idx, 1);
        updated.unshift(buildConversation(conv.contact, [...conv.messages, newMessage]));
        return updated;
      });

      notifyAboutIncomingMessage(existingConversation.contact, newMessage);
    },
    [commitConversations, hydrateConversationForMessage, notifyAboutIncomingMessage]
  );

  const fetchConversations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const builtConversations = await RealtimeService.fetchInitialConversations();
      commitConversations(builtConversations);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Falha ao carregar conversas';
      log.error('Error fetching conversations:', err);
      setError(errorMessage);
      import('sonner').then(({ toast }) => {
        toast.error('Erro de conexão', {
          description: 'Não foi possível carregar suas conversas. Verifique sua conexão.'
        });
      });
    } finally { setLoading(false); }
  }, [commitConversations]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useSupabaseRealtime<RealtimeMessage>({
    channelName: 'global-messages-realtime',
    table: 'messages',
    onInsert: handleNewMessage,
    onUpdate: handleMessageUpdate,
    enabled: true
  });

  const sendMessage = async (contactId: string, content: string, messageType: string = 'text', mediaUrl?: string, mediaPayload?: string) => {
    return sendMessageToContact(contactId, content, messageType, mediaUrl, mediaPayload);
  };

  const markAsRead = async (contactId: string) => {
    const conv = conversationsRef.current.find(c => c.contact.id === contactId);
    if (conv && conv.unreadCount === 0) return;

    try {
      await RealtimeService.markMessagesAsRead(contactId);
      commitConversations((prev) =>
        prev.map((c) => c.contact.id === contactId
          ? buildConversation(c.contact, c.messages.map((m) => ({ ...m, is_read: true })))
          : c
        )
      );
    } catch (err) {
      log.error('Error in markAsRead hook:', err);
    }
  };

  return {
    conversations, loading, error, sendMessage, markAsRead,
    refetch: fetchConversations, newMessageNotification,
    dismissNotification, setSelectedContact, setSoundEnabled,
  };
}