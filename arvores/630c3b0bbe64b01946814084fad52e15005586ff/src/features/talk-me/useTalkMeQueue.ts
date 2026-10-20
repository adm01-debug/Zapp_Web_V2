import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useDebounce } from '@/hooks/performance/useTimingHooks';
import { useSupabaseRealtime } from '@/hooks/realtime/useSupabaseRealtime';
import { getLogger } from '@/lib/logger';
import { useNetworkStatus } from '@/hooks/system/useNetworkStatus';
import {
  TalkMeConflictError,
  TalkMeOfflineError,
  TalkMeOutcomeUnknownError,
  type TalkMeClaimResult,
  type TalkMeQueue,
  type TalkMeWaitingContact,
} from './types';

const log = getLogger('useTalkMeQueue');
const SELECTED_QUEUE_KEY = 'zapp:talk-me:selected-queue';
const PAGE_SIZE = 50;
const REALTIME_DEBOUNCE_MS = 350;
const REALTIME_MAX_WAIT_MS = 2_000;
const ELIGIBILITY_RECONCILE_INTERVAL_MS = 60_000;

/**
 * Envia o aceite e separa as duas famílias de erro: o servidor respondeu (erro
 * estruturado, tratado por quem chamou) ou a resposta se perdeu no caminho
 * (`TalkMeOutcomeUnknownError`). Sem `throwOnError`, a rejeição da promessa só
 * acontece em falha de transporte/aborto — o servidor não chegou a responder.
 */
async function requestClaim(contactId: string) {
  try {
    return await supabase.rpc('talk_me_claim', { p_contact_id: contactId });
  } catch (transportError) {
    log.warn('Aceite TALK ME sem resposta do servidor; resultado desconhecido', transportError);
    throw new TalkMeOutcomeUnknownError();
  }
}

function mapQueue(row: {
  queue_id: string;
  queue_name: string;
  queue_color: string | null;
  waiting_count: number;
  oldest_waiting_at: string | null;
}): TalkMeQueue {
  return {
    queueId: row.queue_id,
    name: row.queue_name,
    color: row.queue_color,
    waitingCount: Number(row.waiting_count),
    oldestWaitingAt: row.oldest_waiting_at,
  };
}

function mapWaitingContact(row: {
  contact_id: string;
  contact_name: string;
  avatar_url: string | null;
  company: string | null;
  job_title: string | null;
  queue_id: string;
  queue_name: string;
  queue_color: string | null;
  waiting_since: string;
  pending_message_count: number;
  last_message_id: string;
  last_message_content: string;
  last_message_type: string;
  last_message_media_url: string | null;
  last_message_caption: string | null;
  last_message_at: string;
  total_count: number;
  queue_position: number;
}): TalkMeWaitingContact {
  return {
    contactId: row.contact_id,
    name: row.contact_name,
    avatarUrl: row.avatar_url,
    company: row.company,
    jobTitle: row.job_title,
    queueId: row.queue_id,
    queueName: row.queue_name,
    queueColor: row.queue_color,
    waitingSince: row.waiting_since,
    pendingMessageCount: Number(row.pending_message_count),
    lastMessageId: row.last_message_id,
    lastMessageContent: row.last_message_content,
    lastMessageType: row.last_message_type,
    lastMessageMediaUrl: row.last_message_media_url,
    lastMessageCaption: row.last_message_caption,
    lastMessageAt: row.last_message_at,
    totalCount: Number(row.total_count),
    position: Number(row.queue_position),
  };
}

