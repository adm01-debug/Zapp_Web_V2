import { useContext, useEffect, useRef, useSyncExternalStore } from 'react';
import { QueryClientContext } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { useNotificationSettings } from '@/hooks/system/useNotificationSettings';
import { usePushNotifications } from '@/hooks/system/usePushNotifications';
import { navigateToView } from '@/hooks/system/useNavigationHistory';
import { queryKeys } from '@/hooks/team-chat/queryKeys';
import type { TeamConversation } from '@/hooks/team-chat/teamChatTypes';
import { getLogger } from '@/lib/logger';
import { uniqueRealtimeTopic } from '@/lib/realtimeTopic';
import { getTeamChatNotificationBody, shouldNotifyTeamMessage } from '@/lib/teamChatRules';

const log = getLogger('TeamChatNotifications');

/** Associação do usuário à conversa, como `shouldNotifyTeamMessage` espera. */
type TeamMembership = { is_muted: boolean | null } | null;

/**
 * HZ5-09 — resolve a associação pelo cache do inbox antes de ir ao banco.
 *
 * O inbox (`useTeamConversations`) já carrega `team_conversation_members` com
 * `is_muted` e é invalidado a cada mudança de membro pelo canal `team-chat-updates`.
 * `undefined` = conversa fora do cache (aí o listener consulta o banco); `null` =
 * conversa em cache sem o usuário como membro (não notifica, sem ida à rede).
 */
export function membershipFromInboxCache(
  conversations: TeamConversation[] | undefined,
  conversationId: string,
  profileId: string,
): TeamMembership | undefined {
  const conv = conversations?.find((c) => c.id === conversationId);
  if (!conv) return undefined;
  const member = conv.members?.find((m) => m.profile_id === profileId);
  if (!member) return null;
  return { is_muted: member.is_muted ?? false };
}


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
  const { showNotification, isSubscribed, permission } = usePushNotifications();
  const queryClient = useContext(QueryClientContext);
  const activeIdRef = useRef(activeConversationId);
  // HZ5-09: o canal não pode ser recriado quando o usuário mexe no volume (nem quando
  // qualquer função do provedor troca de identidade a cada render). O handler lê os
  // valores atuais por ref; o efeito passa a depender só do perfil e do QueryClient.
  const settingsRef = useRef({ notifSettings, isQuietHours, permission, isSubscribed, showNotification });
  useEffect(() => {
    settingsRef.current = { notifSettings, isQuietHours, permission, isSubscribed, showNotification };
  });

  useEffect(() => {
    activeIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    if (!profile) return;

    const channel = supabase
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

        // Don't notify for own messages
        if (msg.sender_id === profile.id) return;

        // Don't notify if currently viewing this conversation
        if (!document.hidden && activeIdRef.current === msg.conversation_id) return;

        // Check if user is a member of this conversation. HZ5-09: o cache do inbox
        // já traz a associação (com `is_muted`) e é invalidado pelo canal
        // `team-chat-updates` a cada mudança de membro; só vá ao banco quando a
        // conversa não estiver em cache. limit(1) em vez de single(): o listener
        // recebe todo INSERT em team_messages sem filtro por conversa, então "não é
        // membro" é o caso comum, não uma exceção — single() geraria 406.
        let membership: TeamMembership | undefined = membershipFromInboxCache(
          queryClient?.getQueryData<TeamConversation[]>(queryKeys.inbox(profile.id)),
          msg.conversation_id,
          profile.id,
        );
        if (membership === undefined) {
          const { data: membershipRows } = await supabase
            .from('team_conversation_members')
            .select('id, is_muted')
            .eq('conversation_id', msg.conversation_id)
            .eq('profile_id', profile.id)
            .limit(1);
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

        // HZ5-09: valores atuais das preferências, lidos pela ref — mexer no volume
        // não recria o canal (o efeito só depende do perfil).
        const settings = settingsRef.current;

        // Play sound if enabled — volume do painel (10-100), nunca fixo
        if (settings.notifSettings.soundEnabled && !settings.isQuietHours()) {
          playTeamChatSound(settings.notifSettings.soundVolume);
        }

        // Show browser notification if enabled
        if (settings.permission === 'granted' && settings.isSubscribed && settings.notifSettings.browserNotifications && !settings.isQuietHours()) {
          // Nome do remetente por RPC segura: para o agente a leitura direta de
          // `profiles` é barrada pela RLS (o título virava 'Colega').
          // `get_team_profiles()` é SECURITY DEFINER e já mascara email/telefone.
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

          await settings.showNotification({
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
