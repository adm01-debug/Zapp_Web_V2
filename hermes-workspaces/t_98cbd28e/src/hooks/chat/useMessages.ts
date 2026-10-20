import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { mapMessageRowToMessage } from '@/adapters/inboxAdapter';
import { useSupabaseRealtime } from '@/hooks/realtime/useSupabaseRealtime';
import { contactMediaKey } from '@/hooks/chat/useContactMedia';
import { contactMediaCountsKey } from '@/hooks/chat/useContactMediaCounts';
import { conversationTabCountsKey } from '@/hooks/chat/useConversationTabCounts';
import { ChatService, Message } from '@/services/chat.service';
import type { MessageRow } from '@/types/chat';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { log } from '@/lib/logger';

interface UseMessagesOptions {
  contactId: string | null;
  enabled?: boolean;
}

const MESSAGES_PAGE_SIZE = 1000;

/**
 * #310 (R2-INB-013): entrada do overlay de realtime com a geracao em que foi escrita.
 * O overlay existe para preservar o que o snapshot NAO viu — INSERT/UPDATE/DELETE ocorridos
 * DURANTE a consulta. Sem a geracao ele vencia qualquer leitura posterior, entao um
 * `delivered`/conteudo antigo reintroduzido pelo overlay sobrevivia ao refetch autoritativo.
 */
interface RealtimeOverlayEntry {
  message: Message | null;
  generation: number;
}

