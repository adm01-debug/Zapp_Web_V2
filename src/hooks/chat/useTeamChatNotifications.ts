import { useEffect, useRef, useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { useNotificationSettings } from '@/hooks/system/useNotificationSettings';
import { usePushNotifications } from '@/hooks/system/usePushNotifications';
import { navigateToView } from '@/hooks/system/useNavigationHistory';
import { getLogger } from '@/lib/logger';
import { getTeamChatNotificationBody, shouldNotifyTeamMessage } from '@/lib/teamChatRules';

const log = getLogger('TeamChatNotifications');

type ActiveConversationListener = () => void;

let activeConversationId: string | null = null;
const activeConversationListeners = new Set<ActiveConversationListener>();

export function getActiveTeamChatConversationId(): string | null {
  return activeConversationId;
}

export function subscribeActiveTeamChatConversation(listener: ActiveConversationListener): () => void {
  activeConversationListeners.add(listener);
  return () => {
    activeConversationListeners.delete(listener);
  };
}

export function setActiveTeamChatConversation(conversationId: string | null): void {
  if (activeConversationId === conversationId) return;
  activeConversationId = conversationId;
  activeConversationListeners.forEach((listener) => listener());
}

export function useActiveTeamChatConversation(conversationId: string | null): void {
  useEffect(() => {
    setActiveTeamChatConversation(conversationId);
    return () => {
      setActiveTeamChatConversation(null);
    };
  }, [conversationId]);
}

export function useActiveTeamChatConversationId(): string | null {
  return useSyncExternalStore(
    subscribeActiveTeamChatConversation,
    getActiveTeamChatConversationId,
    () => null,
  );
}

let audioCtx: AudioContext | null = null;
const getCtx = () => {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
};

export function playTeamChatSound(volume: number = 70) {
  try {
    const ctx = getCtx();
    if (ctx.state === 'suspended') void ctx.resume();

    const now = ctx.currentTime;
    const volumeMultiplier = volume / 100;

    const frequencies = [523, 659];
    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.2 * volumeMultiplier, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.start(now + i * 0.05);
      osc.stop(now + 0.4);
    });

    setTimeout(() => {
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(784, ctx.currentTime);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.15 * volumeMultiplier, ctx.currentTime + 0.02);
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
 * HZ5-09: canal identificado por team-chat-notifications:${profile.id} para
 * garantir unicidade por instancia; effect so recria o canal quando profile muda.
 * Preferencias de som/notificacao chegam por refs para nao entrar nas deps.
 */
export function useTeamChatNotifications(activeConversationId: string | null) {
  const { profile } = useAuth();
  const { settings: notifSettings, isQuietHours } = useNotificationSettings();
  const { showNotification, permission } = usePushNotifications();
  const activeIdRef = useRef(activeConversationId);

  // Refs atualizados a cada render -- leitura fresca dentro do effect sem entrar nas deps
  const notifSettingsRef = useRef(notifSettings);
  notifSettingsRef.current = notifSettings;
  const isQuietHoursRef = useRef(isQuietHours);
  isQuietHoursRef.current = isQuietHours;
  const showNotificationRef = useRef(showNotification);
  showNotificationRef.current = showNotification;
  const permissionRef = useRef(permission);
  permissionRef.current = permission;

  useEffect(() => {
    activeIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    if (!profile) return;

    const channel = supabase
      .channel(`team-chat-notifications:${profile.id}`)
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

        if (msg.sender_id === profile.id) return;
        if (!document.hidden && activeIdRef.current === msg.conversation_id) return;

        const { data: membershipRows, error: membershipError } = await supabase
          .from('team_conversation_members')
          .select('id, is_muted')
          .eq('conversation_id', msg.conversation_id)
          .eq('profile_id', profile.id)
          .limit(1);
        if (membershipError) {
          log.warn('Falha ao confirmar participacao na conversa; sem notificacao:', membershipError.message);
          return;
        }
        const membership = membershipRows?.[0] ?? null;

        if (!shouldNotifyTeamMessage({
          senderId: msg.sender_id,
          profileId: profile.id,
          documentHidden: document.hidden,
          activeConversationId: activeIdRef.current,
          conversationId: msg.conversation_id,
          membership,
        })) return;

        const settings = notifSettingsRef.current;
        const quietHours = isQuietHoursRef.current;

        if (settings.soundEnabled && !quietHours()) {
          playTeamChatSound(settings.soundVolume);
        }

        if (permissionRef.current === 'granted' && settings.browserNotifications && !quietHours()) {
          let senderName = 'Colega';
          try {
            const { data, error: erroPerfis } = await supabase.rpc('get_team_profiles');
            if (erroPerfis) {
              log.error('Failed to resolve team chat sender name:', erroPerfis);
            } else {
              const perfis = (data ?? []) as Array<{ id: string; name: string | null }>;
              const perfil = perfis.find((p) => p.id === msg.sender_id);
              if (perfil?.name) senderName = perfil.name;
            }
          } catch (err) { log.error('Unexpected error in useTeamChatNotifications:', err); }

          const body = getTeamChatNotificationBody(msg.media_type, msg.content);

          await showNotificationRef.current({
            title: `\u{1F4AC} Teams: ${senderName}`,
            body,
            tag: `team-msg-${msg.conversation_id}`,
          });

          log.debug('Team chat notification sent for message:', msg.id);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile]); // Apenas profile: troca de settings nao recria o canal (HZ5-09)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const aoReceberMensagem = (event: MessageEvent) => {
      const mensagem = event.data as
        | { type?: string; data?: { type?: string; conversationId?: string } }
        | null;
      if (mensagem?.type !== 'NOTIFICATION_CLICK') return;
      if (mensagem.data?.type !== 'team_chat') return;
      if (typeof mensagem.data.conversationId !== 'string') return;
      window.focus();
      navigateToView('team-chat');
    };

    navigator.serviceWorker.addEventListener('message', aoReceberMensagem);
    return () => {
      navigator.serviceWorker.removeEventListener('message', aoReceberMensagem);
    };
  }, []);
}
