import { useContext, useEffect, useRef, useSyncExternalStore } from 'react';
import { QueryClientContext } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { useNotificationSettings } from '@/hooks/system/useNotificationSettings';
import { navigateToView } from '@/hooks/system/useNavigationHistory';
import { getLogger } from '@/lib/logger';
import { getTeamChatNotificationBody, shouldNotifyTeamMessage } from '@/lib/teamChatRules';
import { queryKeys } from '@/hooks/team-chat/queryKeys';
import { uniqueRealtimeTopic } from '@/lib/realtimeTopic';
import { showBrowserNotification } from '@/utils/notificationSounds';

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

export function subscribeActiveTeamChatConversation(
  listener: ActiveConversationListener
): () => void {
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
    () => null
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
      } catch (err) {
        log.error('Unexpected error in useTeamChatNotifications:', err);
      }
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
  // `useQueryClient()` lançaria sem `QueryClientProvider` — este listener
  // mora no nível do app (TC-007) e sempre tem um acima na produção, mas o
  // cache é só uma otimização (evita ida ao banco quando o inbox já carregou
  // a conversa); sem provider, cai para a consulta direta sem quebrar.
  const queryClient = useContext(QueryClientContext);
  const activeIdRef = useRef(activeConversationId);
  // HZ5-09: o canal era recriado toda vez que o usuário mexia no volume (as
  // preferências estavam nas deps do efeito). O efeito de assinatura abaixo
  // só depende do perfil — preferências/queryClient chegam ao callback por
  // este ref, sempre com o valor do render mais recente, sem derrubar e
  // reabrir o canal a cada mudança.
  const latestRef = useRef({ notifSettings, isQuietHours, queryClient });
  latestRef.current = { notifSettings, isQuietHours, queryClient };

  useEffect(() => {
    activeIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    if (!profile) return;

    const channel = supabase
      .channel('team-chat-notifications' + uniqueRealtimeTopic(''))
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'team_messages',
        },
        async (payload) => {
          const msg = payload.new as {
            id: string;
            conversation_id: string;
            sender_id: string;
            content: string;
            media_type: string | null;
            created_at: string;
          };

          // Lê sempre o valor do render mais recente (ref) — a assinatura do
          // canal não depende destes campos, então a closure não os teria frescos.
          const { notifSettings, isQuietHours, queryClient } = latestRef.current;

          // Don't notify for own messages
          if (msg.sender_id === profile.id) return;

          // Don't notify if currently viewing this conversation
          if (!document.hidden && activeIdRef.current === msg.conversation_id) return;

          // HZ5-09: o inbox do Team Chat já carrega `members` (com `is_muted`) de
          // cada conversa no cache (`queryKeys.inbox`) — quando a conversa já
          // está lá, a participação sai do cache sem ida ao banco. Só cai para
          // `team_conversation_members` quando a conversa não está carregada
          // ainda (ex.: notificação chegou antes do inbox montar).
          type ConversaEmCache = {
            id: string;
            members: Array<{ profile_id: string; is_muted: boolean }>;
          };
          const inboxCache = queryClient?.getQueryData<ConversaEmCache[]>(
            queryKeys.inbox(profile.id)
          );
          const conversaEmCache = inboxCache?.find((c) => c.id === msg.conversation_id);

          let membership: { id: string; is_muted: boolean | null } | null;
          if (conversaEmCache) {
            const membro = conversaEmCache.members.find((m) => m.profile_id === profile.id);
            membership = membro ? { id: msg.conversation_id, is_muted: membro.is_muted } : null;
          } else {
            // Check if user is a member of this conversation. limit(1) em vez de
            // single(): o listener recebe todo INSERT em team_messages sem
            // filtro por conversa, então "não é membro" é o caso comum, não uma
            // exceção — single() geraria 406 na maioria dos eventos.
            const { data: membershipRows, error: membershipError } = await supabase
              .from('team_conversation_members')
              .select('id, is_muted')
              .eq('conversation_id', msg.conversation_id)
              .eq('profile_id', profile.id)
              .limit(1);
            if (membershipError) {
              log.warn(
                'Falha ao confirmar participação na conversa; sem notificação:',
                membershipError.message
              );
              return;
            }
            membership = membershipRows?.[0] ?? null;
          }

          if (
            !shouldNotifyTeamMessage({
              senderId: msg.sender_id,
              profileId: profile.id,
              documentHidden: document.hidden,
              activeConversationId: activeIdRef.current,
              conversationId: msg.conversation_id,
              membership,
            })
          )
            return;

          // Play sound if enabled — volume do painel (10-100), nunca fixo
          if (notifSettings.soundEnabled && !isQuietHours()) {
            playTeamChatSound(notifSettings.soundVolume);
          }

          // Show browser notification if enabled
          // PE-75: saía por `usePushNotifications.showNotification`, que exige
          // Service Worker de aplicação — `SERVICE_WORKER_ENABLED=false` hoje,
          // então devolvia `false` em silêncio e o chat de equipe só tocava o
          // som. `showBrowserNotification` usa a API `Notification` direta (já
          // confere `Notification.permission === 'granted'` por dentro); o
          // liga/desliga do chat interno continua valendo por
          // `notifSettings.browserNotifications`.
          if (notifSettings.browserNotifications && !isQuietHours()) {
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
            } catch (err) {
              log.error('Unexpected error in useTeamChatNotifications:', err);
            }

            const body = getTeamChatNotificationBody(msg.media_type, msg.content);

            // Clique: a notificação do navegador chama `onClick` direto (sem
            // Service Worker no meio) — mesmo destino do listener de
            // `NOTIFICATION_CLICK` abaixo (mantido para quando o Service Worker
            // de aplicação for religado).
            showBrowserNotification(`💬 Teams: ${senderName}`, body, {
              tag: `team-msg-${msg.conversation_id}`,
              requireInteraction: false,
              onClick: () => {
                window.focus();
                navigateToView('team-chat');
              },
            });

            log.debug('Team chat notification sent for message:', msg.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // Só o perfil recria o canal (troca de usuário/RLS). Preferências e
    // `queryClient` chegam frescos por `latestRef` (ver acima).
  }, [profile]);

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
      const mensagem = event.data as {
        type?: string;
        data?: { type?: string; conversationId?: string };
      } | null;
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
