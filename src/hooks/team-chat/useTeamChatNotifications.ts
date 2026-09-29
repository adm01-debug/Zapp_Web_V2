import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Options {
  conversationId: string;
  currentUserId: string | null;
  muted?: boolean;
  onNavigate?: (cid: string) => void;
}

const SOUND_URL = '/sounds/message.mp3';

export function useTeamChatNotifications({ conversationId, currentUserId, muted = false, onNavigate }: Options) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Alerta, não mídia de conversa: fica fora do controle de volume das mídias
    // (`mediaVolumeStore`) — o atendente não pode silenciar alerta sem querer.
    audioRef.current = new Audio(SOUND_URL);
    audioRef.current.volume = 0.4;
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel(`team-notify-${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'team_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        const msg = payload.new as { sender_id?: string; content?: string };
        if (msg.sender_id === currentUserId) return;
        if (muted) return;
        audioRef.current?.play().catch(() => { /* autoplay blocked */ });
        if (Notification.permission === 'granted') {
          const n = new Notification('Nova mensagem no Team Chat', {
            body: msg.content?.slice(0, 100) ?? '',
            tag: `team-chat-${conversationId}`,
          });
          // E82: route to ?view=team-chat on click
          n.onclick = () => {
            window.focus();
            if (onNavigate) {
              onNavigate(conversationId);
            } else {
              const url = new URL(window.location.href);
              url.searchParams.set('view', 'team-chat');
              url.searchParams.set('cid', conversationId);
              window.history.pushState({}, '', url.toString());
            }
            n.close();
          };
        }
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [conversationId, currentUserId, muted, onNavigate]);

  const requestPermission = () => {
    if (Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  };

  return { requestPermission };
}
