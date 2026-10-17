import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { getLogger } from '@/lib/logger';
import { MessageRow } from '@/types/chat';
import { ContactRow } from '@/types/contact';
import { RealtimeService } from '@/services/realtime.service';
import { useSupabaseRealtime } from '../realtime/useSupabaseRealtime';
import { sendMessageToContact } from '../realtime/messageSender';
import {
  normalizeMessage, buildConversation,
} from '../realtime/realtimeUtils';
import { useRealtimeNotifications } from '../realtime/useRealtimeNotifications';
import { useMessageUpdateBatcher } from '../realtime/useMessageUpdateBatcher';

const log = getLogger('RealtimeMessages');

// Tetô da revalidação incremental (mesmo valor do default do serviço). A
// consulta é ASCENDENTE e não pagina: atingir o teto significa que pode existir
// mensagem nova fora do lote — ver fetchIncrementalConversations.
const INCREMENTAL_FETCH_LIMIT = 200;

export interface NewMessageNotification {
  id: string;
  contactId: string;
  contactName: string;
  contactAvatar: string | null;
  message: string;
  timestamp: Date;
}

export type RealtimeMessage = MessageRow;
export type ConversationContact = ContactRow;

export interface ConversationWithMessages {
  contact: ConversationContact;
  messages: RealtimeMessage[];
  unreadCount: number;
  lastMessage: RealtimeMessage | null;
}

