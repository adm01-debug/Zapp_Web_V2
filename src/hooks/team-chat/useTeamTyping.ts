import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('TeamTyping');

interface TypingUser { userId: string; name: string; }

export function useTeamTyping(
  conversationId: string,
  currentUserId: string | null,
  currentUserName?: string,
) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const ch = supabase.channel(`team-typing-${conversationId}`);
    channelRef.current = ch;
    ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
      const p = payload as { userId: string; name: string; typing: boolean };
      if (p.userId === currentUserId) return;
      setTypingUsers(prev => {
        if (p.typing) {
          if (prev.find(u => u.userId === p.userId)) return prev;
          return [...prev, { userId: p.userId, name: p.name }];
        }
        return prev.filter(u => u.userId !== p.userId);
      });
      if (p.typing) {
        setTimeout(() => {
          setTypingUsers(prev => prev.filter(u => u.userId !== p.userId));
        }, 4000);
      }
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .on('system' as any, {}, (status: string) => {
      if (status === 'CHANNEL_ERROR') log.warn('team-typing CHANNEL_ERROR', { conversationId });
    })
    .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [conversationId, currentUserId]);

  const sendTyping = useCallback((isTyping: boolean) => {
    if (!currentUserId || !channelRef.current) return;
    void channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: currentUserId, name: currentUserName ?? '', typing: isTyping },
    });
    if (isTyping) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        if (channelRef.current) {
          void channelRef.current.send({
            type: 'broadcast',
            event: 'typing',
            payload: { userId: currentUserId, name: currentUserName ?? '', typing: false },
          });
        }
      }, 3000);
    }
  }, [currentUserId, currentUserName]);

  const typingLabel = typingUsers.length === 0
    ? null
    : typingUsers.length === 1
      ? `${typingUsers[0].name} está digitando...`
      : `${typingUsers.length} pessoas estão digitando...`;

  return { typingLabel, sendTyping, typingUsers };
}
