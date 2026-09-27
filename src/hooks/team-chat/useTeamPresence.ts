import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PresenceUser { userId: string; name: string; onlineAt: string; }

export function useTeamPresence(
  conversationId: string,
  currentUserId: string | null,
  currentUserName?: string,
) {
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase.channel(`team-presence-${conversationId}`, {
      config: { presence: { key: currentUserId } },
    });
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
          await channel.track({ name: currentUserName ?? '', onlineAt: new Date().toISOString() });
        }
      });
    return () => { void supabase.removeChannel(channel); };
  }, [conversationId, currentUserId, currentUserName]);

  return { onlineUsers, onlineCount: onlineUsers.length };
}
