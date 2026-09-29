import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { TEAM_KEYS } from './queryKeys';
import type { TeamInboxRow } from './teamChatTypes';
import { getLogger } from '@/lib/logger';

const log = getLogger('TeamGlobalNotify');
const SOUND_URL = '/sounds/message.mp3';

export function useTeamGlobalNotifications() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio(SOUND_URL);
    audioRef.current.volume = 0.4;
  }, []);

  useEffect(() => {
    if (!profile?.id) return;
    const pid = profile.id;
    const sfx = crypto.randomUUID().slice(0, 8);
    const channel = supabase
      .channel(`team-global-notify-${pid}-${sfx}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_messages' }, (payload) => {
        const msg = payload.new as { sender_id?: string; content?: string; conversation_id?: string };
        if (!msg.conversation_id || msg.sender_id === pid) return;
        const inbox = queryClient.getQueryData<TeamInboxRow[]>(TEAM_KEYS.inbox(pid)) ?? [];
        const row = inbox.find(r => r.conversation_id === msg.conversation_id);
        if (!row || row.is_muted) return;
        void audioRef.current?.play().catch(() => {});
        if (Notification.permission === 'granted') {
          const cid = msg.conversation_id;
          const n = new Notification('Nova mensagem no Team Chat', {
            body: msg.content?.slice(0, 100) ?? '',
            tag: `team-chat-${cid}`,
            data: { cid },
          });
          n.onclick = () => {
            window.focus();
            const url = new URL(window.location.href);
            url.searchParams.set('view', 'team-chat');
            url.searchParams.set('cid', cid);
            window.history.pushState({}, '', url.toString());
            window.dispatchEvent(new PopStateEvent('popstate'));
            n.close();
          };
        }
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('system' as any, {}, (status: string) => {
        if (status === 'CHANNEL_ERROR') log.warn('team-global-notify CHANNEL_ERROR');
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [profile?.id, queryClient]);
}
