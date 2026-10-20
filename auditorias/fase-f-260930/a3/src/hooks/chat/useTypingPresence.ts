import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';
import { log } from '@/lib/logger';

interface TypingUser {
  oderId: string;
  name: string;
  isTyping: boolean;
  lastTyped: string;
}

interface PresenceState {
  oderId?: string;
  name?: string;
  isTyping?: boolean;
  lastTyped?: string;
}

interface UseTypingPresenceProps {
  conversationId: string;
  currentUserId?: string;
  currentUserName?: string;
}

export function useTypingPresence({
  conversationId,
  currentUserId = 'agent',
  currentUserName = 'Agente'
}: UseTypingPresenceProps) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [isContactTyping, setIsContactTyping] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const contactTypingRef = useRef(false);
  const contactTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track current user typing
  const setTyping = useCallback(async (isTyping: boolean) => {
    if (!channelRef.current) return;

    try {
      await channelRef.current.track({
        oderId: currentUserId,
        name: currentUserName,
        isTyping,
        lastTyped: new Date().toISOString()
      });
    } catch (error) {
      log.error('Error tracking typing status:', error);
    }
  }, [currentUserId, currentUserName]);

  // Debounced typing indicator - call when user is typing
  const handleTypingStart = useCallback(() => {
    setTyping(true);

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Auto-stop typing after 3 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      setTyping(false);
    }, 3000);
  }, [setTyping]);

  // Stop typing immediately
  const handleTypingStop = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    setTyping(false);
  }, [setTyping]);

  useEffect(() => {
    if (!conversationId) return;

    // Create presence channel for this conversation
    const channel = supabase.channel(`typing:${conversationId}`, {
      config: {
        presence: {
          key: currentUserId,
        },
      },
    });

    channelRef.current = channel;

    // Handle presence sync (agent-to-agent typing)
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const users: TypingUser[] = [];

      Object.entries(state).forEach(([key, presences]) => {
        if (key !== currentUserId && Array.isArray(presences)) {
          presences.forEach((presence) => {
            const p = presence as unknown as PresenceState;
            if (p.isTyping) {
              users.push({
                oderId: p.oderId || key,
                name: p.name || 'Contato',
                isTyping: p.isTyping,
                lastTyped: p.lastTyped || new Date().toISOString()
              });
            }
          });
        }
      });

      setTypingUsers(users);
      // Only update from presence if no contact typing is active
      if (!contactTypingRef.current) {
        setIsContactTyping(users.length > 0);
      }
    });

    // Handle join event
    channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
      log.debug('User joined typing channel:', key, newPresences);
    });

    // Handle leave event
    channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      log.debug('User left typing channel:', key, leftPresences);
    });

    // Listen for contact typing broadcast from Evolution API webhook
    channel.on('broadcast', { event: 'contact_typing' }, ({ payload }) => {
      const isTyping = payload?.isTyping === true;
      contactTypingRef.current = isTyping;
      setIsContactTyping(isTyping);

      // Auto-clear after 5 seconds if no new event
      if (contactTypingTimeoutRef.current) {
        clearTimeout(contactTypingTimeoutRef.current);
      }
      if (isTyping) {
        contactTypingTimeoutRef.current = setTimeout(() => {
          contactTypingRef.current = false;
          setIsContactTyping(false);
        }, 5000);
      }
    });

    // Subscribe to channel
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        log.debug('Subscribed to typing presence for conversation:', conversationId);
      }
    });

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (contactTypingTimeoutRef.current) {
        clearTimeout(contactTypingTimeoutRef.current);
      }
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId]);

  return {
    isContactTyping,
    typingUsers,
    handleTypingStart,
    handleTypingStop
  };
}