export function useRealtimeMessages() {
  const [conversations, setConversations] = useState<ConversationWithMessages[]>([]);
  const [loading, setLoading] = useState(true);
  // R2-INB-*: distingue a PRIMEIRA carga de qualquer refetch/reconexão. Com
  // lista, a revalidação é silenciosa (`refreshing` gira o RefreshCw; `loading`
  // e `error` não são tocados), então a lista só troca por esqueletos enquanto
  // a primeira busca ainda não trouxe conversas — antes a sidebar usava
  // `loading` e a lista piscava a cada refetch/reconexão.
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // `refreshing` = busca em voo DEPOIS da primeira carga (gira o RefreshCw).
  // `loading`/`error` não podem ser tocados em refetch com lista (a lista não
  // volta ao esqueleto e a tela de erro não toma o lugar dela), então o
  // spinner usa este sinal dedicado.
  const [refreshing, setRefreshing] = useState(false);
  const conversationsRef = useRef<ConversationWithMessages[]>([]);
  const mountedRef = useRef(true);
  const fetchGenerationRef = useRef(0);
  const firstFetchSettledRef = useRef(false);
  const liveRevisionRef = useRef(0);
  // Dedupe de INSERT repetido ANTES de commitar e de notificar (por id da
  // mensagem). O realtime pode entregar o mesmo INSERT 2x (retry do socket);
  // sem este registro o segundo processamento re-commitava e re-tocava o som.
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const markMessageSeen = useCallback((id: string): boolean => {
    const seen = seenMessageIdsRef.current;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    // Poda: o conjunto só cobre a janela realtime; mensagens antigas já estão
    // dedupadas pelo commit (cheque de id dentro do updater).
    if (seen.size > 1000) {
      const excesso = seen.size - 1000;
      let i = 0;
      for (const antigo of seen) {
        seen.delete(antigo);
        if (++i >= excesso) break;
      }
    }
    return true;
  }, []);
  // Hidratação em lote: mensagens de contatos ainda fora da lista acumulam por
  // ~150 ms e saem numa única busca de contatos (em vez de 1 por mensagem).
  const HYDRATION_BATCH_MS = 150;
  const HYDRATION_RETRY_MS = 250;
  const pendingHydrationRef = useRef<Map<string, RealtimeMessage[]>>(new Map());
  const hydrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      fetchGenerationRef.current += 1;
    };
  }, []);

  const {
    newMessageNotification, notifyAboutIncomingMessage,
    dismissNotification, setSelectedContact, setSoundEnabled,
  } = useRealtimeNotifications();

  const commitConversations = useCallback(
    (updater: ConversationWithMessages[] | ((prev: ConversationWithMessages[]) => ConversationWithMessages[])) => {
      setConversations((prev) => {
        const next = typeof updater === 'function'
          ? (updater as (prev: ConversationWithMessages[]) => ConversationWithMessages[])(prev)
          : updater;
        conversationsRef.current = next;
        return next;
      });
    },
    []
  );

  // Uma tentativa com um único retry após espera curta: falha transitória de
  // rede no meio da hidratação não pode perder as conversas que entraram ao
  // vivo (a próxima revalidação as traria, mas o ao vivo deve se recuperar
  // sozinho quando der).
  const buscarComRetry = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (primeiroErro) {
      await new Promise((resolve) => setTimeout(resolve, HYDRATION_RETRY_MS));
      if (!mountedRef.current) throw primeiroErro;
      return fn();
    }
  }, []);

  // Descarrega o lote pendente: UMA busca de contatos para todos os ids
  // acumulados na janela, insere as conversas e só então notifica cada
  // mensagem (o dedupe por id já foi garantido pelo mark no enfileiramento).
  const flushHydrations = useCallback(async () => {
    hydrationTimerRef.current = null;
    const pendentes = pendingHydrationRef.current;
    if (pendentes.size === 0) return;
    pendingHydrationRef.current = new Map();
    const ids = Array.from(pendentes.keys());
    let contacts: ConversationContact[];
    try {
      contacts = await buscarComRetry(() => RealtimeService.fetchContactsByIds(ids));
    } catch (err) {
      log.error('Error hydrating new conversations (lote):', err);
      return;
    }
    if (!mountedRef.current || contacts.length === 0) return;
    liveRevisionRef.current += 1;
    commitConversations((prev) => {
      let next = prev;
      let changed = false;
      for (const contact of contacts) {
        if (next.some((c) => c.contact.id === contact.id)) continue;
        const msgs = pendentes.get(contact.id) ?? [];
        if (msgs.length === 0) continue;
        next = [buildConversation(contact, msgs), ...next];
        changed = true;
      }
      return changed ? next : prev;
    });
    for (const contact of contacts) {
      for (const m of pendentes.get(contact.id) ?? []) {
        notifyAboutIncomingMessage(contact, m);
      }
    }
  }, [buscarComRetry, commitConversations, notifyAboutIncomingMessage]);

  // Enfileira sem marcar (o chamador já marcou): usado pelo handleNewMessage
  // (marca no topo) e pelo flush incremental (marca ao agrupar).
  const enfileirarHidratacao = useCallback((message: RealtimeMessage) => {
    if (!message.contact_id) return;
    const lista = pendingHydrationRef.current.get(message.contact_id) ?? [];
    if (!lista.some((m) => m.id === message.id)) lista.push(message);
    pendingHydrationRef.current.set(message.contact_id, lista);
    if (hydrationTimerRef.current === null) {
      hydrationTimerRef.current = setTimeout(() => { void flushHydrations(); }, HYDRATION_BATCH_MS);
    }
  }, [flushHydrations]);

  const hydrateConversationForMessage = useCallback(
    async (message: RealtimeMessage) => {
      if (!message.contact_id) return;
      // INSERT/UPDATE repetido do mesmo id: sai ANTES de buscar e de
      // notificar de novo.
      if (!markMessageSeen(message.id)) return;
      enfileirarHidratacao(message);
    },
    [enfileirarHidratacao, markMessageSeen]
  );

  // Entrada ao vivo por UPDATE de contato (transferência/atribuição/fila que o
  // tornou visível): busca contato+resumo e insere a conversa. Sem mensagem
  // nova, o resumo sustenta preview e não lidas via buildConversation.
  const hydrateConversationForContact = useCallback(async (contactId: string) => {
    let contacts: ConversationContact[];
    let summaries: Awaited<ReturnType<typeof RealtimeService.fetchContactSummaries>>;
    try {
      [contacts, summaries] = await Promise.all([
        buscarComRetry(() => RealtimeService.fetchContactsByIds([contactId])),
        buscarComRetry(() => RealtimeService.fetchContactSummaries([contactId])),
      ]);
    } catch (err) {
      log.error('Error hydrating conversation for contact update:', err);
      return;
    }
    const contact = contacts[0];
    if (!mountedRef.current || !contact) return;
    // Só entra quem tem CONVERSA de verdade (resumo do banco com última
    // mensagem). Um UPDATE de contato sem histórico — editado na tela Contatos
    // ou fora da janela da carga inicial — não é uma conversa da inbox: antes
    // ele entrava como conversa VAZIA (sem preview, 0 não lidas), poluindo a
    // lista. Sem resumo, o UPDATE é ignorado.
    const summary = summaries.get(contact.id) ?? null;
    if (!summary?.lastMessage) return;
    if (conversationsRef.current.some((c) => c.contact.id === contact.id)) return;
    liveRevisionRef.current += 1;
    commitConversations((prev) => {
      if (prev.some((c) => c.contact.id === contact.id)) return prev;
      return [buildConversation(contact, [], summary), ...prev];
    });
  }, [buscarComRetry, commitConversations]);

  const { handleMessageUpdate: handleBatchedMessageUpdate } = useMessageUpdateBatcher(
    conversationsRef,
    commitConversations,
    hydrateConversationForMessage,
  );
  const handleMessageUpdate = useCallback((payload: RealtimePostgresChangesPayload<RealtimeMessage>) => {
    liveRevisionRef.current += 1;
    handleBatchedMessageUpdate(payload);
  }, [handleBatchedMessageUpdate]);

  const handleNewMessage = useCallback(
    (payload: RealtimePostgresChangesPayload<RealtimeMessage>) => {
      const newMessage = normalizeMessage(payload.new as RealtimeMessage);
      if (!newMessage.contact_id) return;
      // INSERT repetido (retry do socket): sai ANTES de commitar e de
      // notificar — sem isso o segundo processamento re-tocava o som/browser.
      if (!markMessageSeen(newMessage.id)) return;

      liveRevisionRef.current += 1;
      const existingConversation = conversationsRef.current.find((c) => c.contact.id === newMessage.contact_id);
      if (!existingConversation) { enfileirarHidratacao(newMessage); return; }

      commitConversations((prev) => {
        const idx = prev.findIndex((c) => c.contact.id === newMessage.contact_id);
        if (idx < 0) return prev;
        const conv = prev[idx];
        if (conv.messages.some((m) => m.id === newMessage.id)) return prev;
        const updated = [...prev];
        updated.splice(idx, 1);
        updated.unshift(buildConversation(conv.contact, [...conv.messages, newMessage]));
        return updated;
      });

      notifyAboutIncomingMessage(existingConversation.contact, newMessage);
    },
    [commitConversations, enfileirarHidratacao, markMessageSeen, notifyAboutIncomingMessage]
  );

  // Sem isso, editar apelido/cargo/empresa etc. (EditContactDialog) so
  // aparece na lista apos reload — o contato em memoria so era atualizado
  // via hidratacao de mensagem nova, nunca por UPDATE direto na tabela.
  // Postgres manda a linha completa no payload de UPDATE (nao e merge
  // parcial), entao substituir c.contact inteiro e seguro.
  const handleContactUpdate = useCallback(
    (payload: RealtimePostgresChangesPayload<ConversationContact>) => {
      const updatedContact = payload.new as ConversationContact;
      if (!updatedContact?.id) return;
      // Sem isso, um fetchConversations em voo (disparado por handleSendMessage,
      // por exemplo) sobrescrevia esse UPDATE ao resolver: fetchConversations só
      // preserva eventos ao vivo quando liveRevisionRef mudou durante o request
      // (linha ~166), e este handler nunca incrementava a revision — apelido/
      // cargo/empresa editados voltavam ao valor antigo na lista até o próximo
      // evento realtime.
      liveRevisionRef.current += 1;
      if (!conversationsRef.current.some((c) => c.contact.id === updatedContact.id)) {
        // UPDATE de contato AINDA fora da lista (transferência/atribuição/fila
        // que o tornou visível): busca contato+resumo e insere a conversa ao
        // vivo, em vez de descartar (`return prev`) e esperar o próximo refetch.
        void hydrateConversationForContact(updatedContact.id);
        return;
      }
      commitConversations((prev) => {
        const idx = prev.findIndex((c) => c.contact.id === updatedContact.id);
        if (idx < 0) return prev;
        const updated = [...prev];
        // Merge, não substitui: o payload de UPDATE do Realtime só traz colunas
        // de contacts, nunca o embed conversation_sla (join feito em
        // fetchInitialConversations/fetchContactsByIds). Substituir o objeto
        // inteiro apagava o SLA em memória a cada UPDATE — o badge passava a
        // contar desde created_at do contato em vez do atendimento aberto.
        updated[idx] = { ...updated[idx], contact: { ...updated[idx].contact, ...updatedContact } };
        return updated;
      });
    },
    [commitConversations, hydrateConversationForContact]
  );

  // Saída ao vivo: DELETE do contato remove a conversa da lista sem esperar o
  // próximo refetch. (Arquivamento/mudança de status NÃO remove aqui: o filtro
  // por aba é client-side na sidebar e a aba "Arquivadas" precisa desses dados.)
  const handleContactDelete = useCallback(
    (payload: RealtimePostgresChangesPayload<ConversationContact>) => {
      const old = payload.old as Partial<ConversationContact> | null;
      const contactId = old?.id;
      if (!contactId) return;
      if (!conversationsRef.current.some((c) => c.contact.id === contactId)) return;
      liveRevisionRef.current += 1;
      commitConversations((prev) => prev.filter((c) => c.contact.id !== contactId));
    },
    [commitConversations]
  );

  const fetchConversations = useCallback(async () => {
    const generation = ++fetchGenerationRef.current;
    const startingLiveRevision = liveRevisionRef.current;
    const primeiraCarga = conversationsRef.current.length === 0;
    try {
      if (primeiraCarga) {
        setLoading(true);
        setError(null);
      } else {
        // Revalidação com lista: silenciosa — não acende `loading` (a lista
        // não volta ao esqueleto) nem publica `error` (a tela de "Erro de
        // conexão" não toma o lugar da lista); falha vira só o toast.
        setRefreshing(true);
      }
      const builtConversations = await RealtimeService.fetchInitialConversations();
      if (!mountedRef.current || generation !== fetchGenerationRef.current) return;
      if (liveRevisionRef.current === startingLiveRevision) {
        commitConversations(builtConversations);
      } else {
        // Preserve events received while the snapshot request was in flight.
        commitConversations((current) => {
          const liveByContact = new Map(current.map((conversation) => [conversation.contact.id, conversation]));
          const merged = builtConversations.map((snapshot) => {
            const live = liveByContact.get(snapshot.contact.id);
            if (!live) return snapshot;
            liveByContact.delete(snapshot.contact.id);
            const messages = new Map(snapshot.messages.map((message) => [message.id, message]));
            for (const message of live.messages) messages.set(message.id, message);
            return buildConversation(live.contact, [...messages.values()]);
          });
          return [...liveByContact.values(), ...merged];
        });
      }
    } catch (err) {
      if (!mountedRef.current || generation !== fetchGenerationRef.current) return;
      const errorMessage = err instanceof Error ? err.message : 'Falha ao carregar conversas';
      log.error('Error fetching conversations:', err);
      // Com lista, o erro NÃO derruba a tela: só o toast (não bloqueante).
      if (primeiraCarga) {
        setError(errorMessage);
      }
      void import('sonner').then(({ toast }) => {
        toast.error('Erro de conexão', {
          description: 'Não foi possível carregar suas conversas. Verifique sua conexão.'
        });
      });
    } finally {
      if (mountedRef.current && generation === fetchGenerationRef.current) {
        setLoading(false);
        setRefreshing(false);
        // Só a primeira busca resolvida encerra o estado de "primeira carga";
        // refetch/reconexão não devolvem a lista ao esqueleto.
        if (!firstFetchSettledRef.current) {
          firstFetchSettledRef.current = true;
          setInitialLoading(false);
        }
      }
    }
  }, [commitConversations]);

  // Revalidação incremental pós-queda/reconexão: em vez da recarga total
  // (500 contatos + 1000 mensagens a cada foco), busca só as mensagens mais
  // novas que o marco conhecido e mescla na lista. Sem lista ou sem marco
  // temporal, cai na recarga total. Falha aqui nunca derruba a lista.
  const fetchIncrementalConversations = useCallback(async () => {
    const conhecidas = conversationsRef.current;
    if (conhecidas.length === 0) return fetchConversations();
    let since: string | null = null;
    for (const c of conhecidas) {
      for (const m of c.messages) {
        if (!since || m.created_at > since) since = m.created_at;
      }
    }
    if (!since) return fetchConversations();
    setRefreshing(true);
    try {
      const novas = await RealtimeService.fetchMessagesSince(since, INCREMENTAL_FETCH_LIMIT);
      if (!mountedRef.current) return;
      // Teto atingido: a consulta não pagina, então pode haver mensagem nova
      // fora do lote. Mesclar só as 200 mais antigas deixaria a lista errada em
      // silêncio — cai na recarga total (silenciosa: a lista já está na tela).
      if (novas.length >= INCREMENTAL_FETCH_LIMIT) {
        await fetchConversations();
        return;
      }
      if (novas.length === 0) return;
      const porContato = new Map<string, RealtimeMessage[]>();
      for (const m of novas) {
        if (!m.contact_id) continue;
        if (!markMessageSeen(m.id)) continue;
        const lista = porContato.get(m.contact_id) ?? [];
        lista.push(m);
        porContato.set(m.contact_id, lista);
      }
      if (porContato.size === 0) return;
      liveRevisionRef.current += 1;
      commitConversations((prev) => {
        let next = prev;
        for (const [contactId, msgs] of porContato) {
          const idx = next.findIndex((c) => c.contact.id === contactId);
          if (idx < 0) continue; // desconhecidos entram pelo lote de hidratação
          const conv = next[idx];
          const ids = new Set(conv.messages.map((m) => m.id));
          const frescas = msgs.filter((m) => !ids.has(m.id));
          if (frescas.length === 0) continue;
          const todas = [...conv.messages, ...frescas].sort((a, b) => a.created_at.localeCompare(b.created_at));
          next = [
            ...next.slice(0, idx),
            {
              ...conv,
              messages: todas,
              unreadCount: conv.unreadCount + frescas.filter((m) => !m.is_read).length,
              lastMessage: todas[todas.length - 1] ?? conv.lastMessage,
            },
            ...next.slice(idx + 1),
          ];
        }
        if (next === prev) return prev;
        return [...next].sort((a, b) => {
          const timeA = a.lastMessage?.created_at ?? a.contact.updated_at;
          const timeB = b.lastMessage?.created_at ?? b.contact.updated_at;
          return timeB.localeCompare(timeA);
        });
      });
      for (const [contactId, msgs] of porContato) {
        if (conversationsRef.current.some((c) => c.contact.id === contactId)) continue;
        for (const m of msgs) enfileirarHidratacao(m);
      }
    } catch (err) {
      log.error('Error fetching incremental messages:', err);
      void import('sonner').then(({ toast }) => {
        toast.error('Erro de conexão', {
          description: 'Não foi possível atualizar suas conversas. Verifique sua conexão.'
        });
      });
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }, [commitConversations, enfileirarHidratacao, fetchConversations, markMessageSeen]);

  const revalidateAfterReconnect = useCallback(() => {
    void fetchIncrementalConversations();
  }, [fetchIncrementalConversations]);

  useEffect(() => {
    void Promise.resolve().then(fetchConversations);
  }, [fetchConversations]);

  // Revalidacao de rede: uma queda nao avisa o hook, entao a lista em memoria pode
  // ter envelhecido. A revalidação é incremental (só o que é novo); sem lista,
  // cai na recarga total. Os dois canais compartilham o callback: o limite por
  // identidade em useSupabaseRealtime colapsa os dois gatilhos em uma unica busca.
  useSupabaseRealtime<RealtimeMessage>({
    channelName: 'global-messages-realtime',
    table: 'messages',
    onInsert: handleNewMessage,
    onUpdate: handleMessageUpdate,
    enabled: true,
    onReconnect: revalidateAfterReconnect,
  });

  useSupabaseRealtime<ConversationContact>({
    channelName: 'global-contacts-realtime',
    table: 'contacts',
    onUpdate: handleContactUpdate,
    onDelete: handleContactDelete,
    enabled: true,
    onReconnect: revalidateAfterReconnect,
  });

  // Ouve atualizações de conversation_status disparadas por CloseConversationDialog
  // e aplica patch otimista no array in-memory sem precisar de refetch.
  useEffect(() => {
    const handler = (e: Event) => {
      const { contactId, status } = (e as CustomEvent<{ contactId: string; status: string }>).detail;
      const typedStatus = status as ConversationContact['conversation_status'];
      commitConversations((prev): ConversationWithMessages[] =>
        prev.map((c): ConversationWithMessages =>
          c.contact.id === contactId
            ? { ...c, contact: { ...c.contact, conversation_status: typedStatus } }
            : c
        )
      );
    };
    window.addEventListener('zapp:contact-status-changed', handler);
    return () => window.removeEventListener('zapp:contact-status-changed', handler);
  }, [commitConversations]);

  const sendMessage = async (contactId: string, content: string, messageType: string = 'text', mediaUrl?: string, mediaPayload?: string, replyToId?: string | null) => {
    return sendMessageToContact(contactId, content, messageType, mediaUrl, mediaPayload, replyToId);
  };

  const markAsRead = async (contactId: string) => {
    const conv = conversationsRef.current.find(c => c.contact.id === contactId);
    if (conv && conv.unreadCount === 0) return;

    try {
      await RealtimeService.markMessagesAsRead(contactId);
      commitConversations((prev) =>
        prev.map((c) => c.contact.id === contactId
          ? buildConversation(c.contact, c.messages.map((m) => ({ ...m, is_read: true })))
          : c
        )
      );
    } catch (err) {
      log.error('Error in markAsRead hook:', err);
    }
  };

  return {
    conversations, loading, initialLoading, refreshing, error, sendMessage, markAsRead,
    refetch: fetchConversations, newMessageNotification,
    dismissNotification, setSelectedContact, setSoundEnabled,
  };
}
