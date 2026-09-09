 import { useState, useEffect, useCallback, useRef } from 'react';
 import { mapMessageRowToMessage } from '@/adapters/inboxAdapter';
 import { useSupabaseRealtime } from '@/hooks/realtime/useSupabaseRealtime';
 import { ChatService, Message } from '@/services/chat.service';
 import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
 import { log } from '@/lib/logger';

interface UseMessagesOptions {
  contactId: string | null;
  enabled?: boolean;
}

export function useMessages({ contactId, enabled = true }: UseMessagesOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const previousContactIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const activeContactIdRef = useRef<string | null>(contactId);
  const requestGenerationRef = useRef(0);
  const realtimeOverlayRef = useRef<Map<string, Message | null>>(new Map());

  // Track mount state to prevent setState after unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Fetch messages for contact
  const fetchMessages = useCallback(async () => {
    const requestedContactId = contactId;
    const generation = ++requestGenerationRef.current;
    if (!requestedContactId) {
      if (mountedRef.current) {
        setMessages([]);
        setLoading(false);
      }
      return;
    }

    try {
      if (mountedRef.current) {
        setLoading(true);
        setError(null);
      }
      
      const { data, error: fetchError } = await ChatService.fetchMessages(requestedContactId);
      if (fetchError) throw fetchError;
      
      if (mountedRef.current && generation === requestGenerationRef.current &&
        activeContactIdRef.current === requestedContactId && data) {
        const snapshot = data.map((row) => mapMessageRowToMessage(row));
        const merged = new Map(snapshot.map((message) => [message.id, message]));
        for (const [id, message] of realtimeOverlayRef.current) {
          if (message) merged.set(id, message);
          else merged.delete(id);
        }
        setMessages([...merged.values()].sort((a, b) =>
          new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        ));
      }
    } catch (err) {
      log.error('Error fetching messages:', err);
      if (mountedRef.current && generation === requestGenerationRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to fetch messages');
      }
    } finally {
      if (mountedRef.current && generation === requestGenerationRef.current) {
        setLoading(false);
      }
    }
  }, [contactId]);

  // Handle new message from realtime
  const handleNewMessage = useCallback(
    (payload: RealtimePostgresChangesPayload<Message>) => {
      const newMessage = mapMessageRowToMessage(payload.new as any);
      
      // Only add if it's for the current contact and not already present
      if (newMessage.contact_id === contactId) {
        realtimeOverlayRef.current.set(newMessage.id, newMessage);
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMessage.id)) {
            return prev;
          }
          // Sort after adding just in case of race conditions
          return [...prev, newMessage].sort((a, b) => 
            new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
          );
        });
      }
    },
    [contactId]
  );

  // Handle message update from realtime
  const handleMessageUpdate = useCallback(
    (payload: RealtimePostgresChangesPayload<Message>) => {
      const updatedMessage = mapMessageRowToMessage(payload.new as any);

      if (updatedMessage.contact_id === contactId) {
        realtimeOverlayRef.current.set(updatedMessage.id, updatedMessage);
        setMessages((prev) =>
          prev.map((m) => (m.id === updatedMessage.id ? updatedMessage : m))
        );
      }
    },
    [contactId]
  );

  // Handle message delete from realtime
  const handleMessageDelete = useCallback(
    (payload: RealtimePostgresChangesPayload<Message>) => {
      const deletedMessage = payload.old as Message;

      if (deletedMessage.contact_id === contactId) {
        realtimeOverlayRef.current.set(deletedMessage.id, null);
        setMessages((prev) => prev.filter((m) => m.id !== deletedMessage.id));
      }
    },
    [contactId]
  );

  // Fetch on contact change
  useEffect(() => {
    activeContactIdRef.current = enabled ? contactId : null;
    if (!enabled || !contactId) {
      requestGenerationRef.current += 1;
      previousContactIdRef.current = null;
      realtimeOverlayRef.current.clear();
      const invalidatedGeneration = requestGenerationRef.current;
      void Promise.resolve().then(() => {
        if (!mountedRef.current || requestGenerationRef.current !== invalidatedGeneration) return;
        setMessages([]);
        setLoading(false);
        setError(null);
      });
      return;
    }
    if (contactId !== previousContactIdRef.current) {
      previousContactIdRef.current = contactId;
      realtimeOverlayRef.current.clear();
      // Clear messages and set loading immediately to prevent UI flicker of old messages
      setMessages([]);
      setLoading(true);
      void fetchMessages();
    }
  }, [contactId, enabled, fetchMessages]);

   // Subscribe to realtime updates using the standardized hook
   useSupabaseRealtime<Message>({
     channelName: `messages:${contactId}`,
     table: 'messages',
     filter: contactId ? `contact_id=eq.${contactId}` : undefined,
     enabled: enabled && !!contactId,
     onInsert: handleNewMessage,
     onUpdate: handleMessageUpdate,
     onDelete: handleMessageDelete,
   });

  // Add a message optimistically
  const addMessage = useCallback((message: Message) => {
    realtimeOverlayRef.current.set(message.id, message);
    setMessages((prev) => {
      if (prev.some((m) => m.id === message.id)) {
        return prev;
      }
      return [...prev, message];
    });
  }, []);

  // Update a message optimistically
  const updateMessage = useCallback((messageId: string, updates: Partial<Message>) => {
    setMessages((prev) => prev.map((message) => {
      if (message.id !== messageId) return message;
      const updated = { ...message, ...updates };
      realtimeOverlayRef.current.set(messageId, updated);
      return updated;
    }));
  }, []);

  // Remove a message optimistically
  const removeMessage = useCallback((messageId: string) => {
    realtimeOverlayRef.current.set(messageId, null);
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  return {
    messages,
    loading,
    error,
    refetch: fetchMessages,
    addMessage,
    updateMessage,
    removeMessage,
  };
}