export function useMessages({ contactId, enabled = true }: UseMessagesOptions) {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previousContactIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const activeContactIdRef = useRef<string | null>(contactId);
  const requestGenerationRef = useRef(0);
  const loadingOlderRef = useRef(false);
  const realtimeOverlayRef = useRef<Map<string, RealtimeOverlayEntry>>(new Map());
  // Relogio logico do overlay: cada escrita recebe a geracao corrente. O fetch guarda a geracao do
  // instante em que comecou e so aplica entradas POSTERIORES a ela (ver reconciliacao abaixo).
  const overlayGenerationRef = useRef(0);
  const loadedContactIdRef = useRef<string | null>(null);

  // Track mount state to prevent setState after unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Etapa 45 / #144: galeria, badge da aba e chips por tipo (etapa 42) compartilham o universo
  // de mídia. Qualquer mudança nele (INSERT, UPDATE de `is_deleted`/`media_url`, DELETE) precisa
  // invalidar as TRÊS chaves, senão chip e badge divergem sem reload.
  const invalidateMediaAggregates = useCallback(
    (targetContactId: string) => {
      queryClient.invalidateQueries({ queryKey: contactMediaKey(targetContactId) });
      queryClient.invalidateQueries({ queryKey: conversationTabCountsKey(targetContactId) });
      queryClient.invalidateQueries({ queryKey: contactMediaCountsKey(targetContactId) });
    },
    [queryClient],
  );

  // #310: toda escrita no overlay carimba a geracao corrente — e o que permite separar
  // "evento anterior ao snapshot" (perde para ele) de "evento ocorrido durante o fetch" (vence).
  const writeOverlay = useCallback((id: string, message: Message | null) => {
    overlayGenerationRef.current += 1;
    realtimeOverlayRef.current.set(id, { message, generation: overlayGenerationRef.current });
  }, []);

  // Fetch messages for contact
  const fetchMessages = useCallback(async () => {
    const requestedContactId = contactId;
    const generation = ++requestGenerationRef.current;
    // #310: geracao do overlay no inicio da consulta. Entradas com geracao <= esta sao anteriores
    // ao snapshot (a leitura ja as ve) e perdem para ele.
    const overlayGenerationAtStart = overlayGenerationRef.current;
    if (!requestedContactId) {
      if (mountedRef.current) {
        setMessages([]);
        setLoading(false);
      }
      return;
    }

    // Refetch de conversa já carregada (ex.: pós-envio) é silencioso: sem loading o
    // RealtimeInboxView não troca o ChatPanel pelo fallback (remount perdia reply,
    // diálogos, scroll e o "Desfazer"), e páginas antigas já carregadas são mantidas.
    const silent = loadedContactIdRef.current === requestedContactId;
    try {
      if (mountedRef.current) {
        if (!silent) {
          setLoading(true);
          setHasOlder(false);
        }
        loadingOlderRef.current = false;
        setLoadingOlder(false);
        setError(null);
      }

      const { data, error: fetchError } = await ChatService.fetchMessages(requestedContactId, 0, MESSAGES_PAGE_SIZE);
      if (fetchError) throw fetchError;

      if (mountedRef.current && generation === requestGenerationRef.current &&
        activeContactIdRef.current === requestedContactId && data) {
        const snapshot = data.map((row) => mapMessageRowToMessage(row));
        const timeOf = (message: Message) => new Date(message.created_at || 0).getTime();
        const keepOlder = silent && data.length === MESSAGES_PAGE_SIZE;
        const oldestInSnapshot = Math.min(...snapshot.map(timeOf));
        setMessages((current) => {
          const merged = new Map<string, Message>();
          if (keepOlder) {
            for (const message of current) if (timeOf(message) < oldestInSnapshot) merged.set(message.id, message);
          }
          for (const message of snapshot) merged.set(message.id, message);
          for (const [id, entry] of realtimeOverlayRef.current) {
            // #310 (R2-INB-013): so eventos ocorridos DURANTE esta consulta vencem o snapshot;
            // reaplicar um evento anterior reintroduziria estado ja ultrapassado.
            if (entry.generation <= overlayGenerationAtStart) continue;
            if (entry.message) merged.set(id, entry.message);
            else merged.delete(id);
          }
          return [...merged.values()].sort((a, b) => timeOf(a) - timeOf(b));
        });
        if (!keepOlder) setHasOlder(data.length === MESSAGES_PAGE_SIZE);
        loadedContactIdRef.current = requestedContactId;
      }
    } catch (err) {
      log.error('Error fetching messages:', err);
      if (mountedRef.current && generation === requestGenerationRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to fetch messages');
      }
    } finally {
      if (mountedRef.current && generation === requestGenerationRef.current) {
        setLoading(false);
      }
    }
  }, [contactId]);

  const loadOlderMessages = useCallback(async () => {
    const requestedContactId = contactId;
    const generation = requestGenerationRef.current;
    if (!requestedContactId || loadingOlderRef.current || !hasOlder || messages.length === 0) return;

    const oldest = messages[0];
    const createdAt = oldest.created_at || oldest.timestamp?.toISOString();
    if (!createdAt) {
      setHasOlder(false);
      return;
    }

    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const { data, error: fetchError } = await ChatService.fetchMessagesBefore(
        requestedContactId,
        { createdAt, id: oldest.id },
        MESSAGES_PAGE_SIZE,
      );
      if (fetchError) throw fetchError;
      if (!mountedRef.current || generation !== requestGenerationRef.current ||
        activeContactIdRef.current !== requestedContactId || !data) return;

      const older = data.map((row) => mapMessageRowToMessage(row));
      setMessages((current) => {
        const merged = new Map(older.map((message) => [message.id, message]));
        for (const message of current) merged.set(message.id, message);
        return [...merged.values()].sort((a, b) =>
          new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        );
      });
      setHasOlder(data.length === MESSAGES_PAGE_SIZE);
    } catch (err) {
      log.error('Error fetching older messages:', err);
      if (mountedRef.current && generation === requestGenerationRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to fetch older messages');
      }
    } finally {
      if (mountedRef.current && generation === requestGenerationRef.current) {
        loadingOlderRef.current = false;
        setLoadingOlder(false);
      }
    }
  }, [contactId, hasOlder, messages]);

  // Handle new message from realtime
  const handleNewMessage = useCallback(
    (payload: RealtimePostgresChangesPayload<MessageRow>) => {
      const row = payload.new as MessageRow;
      const newMessage = mapMessageRowToMessage(row);

      // Only add if it's for the current contact and not already present
      if (newMessage.contact_id === contactId) {
        writeOverlay(newMessage.id, newMessage);
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMessage.id)) {
            return prev;
          }
          // Sort after adding just in case of race conditions
          return [...prev, newMessage].sort((a, b) =>
            new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
          );
        });

        // Etapa 45: mensagem nova COM midia muda a galeria da aba Arquivos e as contagens dela.
        // Sem invalidar as tres, chip e badge divergem logo apos a midia chegar (o G11 da etapa 42).
        if (row.media_url) {
          invalidateMediaAggregates(contactId as string);
        }
      }
    },
    [contactId, invalidateMediaAggregates, writeOverlay]
  );

  // Handle message update from realtime
  const handleMessageUpdate = useCallback(
    (payload: RealtimePostgresChangesPayload<MessageRow>) => {
      const newRow = payload.new as MessageRow;
      const updatedMessage = mapMessageRowToMessage(newRow);

      if (updatedMessage.contact_id === contactId) {
        writeOverlay(updatedMessage.id, updatedMessage);
        setMessages((prev) =>
          prev.map((m) => (m.id === updatedMessage.id ? updatedMessage : m))
        );

        // #144/OTH-002: so invalida quando o universo de midia muda DE FATO — compara os DOIS
        // lados (`old` x `new`) de `is_deleted` e `media_url`. Um UPDATE de status/ack numa
        // mensagem COM midia mantem os dois iguais e NAO dispara refetch em rajada.
        // Fallback: sem REPLICA IDENTITY FULL o Realtime entrega em `old` so a PK (sem as
        // colunas), entao nao ha como comparar — invalida conservadoramente se a linha nova
        // tem midia, para nao perder a atualizacao dos agregados.
        const oldRow = (payload.old ?? {}) as Partial<MessageRow>;
        const oldHasMediaColumns = 'media_url' in oldRow || 'is_deleted' in oldRow;
        const mediaUniverseChanged = oldHasMediaColumns
          ? (oldRow.is_deleted ?? false) !== (newRow.is_deleted ?? false) ||
            (oldRow.media_url ?? null) !== (newRow.media_url ?? null)
          : !!newRow.media_url;

        if (mediaUniverseChanged) {
          invalidateMediaAggregates(contactId as string);
        }
      }
    },
    [contactId, invalidateMediaAggregates, writeOverlay]
  );

  // Handle message delete from realtime
  const handleMessageDelete = useCallback(
    (payload: RealtimePostgresChangesPayload<MessageRow>) => {
      const deletedMessage = payload.old as MessageRow;

      if (deletedMessage.contact_id === contactId) {
        writeOverlay(deletedMessage.id, null);
        setMessages((prev) => prev.filter((m) => m.id !== deletedMessage.id));

        // #144/OTH-002: um DELETE remoto de midia tambem muda chips/badge/galeria.
        if (deletedMessage.media_url) {
          invalidateMediaAggregates(contactId as string);
        }
      }
    },
    [contactId, invalidateMediaAggregates, writeOverlay]
  );

  // Fetch on contact change
  useEffect(() => {
    activeContactIdRef.current = enabled ? contactId : null;
    if (!enabled || !contactId) {
      requestGenerationRef.current += 1;
      loadingOlderRef.current = false;
      previousContactIdRef.current = null;
      loadedContactIdRef.current = null;
      realtimeOverlayRef.current.clear();
      const invalidatedGeneration = requestGenerationRef.current;
      void Promise.resolve().then(() => {
        if (!mountedRef.current || requestGenerationRef.current !== invalidatedGeneration) return;
        setMessages([]);
        setLoading(false);
        setLoadingOlder(false);
        setHasOlder(false);
        setError(null);
      });
      return;
    }
    if (contactId !== previousContactIdRef.current) {
      previousContactIdRef.current = contactId;
      loadedContactIdRef.current = null;
      realtimeOverlayRef.current.clear();
      // Clear messages and set loading immediately to prevent UI flicker of old messages
      setMessages([]);
      setLoading(true);
      void fetchMessages();
    }
  }, [contactId, enabled, fetchMessages]);

   // Subscribe to realtime updates using the standardized hook
   useSupabaseRealtime<MessageRow>({
     channelName: `messages:${contactId}`,
     table: 'messages',
     filter: contactId ? `contact_id=eq.${contactId}` : undefined,
     enabled: enabled && !!contactId,
     onInsert: handleNewMessage,
     onUpdate: handleMessageUpdate,
     onDelete: handleMessageDelete,
   });

  // Add a message optimistically
  const addMessage = useCallback((message: Message) => {
    writeOverlay(message.id, message);
    setMessages((prev) => {
      if (prev.some((m) => m.id === message.id)) {
        return prev;
      }
      return [...prev, message];
    });
  }, [writeOverlay]);

  // Update a message optimistically
  const updateMessage = useCallback((messageId: string, updates: Partial<Message>) => {
    setMessages((prev) => prev.map((message) => {
      if (message.id !== messageId) return message;
      const updated = { ...message, ...updates };
      writeOverlay(messageId, updated);
      return updated;
    }));
  }, [writeOverlay]);

  // Remove a message optimistically
  const removeMessage = useCallback((messageId: string) => {
    writeOverlay(messageId, null);
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, [writeOverlay]);

  return {
    messages,
    loading,
    loadingOlder,
    hasOlder,
    error,
    refetch: fetchMessages,
    loadOlderMessages,
    addMessage,
    updateMessage,
    removeMessage,
  };
}