export function useTalkMeQueue(isOpen: boolean, enabled = true) {
  const [queues, setQueues] = useState<TalkMeQueue[]>([]);
  const [selectedQueueId, setSelectedQueueIdState] = useState<string | null>(null);
  const [items, setItems] = useState<TalkMeWaitingContact[]>([]);
  const [search, setSearch] = useState('');
  const [queuesLoading, setQueuesLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [claimingContactId, setClaimingContactId] = useState<string | null>(null);
  const [queuesError, setQueuesError] = useState<string | null>(null);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [resolvedSearch, setResolvedSearch] = useState('');
  const normalizedSearch = search.trim();
  const debouncedSearch = useDebounce(normalizedSearch, 300);
  const searchPending = normalizedSearch !== debouncedSearch || debouncedSearch !== resolvedSearch;
  const queuesGenerationRef = useRef(0);
  const listGenerationRef = useRef(0);
  const listAbortRef = useRef<AbortController | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshBurstStartedAtRef = useRef<number | null>(null);
  const itemsRef = useRef<TalkMeWaitingContact[]>([]);
  const loadingMoreRef = useRef(false);
  const reconcileGenerationRef = useRef(0);
  const eligibilityReconcileInFlightRef = useRef(false);
  const claimingRef = useRef(false);
  const wasOpenRef = useRef(isOpen);
  const { isOnline } = useNetworkStatus();
  const isOffline = !isOnline;
  const isOfflineRef = useRef(isOffline);

  useEffect(() => {
    isOfflineRef.current = isOffline;
  }, [isOffline]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const fetchQueues = useCallback(async () => {
    const generation = ++queuesGenerationRef.current;
    if (!enabled) {
      setQueues([]);
      setSelectedQueueIdState(null);
      setQueuesError(null);
      setQueuesLoading(false);
      return;
    }
    setQueuesLoading(true);
    try {
      const { data, error } = await supabase.rpc('talk_me_list_queues');
      if (generation !== queuesGenerationRef.current) return;
      if (error) {
        log.error('Falha ao consultar filas TALK ME', error);
        setQueuesError('Não foi possível atualizar as filas.');
        return;
      }

      const nextQueues = (data ?? []).map(mapQueue);
      setQueues(nextQueues);
      setQueuesError(null);
      setSelectedQueueIdState((current) => {
        if (current && nextQueues.some((queue) => queue.queueId === current)) return current;
        const stored = typeof window !== 'undefined' ? window.sessionStorage.getItem(SELECTED_QUEUE_KEY) : null;
        const next = nextQueues.find((queue) => queue.queueId === stored)?.queueId
          ?? nextQueues[0]?.queueId
          ?? null;
        if (next && typeof window !== 'undefined') window.sessionStorage.setItem(SELECTED_QUEUE_KEY, next);
        return next;
      });
    } catch (error) {
      if (generation !== queuesGenerationRef.current) return;
      log.error('Falha inesperada ao consultar filas TALK ME', error);
      setQueuesError('Não foi possível atualizar as filas.');
    } finally {
      if (generation === queuesGenerationRef.current) setQueuesLoading(false);
    }
  }, [enabled]);

  const fetchWaiting = useCallback(async (append = false): Promise<boolean> => {
    if (!enabled || !isOpen || !selectedQueueId) {
      if (!append) setItems([]);
      return false;
    }
    if (append && loadingMoreRef.current) return false;

    const generation = ++listGenerationRef.current;
    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;
    if (append) {
      loadingMoreRef.current = true;
      setLoadingMore(true);
      setLoadMoreError(null);
    } else {
      loadingMoreRef.current = false;
      setLoadingMore(false);
      setItemsLoading(true);
    }
    if (!append) setItemsError(null);

    const cursor = append ? itemsRef.current[itemsRef.current.length - 1] : undefined;
    const request = supabase
      .rpc('talk_me_list_waiting', {
        p_queue_id: selectedQueueId,
        p_search: debouncedSearch.trim() || undefined,
        p_limit: PAGE_SIZE,
        p_cursor_waiting_since: cursor?.waitingSince,
        p_cursor_contact_id: cursor?.contactId,
      })
      .abortSignal(controller.signal);
    const { data, error } = await request;

    if (controller.signal.aborted || generation !== listGenerationRef.current) {
      if (generation === listGenerationRef.current) {
        if (append) {
          loadingMoreRef.current = false;
          setLoadingMore(false);
        } else {
          setItemsLoading(false);
        }
      }
      return false;
    }
    if (error) {
      log.error('Falha ao consultar atendimentos TALK ME', error);
      if (append) setLoadMoreError('Não foi possível carregar mais atendimentos.');
      else setItemsError('Não foi possível carregar os atendimentos.');
    } else {
      const next = (data ?? []).map(mapWaitingContact);
      setItems((current) => {
        const merged = append
          ? [...new Map([...current, ...next].map((item) => [item.contactId, item])).values()]
          : next;
        itemsRef.current = merged;
        return merged;
      });
      if (!append) setResolvedSearch(debouncedSearch);
      setItemsError(null);
      if (append) setLoadMoreError(null);
      setItemsLoading(false);
      loadingMoreRef.current = false;
      setLoadingMore(false);
      return next.length > 0;
    }
    if (!append) setResolvedSearch(debouncedSearch);
    setItemsLoading(false);
    loadingMoreRef.current = false;
    setLoadingMore(false);
    return false;
  }, [debouncedSearch, enabled, isOpen, selectedQueueId]);

  const reconcileLoadedPages = useCallback(async () => {
    const reconcileGeneration = ++reconcileGenerationRef.current;
    const pagesToRestore = Math.max(1, Math.ceil(itemsRef.current.length / PAGE_SIZE));
    setReconciling(true);
    try {
      const firstPageLoaded = await fetchWaiting(false);
      if (!firstPageLoaded || reconcileGeneration !== reconcileGenerationRef.current) return;
      for (let page = 1; page < pagesToRestore; page += 1) {
        const pageLoaded = await fetchWaiting(true);
        if (!pageLoaded || reconcileGeneration !== reconcileGenerationRef.current) break;
      }
    } finally {
      if (reconcileGeneration === reconcileGenerationRef.current) setReconciling(false);
    }
  }, [fetchWaiting]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca remota inicial; o estado de loading pertence ao ciclo da requisição.
    void fetchQueues();
  }, [fetchQueues]);

  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- troca de fila/busca inicia uma nova requisição remota cancelável.
    void fetchWaiting(false);
    return () => {
      listAbortRef.current?.abort();
    };
  }, [isOpen, selectedQueueId, debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps -- fetchWaiting inclui items para paginação; a consulta inicial não deve repetir ao atualizar a lista.

  useEffect(() => {
    const justOpened = isOpen && !wasOpenRef.current;
    wasOpenRef.current = isOpen;
    if (justOpened) void fetchQueues();
  }, [fetchQueues, isOpen]);

  const scheduleRealtimeRefresh = useCallback(() => {
    if (!enabled || !isOpen) return;
    const now = Date.now();
    refreshBurstStartedAtRef.current ??= now;
    const remaining = Math.max(0, REALTIME_MAX_WAIT_MS - (now - refreshBurstStartedAtRef.current));
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      refreshBurstStartedAtRef.current = null;
      void fetchQueues();
      if (isOpen) void reconcileLoadedPages();
    }, Math.min(REALTIME_DEBOUNCE_MS, remaining));
  }, [enabled, fetchQueues, isOpen, reconcileLoadedPages]);

  useEffect(() => {
    if (isOpen) return;
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = null;
    refreshBurstStartedAtRef.current = null;
    eligibilityReconcileInFlightRef.current = false;
  }, [isOpen]);

  const reconcileEligibility = useCallback(async () => {
    if (!enabled || !isOpen || document.hidden || eligibilityReconcileInFlightRef.current) return;
    eligibilityReconcileInFlightRef.current = true;
    try {
      await Promise.all([fetchQueues(), reconcileLoadedPages()]);
    } finally {
      eligibilityReconcileInFlightRef.current = false;
    }
  }, [enabled, fetchQueues, isOpen, reconcileLoadedPages]);

  useEffect(() => {
    if (!enabled || !isOpen) return;
    const interval = window.setInterval(() => {
      void reconcileEligibility();
    }, ELIGIBILITY_RECONCILE_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (!document.hidden) void reconcileEligibility();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, isOpen, reconcileEligibility]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Reconectar só reconsulta o estado (leitura). Nenhum aceite é enfileirado:
    // depois de uma resposta perdida, assumir depende de confirmação explícita
    // do atendente (etapa 060 — sem aceite automático ao recuperar conexão).
    const handleOnline = () => {
      void reconcileEligibility();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [reconcileEligibility]);

  useEffect(() => () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshBurstStartedAtRef.current = null;
    queuesGenerationRef.current += 1;
    listGenerationRef.current += 1;
    reconcileGenerationRef.current += 1;
    eligibilityReconcileInFlightRef.current = false;
    listAbortRef.current?.abort();
  }, []);

  useSupabaseRealtime({
    channelName: 'talk-me-contacts',
    table: 'contacts',
    onAll: scheduleRealtimeRefresh,
    enabled: enabled && isOpen,
  });
  useSupabaseRealtime({
    channelName: 'talk-me-messages',
    table: 'messages',
    onAll: scheduleRealtimeRefresh,
    enabled: enabled && isOpen,
  });
  useSupabaseRealtime({
    channelName: 'talk-me-queues',
    table: 'queues',
    onAll: scheduleRealtimeRefresh,
    enabled: enabled && isOpen,
  });
  useSupabaseRealtime({
    channelName: 'talk-me-queue-members',
    table: 'queue_members',
    onAll: scheduleRealtimeRefresh,
    enabled: enabled && isOpen,
  });
  const setSearchSafely = useCallback((value: string) => {
    const nextNormalizedSearch = value.trim();
    const searchChanged = nextNormalizedSearch !== normalizedSearch;
    setSearch(value);
    if (!searchChanged) return;
    listGenerationRef.current += 1;
    reconcileGenerationRef.current += 1;
    listAbortRef.current?.abort();
    loadingMoreRef.current = false;
    setLoadingMore(false);
    setReconciling(false);
    setItemsError(null);
    setLoadMoreError(null);
  }, [normalizedSearch]);

  const setSelectedQueueId = useCallback((queueId: string) => {
    listGenerationRef.current += 1;
    reconcileGenerationRef.current += 1;
    listAbortRef.current?.abort();
    loadingMoreRef.current = false;
    setSelectedQueueIdState(queueId);
    setItems([]);
    itemsRef.current = [];
    setLoadingMore(false);
    setReconciling(false);
    setItemsError(null);
    setLoadMoreError(null);
    if (typeof window !== 'undefined') window.sessionStorage.setItem(SELECTED_QUEUE_KEY, queueId);
  }, []);

  const claim = useCallback(async (contactId: string): Promise<TalkMeClaimResult> => {
    if (!enabled || claimingRef.current) throw new TalkMeConflictError();
    if (isOfflineRef.current || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      throw new TalkMeOfflineError();
    }
    claimingRef.current = true;
    setClaimingContactId(contactId);
    try {
      const { data, error } = await requestClaim(contactId);
      if (error || !data?.[0]) {
        if (error?.message.includes('talk_me_unavailable')) throw new TalkMeConflictError();
        // Erro estruturado do Postgres/PostgREST = o servidor respondeu e recusou:
        // falha definitiva. Sem código, a resposta chegou corrompida/incompleta:
        // o commit pode ter acontecido, então é resultado desconhecido.
        if (error?.code) throw error;
        log.warn('Aceite TALK ME sem corpo utilizável; resultado desconhecido', error);
        throw new TalkMeOutcomeUnknownError();
      }
      const row = data[0];
      setItems((current) => {
        const remaining = current.filter((item) => item.contactId !== contactId);
        itemsRef.current = remaining;
        return remaining;
      });
      void fetchQueues();
      return {
        contactId: row.contact_id,
        queueId: row.queue_id,
        assignedTo: row.assigned_to,
        conversationStatus: row.conversation_status,
        claimedAt: row.claimed_at,
      };
    } finally {
      claimingRef.current = false;
      setClaimingContactId(null);
    }
  }, [enabled, fetchQueues]);

  const selectedQueue = useMemo(
    () => queues.find((queue) => queue.queueId === selectedQueueId) ?? null,
    [queues, selectedQueueId],
  );
  const totalCount = items[0]?.totalCount ?? selectedQueue?.waitingCount ?? 0;
  const hasMore = items.length > 0 && items.length < totalCount;

  return {
    queues,
    selectedQueue,
    selectedQueueId,
    setSelectedQueueId,
    items,
    search,
    setSearch: setSearchSafely,
    searchPending,
    queuesLoading,
    itemsLoading,
    loadingMore,
    claimingContactId,
    queuesError,
    itemsError,
    loadMoreError,
    reconciling,
    isOffline,
    totalCount,
    hasMore,
    loadMore: () => fetchWaiting(true),
    refresh: async () => { await Promise.all([fetchQueues(), reconcileLoadedPages()]); },
    claim,
  };
}

export type TalkMeQueueController = ReturnType<typeof useTalkMeQueue>;
