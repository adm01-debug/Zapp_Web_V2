import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';

export interface PresenceUser { userId: string; name: string; onlineAt: string; }

export function useTeamPresence(
  conversationId: string,
  currentUserId: string | null,
  currentUserName?: string,
) {
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!currentUserId) return;
    // PRIVADO (PD-70): `team-presence-<conversa>` é protegido por
    // can_access_realtime_topic — só membro da conversa de equipe assina.
    const channel = supabase.channel(`team-presence-${conversationId}`, {
      config: { private: true, presence: { key: currentUserId } },
    });
    const track = async () => {
      try {
        await channel.track({ name: currentUserName ?? '', onlineAt: new Date().toISOString() });
      } catch (error) {
        // Autorização negada / canal indisponível: a lista de presença não
        // sincroniza, mas o chat de equipe continua funcionando (nada quebra).
        log.warn('[useTeamPresence] falha ao publicar a presença:', error);
      }
    };
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ name: string; onlineAt: string }>();
        const users: PresenceUser[] = Object.entries(state).map(([userId, metas]) => ({
          userId,
          name: metas[0]?.name ?? '',
          onlineAt: metas[0]?.onlineAt ?? '',
        }));
        setOnlineUsers(users);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await track();
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          log.warn('[useTeamPresence] canal privado de presença indisponível:', status);
        }
      });
    return () => { void supabase.removeChannel(channel); };
  }, [conversationId, currentUserId, currentUserName]);

  return { onlineUsers, onlineCount: onlineUsers.length };
}
