import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { useNotificationSettings } from '@/hooks/system/useNotificationSettings';
import { usePushNotifications } from '@/hooks/system/usePushNotifications';
import { navigateToView } from '@/hooks/system/useNavigationHistory';
import { getLogger } from '@/lib/logger';
import { uniqueRealtimeTopic } from '@/lib/realtimeTopic';
import { getTeamChatNotificationBody, shouldNotifyTeamMessage } from '@/lib/teamChatRules';
import { queryKeys } from '@/hooks/team-chat/queryKeys';

const log = getLogger('TeamChatNotifications');

/**
 * TC-007 — estado global (por aba) da conversa de Team Chat em foco.
 *
 * O listener de notificações tem de viver no nível do app e não dentro de `TeamChatView`:
 * do contrário, quem está em outra tela (ex.: Contatos) não recebe alerta nenhum. Como o
 * listener é ÚNICO, a conversa em foco chega por este store — a view publica o id enquanto
 * está montada e o limpa ao sair (o alerta volta a tocar).
 *
 * `getSnapshot` devolve um primitivo estável, requisito do `useSyncExternalStore`.
 */
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

/** Publica (no mount/troca) e limpa (no unmount) a conversa que a view está exibindo. */
export function useActiveTeamChatConversation(conversationId: string | null): void {
  useEffect(() => {
    setActiveTeamChatConversation(conversationId);
    return () => {
      setActiveTeamChatConversation(null);
    };
  }, [conversationId]);
}

/** Lê a conversa em foco. Consumido só pelo listener global. */
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

/**
 * Play a distinct notification sound for internal team chat.
 * Uses a unique chord-like pattern to differentiate from external chat beeps.
 *
 * O ganho obedece ao volume de alerta do painel (`settings.soundVolume`, 10-100): `volume/100`
 * multiplica os ganhos-base. Antes eram 0.2/0.15 cravados, ignorando o controle do usuário.
 *
 * ISENÇÃO DOCUMENTADA (exigida por `tests/contracts/media-volume-surfaces.contract.test.ts`):
 * alerta não é mídia de conversa — este som fica FORA do controle de volume de mídia
 * (`mediaVolumeStore`), porque o atendente não pode silenciar alerta sem querer ao mexer
 * no volume das conversas. O volume sai SEMPRE do painel (`settings.soundVolume`).
 */
export function playTeamChatSound(volume: number = 70) {
  try {
    const ctx = getCtx();
    if (ctx.state === 'suspended') void ctx.resume();

    const now = ctx.currentTime;
    const volumeMultiplier = volume / 100;

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
      gain.gain.linearRampToValueAtTime(0.2 * volumeMultiplier, now + 0.02);
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
 * Hook that listens for new team chat messages and shows notifications.
 * Only triggers when:
 * - The message is from someone else
 * - The user is not currently viewing that conversation
 * - Notifications are enabled and not in quiet hours
 */
export function useTeamChatNotifications(activeConversationId: string | null) {
  const { profile } = useAuth();
  const { settings: notifSettings, isQuietHours } = useNotificationSettings();
  const { showNotification, permission } = usePushNotifications();
  const queryClient = useQueryClient();

  const activeIdRef = useRef(activeConversationId);
  const notifSettingsRef = useRef(notifSettings);
  const isQuietHoursRef = useRef(isQuietHours);
  const permissionRef = useRef(permission);
  const showNotificationRef = useRef(showNotification);

  // Keep refs current before effects fire — channel effect stays stable.
  // useLayoutEffect runs synchronously after DOM mutations, before the browser
  // paints, so refs are always fresh when the realtime callback fires.
  useLayoutEffect(() => {
    activeIdRef.current = activeConversationId;
    notifSettingsRef.current = notifSettings;
    isQuietHoursRef.current = isQuietHours;
    permissionRef.current = permission;
    showNotificationRef.current = showNotification;
  });

  useEffect(() => {
    if (!profile) return;

    const canal = supabase
      .channel(uniqueRealtimeTopic('team-chat-notifications'))
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

        // Cache-first: verificar participação e mute no cache do inbox antes de
        // consultar o banco — a maioria dos eventos é de conversas já em cache.
        type InboxConv = { id: string; members: Array<{ profile_id: string; is_muted: boolean }> };
        const cached = queryClient.getQueryData<InboxConv[]>(queryKeys.inbox(profile.id));
        let membership: { is_muted: boolean | null } | null = null;
        let fromCache = false;

        if (cached !== undefined) {
          const conv = cached.find((c) => c.id === msg.conversation_id);
          if (conv !== undefined) {
            fromCache = true;
            const member = conv.members.find((m) => m.profile_id === profile.id);
            membership = member ?? null;
          }
        }

        if (!fromCache) {
          // limit(1) em vez de single(): o listener recebe todo INSERT em
          // team_messages sem filtro por conversa; "não é membro" é o caso
          // comum — single() geraria 406 na maioria dos eventos.
          const { data: membershipRows, error } = await supabase
            .from('team_conversation_members')
            .select('id, is_muted')
            .eq('conversation_id', msg.conversation_id)
            .eq('profile_id', profile.id)
            .limit(1);
          if (error) {
            log.warn('Falha ao confirmar participação na conversa; sem notificação:', error.message);
            return;
          }
          membership = membershipRows?.[0] ?? null;
        }

        if (!shouldNotifyTeamMessage({
          senderId: msg.sender_id,
          profileId: profile.id,
          documentHidden: document.hidden,
          activeConversationId: activeIdRef.current,
          conversationId: msg.conversation_id,
          membership,
        })) return;

        if (notifSettingsRef.current.soundEnabled && !isQuietHoursRef.current()) {
          playTeamChatSound(notifSettingsRef.current.soundVolume);
        }

        // HZ3-001: o aviso depende SÓ da permissão do navegador já concedida.
        // Dois caminhos: (1) service worker via `showNotification` quando o push
        // está disponível; (2) `new Notification` direto quando a permissão foi
        // concedida mas o push não está subscrito.
        if (notifSettingsRef.current.browserNotifications && !isQuietHoursRef.current()) {
          // Nome do remetente por RPC segura: leitura direta de `profiles`
          // é barrada pela RLS para o agente — `get_team_profiles()` é SECURITY
          // DEFINER e já mascara email/telefone.
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
          const title = `💬 Teams: ${senderName}`;
          const notifOptions = {
            body,
            tag: `team-msg-${msg.conversation_id}`,
            data: {
              type: 'team_chat',
              conversationId: msg.conversation_id,
              messageId: msg.id,
            },
            requireInteraction: false,
          };

          if (permissionRef.current === 'granted') {
            await showNotificationRef.current({ title, ...notifOptions });
            log.debug('Team chat notification sent for message:', msg.id);
          } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            const notif = new Notification(title, notifOptions);
            notif.onclick = () => {
              window.focus();
              navigateToView('team-chat');
            };
            log.debug('Team chat notification sent for message:', msg.id);
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [profile, queryClient]);

  /**
   * Clique na notificação do chat interno: o service worker repassa o clique da
   * notificação como `NOTIFICATION_CLICK` carregando o `data` dela (aqui,
   * `type: 'team_chat'` e o `conversationId`). Foca a janela e abre o módulo de
   * Chat Interno. A seleção da conversa específica é estado local da
   * `TeamChatView`, fora deste hook.
   */
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
