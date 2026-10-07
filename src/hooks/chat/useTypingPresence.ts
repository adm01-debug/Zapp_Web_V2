import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';
import { log } from '@/lib/logger';

interface TypingUser {
  oderId: string;
  name: string;
  isTyping: boolean;
  lastTyped: string;
}

interface PresenceState {
  oderId?: string;
  name?: string;
  isTyping?: boolean;
  lastTyped?: string;
}

interface UseTypingPresenceProps {
  conversationId: string;
  currentUserId?: string;
  currentUserName?: string;
}

/**
 * R2-INB-026: identidade literal não é identidade. O `ChatPanel` passava
 * `currentUserId: 'agent'` para TODOS os agentes e esse valor virava a chave do
 * canal de presença — dois agentes no mesmo contato caíam na mesma chave, e o
 * handler de sync descartava toda presença cuja chave fosse igual à própria,
 * ou seja, descartava também o colega. O aviso de "colega digitando" nunca
 * aparecia. Valor de preenchimento é tratado como ausente.
 *
 * Desde o R2-INB-026 o `ChatPanel` envia a identidade real; a normalização do
 * placeholder segue como defesa para qualquer chamador que ainda mande o literal.
 */
const PLACEHOLDER_IDENTITIES = new Set(['agent', 'agente', 'agentes', 'unknown', 'anonimo', 'anon']);

/**
 * Escopo por cliente (aba): a MESMA pessoa em duas abas não pode ocupar a mesma
 * chave de presença — quem entra depois sobrescreveria a presença de quem já
 * estava. O escopo entra na chave, a identidade do agente entra no payload.
 */
function createClientScope(): string {
  try {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return uuid.slice(0, 8);
  } catch {
    /* ambiente sem webcrypto */
  }
  return Math.random().toString(36).slice(2, 10);
}

export function useTypingPresence({
  conversationId,
  currentUserId,
  currentUserName = 'Agente'
}: UseTypingPresenceProps) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [isContactTyping, setIsContactTyping] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const contactTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Escopo desta aba, estável por montagem (inicializador preguiçoso: nada de
  // ler ref durante a renderização).
  const [clientScope] = useState(createClientScope);

  // Identidade do agente: a real quando o chamador tem uma. Sem identidade real
  // (ou com valor de preenchimento) a identidade é a da própria sessão — nunca o
  // literal compartilhado que colidia com todo mundo.
  const providedId = currentUserId?.trim();
  const ownUserId = providedId && !PLACEHOLDER_IDENTITIES.has(providedId.toLowerCase()) ? providedId : '';
  const scopedIdentity = ownUserId || `sessao:${clientScope}`;
  // Chave do canal: identidade + escopo da aba (distinta por cliente).
  const presenceKey = `${scopedIdentity}#${clientScope}`;

  // Track current user typing
  const setTyping = useCallback(async (isTyping: boolean) => {
    if (!channelRef.current) return;

    try {
      await channelRef.current.track({
        oderId: ownUserId,
        name: currentUserName,
        isTyping,
        lastTyped: new Date().toISOString()
      });
    } catch (error) {
      log.error('Error tracking typing status:', error);
    }
  }, [ownUserId, currentUserName]);

  // Debounced typing indicator - call when user is typing
  const handleTypingStart = useCallback(() => {
    setTyping(true);

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Auto-stop typing after 3 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      setTyping(false);
    }, 3000);
  }, [setTyping]);

  // Stop typing immediately
  const handleTypingStop = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    setTyping(false);
  }, [setTyping]);

  useEffect(() => {
    if (!conversationId) return;

    // Create presence channel for this conversation
    const channel = supabase.channel(`typing:${conversationId}`, {
      config: {
        presence: {
          key: presenceKey,
        },
      },
    });

    channelRef.current = channel;

    // Handle presence sync (agent-to-agent typing). Exclui SÓ a própria
    // identidade (inclusive as outras abas dela) e mantém os colegas; colega
    // com mais de uma aba entra uma vez só.
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const users: TypingUser[] = [];
      const seen = new Set<string>();

      // Sem identidade real não dá para separar as PRÓPRIAS abas dos colegas: uma aba
      // do mesmo agente entraria aqui como colega digitando (é o defeito que o cartão
      // recusa). Na dúvida não anunciamos ninguém — o aviso do CONTATO (usuário final)
      // continua vindo do broadcast, que não passa por este handler.
      if (!ownUserId) {
        setTypingUsers([]);
        return;
      }

      Object.entries(state).forEach(([key, presences]) => {
        if (key === presenceKey || !Array.isArray(presences)) return;

        presences.forEach((presence) => {
          const p = presence as unknown as PresenceState;
          const identity = p.oderId || key;
          if (identity === scopedIdentity) return; // outra aba do mesmo agente
          if (!p.isTyping || seen.has(identity)) return;

          seen.add(identity);
          users.push({
            oderId: identity,
            name: p.name || 'Colega',
            isTyping: true,
            lastTyped: p.lastTyped || new Date().toISOString()
          });
        });
      });

      setTypingUsers(users);
      // NOTA (R2-INB-026): presença de agente NÃO liga `isContactTyping`. O
      // indicador do contato (usuário final) vem só do broadcast abaixo; antes,
      // colega digitando era exibido como se o contato estivesse digitando.
    });

    // Handle join event
    channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
      log.debug('User joined typing channel:', key, newPresences);
    });

    // Handle leave event
    channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      log.debug('User left typing channel:', key, leftPresences);
    });

    // Listen for contact typing broadcast from Evolution API webhook
    channel.on('broadcast', { event: 'contact_typing' }, ({ payload }) => {
      const isTyping = payload?.isTyping === true;
      setIsContactTyping(isTyping);

      // Auto-clear after 5 seconds if no new event
      if (contactTypingTimeoutRef.current) {
        clearTimeout(contactTypingTimeoutRef.current);
      }
      if (isTyping) {
        contactTypingTimeoutRef.current = setTimeout(() => {
          setIsContactTyping(false);
        }, 5000);
      }
    });

    // Subscribe to channel
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        log.debug('Subscribed to typing presence for conversation:', conversationId);
      }
    });

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (contactTypingTimeoutRef.current) {
        clearTimeout(contactTypingTimeoutRef.current);
      }
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [conversationId, presenceKey, scopedIdentity, ownUserId]);

  return {
    isContactTyping,
    /** Colega digitando agora (presença de agente). Nunca confundir com o contato. */
    isColleagueTyping: typingUsers.length > 0,
    typingUsers,
    handleTypingStart,
    handleTypingStop
  };
}
