import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TypingUser { userId: string; name: string; }

/** F85 — throttle do aviso enviado: no máximo 1 `typing:true` a cada 2 s. */
export const TYPING_THROTTLE_MS = 2000;
/** F85 — sem novo aviso de digitação por 3 s, o "está digitando…" para. */
export const TYPING_STOP_MS = 3000;
/** Aviso recebido de outra pessoa some sozinho depois deste tempo. */
export const TYPING_HIDE_MS = 4000;

export function useTeamTyping(
  conversationId: string,
  currentUserId: string | null,
  currentUserName?: string,
) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentAtRef = useRef<number>(0);
  const hideTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const ch = supabase.channel(`team-typing-${conversationId}`);
    const hideTimers = hideTimersRef.current;
    channelRef.current = ch;
    ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
      const p = payload as { userId: string; name: string; typing: boolean };
      if (p.userId === currentUserId) return;

      const pendingHide = hideTimers.get(p.userId);
      if (pendingHide) {
        clearTimeout(pendingHide);
        hideTimers.delete(p.userId);
      }

      if (p.typing) {
        setTypingUsers(prev => (
          prev.find(u => u.userId === p.userId) ? prev : [...prev, { userId: p.userId, name: p.name }]
        ));
        hideTimers.set(p.userId, setTimeout(() => {
          hideTimers.delete(p.userId);
          setTypingUsers(prev => prev.filter(u => u.userId !== p.userId));
        }, TYPING_HIDE_MS));
      } else {
        setTypingUsers(prev => prev.filter(u => u.userId !== p.userId));
      }
    }).subscribe();
    return () => {
      // F88: nenhum timer sobrevive ao unmount — nem o que esconde o aviso
      // recebido, nem o que envia o "parou de digitar" no canal que vai sair.
      hideTimers.forEach(clearTimeout);
      hideTimers.clear();
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      channelRef.current = null;
      void supabase.removeChannel(ch);
    };
  }, [conversationId, currentUserId]);

  const sendTyping = useCallback((isTyping: boolean) => {
    const channel = channelRef.current;
    if (!currentUserId || !channel) return;

    if (!isTyping) {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      lastSentAtRef.current = 0;
      void channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: currentUserId, name: currentUserName ?? '', typing: false },
      });
      return;
    }

    // F85: o aviso de "estou digitando" é repetido a cada tecla — o canal leva
    // no máximo 1 envio por 2 s (throttle), mas o relógio de parada é sempre
    // reiniciado, então quem digita sem pausa nunca é dado como parado.
    const now = Date.now();
    if (now - lastSentAtRef.current >= TYPING_THROTTLE_MS) {
      lastSentAtRef.current = now;
      void channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: currentUserId, name: currentUserName ?? '', typing: true },
      });
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      typingTimeoutRef.current = null;
      lastSentAtRef.current = 0;
      const ch = channelRef.current;
      if (ch) {
        void ch.send({
          type: 'broadcast',
          event: 'typing',
          payload: { userId: currentUserId, name: currentUserName ?? '', typing: false },
        });
      }
    }, TYPING_STOP_MS);
  }, [currentUserId, currentUserName]);

  const typingLabel = typingUsers.length === 0
    ? null
    : typingUsers.length === 1
      ? `${typingUsers[0].name} está digitando...`
      : `${typingUsers.length} pessoas estão digitando...`;

  return { typingLabel, sendTyping, typingUsers };
}
