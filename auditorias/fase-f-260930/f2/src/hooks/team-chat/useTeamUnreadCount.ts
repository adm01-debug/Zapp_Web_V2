import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

const storageKey = (cid: string) => `team-chat-unread-${cid}`;

export function useTeamUnreadCount(conversationId: string) {
  const [unread, setUnread] = useState<number>(() => {
    try { return parseInt(localStorage.getItem(storageKey(conversationId)) ?? '0', 10) || 0; } catch { return 0; }
  });

  const markRead = useCallback(() => {
    setUnread(0);
    try { localStorage.setItem(storageKey(conversationId), '0'); } catch { /* ignore */ }
  }, [conversationId]);

  useEffect(() => {
    const channel = supabase
      .channel(`team-unread-${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'team_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, () => {
        setUnread(prev => {
          const next = prev + 1;
          try { localStorage.setItem(storageKey(conversationId), String(next)); } catch { /* ignore */ }
          return next;
        });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [conversationId]);

  return { unread, markRead };
}
