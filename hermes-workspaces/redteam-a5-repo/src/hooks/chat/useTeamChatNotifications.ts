import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { useNotificationSettings } from '@/hooks/system/useNotificationSettings';
import { usePushNotifications } from '@/hooks/system/usePushNotifications';
import { getLogger } from '@/lib/logger';

const log = getLogger('TeamChatNotifications');

let audioCtx: AudioContext | null = null;
const getCtx = () => {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
};

/**
 * Play a distinct notification sound for internal team chat.
 * Uses a unique chord-like pattern to differentiate from external chat beeps.
 */
export function playTeamChatSound() {
  try {
    const ctx = getCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;

    // Two-tone chord: C5 + E5 for a pleasant, distinct chime
    const frequencies = [523, 659];
    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.start(now + i * 0.05); // Slight stagger for richness
      osc.stop(now + 0.4);
    });

    // Third note (G5) after a brief pause for a recognizable pattern
    setTimeout(() => {
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(784, ctx.currentTime);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.35);
      } catch (err) { log.error('Unexpected error in useTeamChatNotifications:', err); }
    }, 150);
  } catch (err) {
    log.warn('Failed to play team chat sound:', err);
  }
}

/**
 * Hook that listens for new team chat messages and shows notifications.
 * Only triggers when:
 * - The message is from someone else
 * - The user is not currently viewing that conversation
 * - Notifications are enabled and not in quiet hours
 */
export function useTeamChatNotifications(activeConversationId: string | null) {
  const { profile } = useAuth();
  const { settings: notifSettings, isQuietHours } = useNotificationSettings();
  const { showNotification, isSubscribed, permission } = usePushNotifications();
  const activeIdRef = useRef(activeConversationId);

  useEffect(() => {
    activeIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    if (!profile) return;

    const channel = supabase
      .channel('team-chat-notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'team_messages',
      }, async (payload) => {
        const msg = payload.new as {
          id: string;
          conversation_id: string;
          sender_id: string;
          content: string;
          media_type: string | null;
          created_at: string;
        };

        // Don't notify for own messages
        if (msg.sender_id === profile.id) return;

        // Don't notify if currently viewing this conversation
        if (!document.hidden && activeIdRef.current === msg.conversation_id) return;

        // Check if user is a member of this conversation. limit(1) em vez de
        // single(): o listener recebe todo INSERT em team_messages sem
        // filtro por conversa, então "não é membro" é o caso comum, não uma
        // exceção — single() geraria 406 na maioria dos eventos.
        const { data: membershipRows } = await supabase
          .from('team_conversation_members')
          .select('id, is_muted')
          .eq('conversation_id', msg.conversation_id)
          .eq('profile_id', profile.id)
          .limit(1);
        const membership = membershipRows?.[0] ?? null;

        if (!membership) return; // Not a member
        if (membership.is_muted) return; // Muted

        // Play sound if enabled
        if (notifSettings.soundEnabled && !isQuietHours()) {
          playTeamChatSound();
        }

        // Show browser notification if enabled
        if (permission === 'granted' && isSubscribed && notifSettings.browserNotifications && !isQuietHours()) {
          // Fetch sender name
          let senderName = 'Colega';
          try {
            const { data } = await supabase
              .from('profiles')
              .select('name')
              .eq('id', msg.sender_id)
              .single();
            if (data) senderName = data.name;
          } catch (err) { log.error('Unexpected error in useTeamChatNotifications:', err); }

          const body = msg.media_type
            ? msg.media_type === 'image' ? '📷 Imagem'
              : msg.media_type === 'audio' || msg.media_type === 'audio_meme' ? '🎤 Áudio'
              : msg.media_type === 'video' ? '🎥 Vídeo'
              : msg.media_type === 'sticker' ? '🎨 Figurinha'
              : msg.media_type === 'document' ? '📎 Documento'
              : msg.content.slice(0, 100)
            : msg.content.slice(0, 100);

          await showNotification({
            title: `💬 Teams: ${senderName}`,
            body,
            tag: `team-msg-${msg.conversation_id}`,
            data: {
              type: 'team_chat',
              conversationId: msg.conversation_id,
              messageId: msg.id,
            },
            requireInteraction: false,
          });

          log.debug('Team chat notification sent for message:', msg.id);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile, notifSettings.soundEnabled, notifSettings.browserNotifications, permission, isSubscribed, isQuietHours, showNotification]);
}
