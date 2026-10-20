/**
 * useSupervisorQueue
 *
 * Fila priorizada de conversas abertas para o painel do supervisor. Faz UMA
 * consulta agregada (contatos abertos + perfis ativos + filas, em paralelo),
 * calcula o nível P1–P4 de cada conversa com as regras de `@/lib/supervisorPriority`
 * e mantém a fila atualizada por polling.
 *
 * Visibilidade: a leitura é a MESMA que a RLS já impõe em `public.contacts` —
 * o supervisor (e o admin) enxerga todas; o agente enxerga só as que lhe estão
 * atribuídas. O hook não acrescenta recorte de papel (não há como um agente
 * "ver além" pelo front) nem contorna a RLS.
 *
 * Corte da consulta: são pedidas as conversas abertas mais antigas primeiro
 * (`updated_at` ASC, `id` como desempate) até `SUPERVISOR_PAGE_SIZE`; são
 * justamente as que carregam mais tempo de espera. Se a consulta devolver
 * exatamente o teto, `truncated` fica `true` — a tela avisa que a lista está
 * cortada em vez de apresentar 200 linhas como se fossem todas.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import {
  computePriority,
  sortByPriority,
  type PriorityInfo,
  type PriorityLevel,
  type SupervisorConversationInput,
} from '@/lib/supervisorPriority';

const log = getLogger('SupervisorQueue');

/** Estados de `contacts.conversation_status` que contam como conversa aberta. */
export const OPEN_CONVERSATION_STATUSES = ['open', 'waiting', 'pending'] as const;

/** Papéis que podem receber uma conversa (mesma lista usada pela tela). */
const SUPERVISOR_ROLES = ['agent', 'supervisor', 'admin', 'manager'];

/** Teto de conversas por consulta (o PostgREST corta a resposta em 1000 linhas). */
export const SUPERVISOR_PAGE_SIZE = 200;

/** Intervalo padrão do polling (1 min). */
export const DEFAULT_REFRESH_MS = 60_000;

/** Linha da fila: sinais da conversa + nomes resolvidos + prioridade calculada. */
export interface SupervisorQueueRow extends SupervisorConversationInput {
  conversation_status: string;
  agentName: string | null;
  queueName: string | null;
  priority: PriorityInfo;
}

/** Quantas conversas em cada nível (a fila INTEIRA, antes de qualquer filtro de tela). */
export type SupervisorQueueSummary = Record<PriorityLevel, number>;

/** Opções do hook. `refreshMs <= 0` desliga o polling (a tela chama `reload`). */
export interface UseSupervisorQueueOptions {
  refreshMs?: number;
}

interface ContactsRow {
  id: string;
  name: string;
  phone: string;
  assigned_to: string | null;
  queue_id: string | null;
  ai_priority: string | null;
  risk_score: number | null;
  updated_at: string;
  conversation_status: string;
}

export interface UseSupervisorQueueResult {
  rows: SupervisorQueueRow[];
  summary: SupervisorQueueSummary;
  /** Total de conversas abertas devolvidas pela consulta. */
  total: number;
  /** `true` quando a consulta bateu no teto: há mais conversas abertas do que as listadas. */
  truncated: boolean;
  loading: boolean;
  /** Erro da última consulta que falhou (a fila anterior permanece na tela). */
  error: Error | null;
  refreshedAt: Date | null;
  reload: () => Promise<void>;
}

/** Busca a fila e calcula a prioridade. Resposta de uma rodada antiga é descartada. */
export function useSupervisorQueue(
  options: UseSupervisorQueueOptions = {}
): UseSupervisorQueueResult {
  const refreshMs = options.refreshMs ?? DEFAULT_REFRESH_MS;

  const [rows, setRows] = useState<SupervisorQueueRow[]>([]);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  // Identificador da rodada: só a ÚLTIMA resposta pode publicar. Sem isso uma
  // leitura lenta sobrescrevia a fila com dados velhos (corrida clássica).
  const requestIdRef = useRef(0);
  // `loading` nasce `true` e só a CONSULTA (depois do await) o baixa: o polling
  // nunca joga a tela de volta no spinner e o efeito não dispara setState síncrono.
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    try {
      const [contactsRes, profilesRes, queuesRes] = await Promise.all([
        supabase
          .from('contacts')
          .select(
            'id, name, phone, assigned_to, queue_id, ai_priority, risk_score, updated_at, conversation_status'
          )
          .in('conversation_status', [...OPEN_CONVERSATION_STATUSES])
          .is('deleted_at', null)
          .order('updated_at', { ascending: true })
          .order('id', { ascending: true })
          .limit(SUPERVISOR_PAGE_SIZE),
        supabase
          .from('profiles')
          .select('id, name, role')
          .eq('is_active', true)
          .in('role', SUPERVISOR_ROLES)
          .order('id', { ascending: true })
          .limit(1000),
        supabase.from('queues').select('id, name').order('name', { ascending: true }).limit(500),
      ]);

      // Resposta atrasada de uma rodada que já foi substituída: descarta sem
      // mexer em `loading` (quem publica é sempre a rodada mais nova).
      if (requestId !== requestIdRef.current) return;

      // `contacts` é a fonte da fila: erro aqui não pode virar fila vazia na tela.
      if (contactsRes.error) throw contactsRes.error;

      // Perfis/filas são cosméticos (nomes). Falha entra no log e a fila segue
      // com o nome ausente — nunca engolida em silêncio.
      if (profilesRes.error) log.error('Falha ao carregar perfis da fila', profilesRes.error);
      if (queuesRes.error) log.error('Falha ao carregar nomes das filas', queuesRes.error);
      if (!mountedRef.current) return;

      const agentMap = new Map<string, string>(
        (profilesRes.data ?? [])
          .filter((p) => p.id != null && p.name != null)
          .map((p) => [p.id as string, p.name as string] as [string, string])
      );
      const queueMap = new Map<string, string>(
        (queuesRes.data ?? [])
          .filter((q) => q.id != null && q.name != null)
          .map((q) => [q.id as string, q.name as string] as [string, string])
      );

      const contacts: ContactsRow[] = (contactsRes.data ?? []).map((c) => ({
        id: c.id ?? '',
        name: c.name ?? '',
        phone: c.phone ?? '',
        assigned_to: c.assigned_to ?? null,
        queue_id: c.queue_id ?? null,
        ai_priority: c.ai_priority ?? null,
        risk_score: c.risk_score ?? null,
        updated_at: c.updated_at ?? '',
        conversation_status: c.conversation_status ?? '',
      }));

      const now = new Date();
      const enriched = contacts.map<SupervisorQueueRow>((c) => ({
        ...c,
        agentName: c.assigned_to ? (agentMap.get(c.assigned_to) ?? null) : null,
        queueName: c.queue_id ? (queueMap.get(c.queue_id) ?? null) : null,
        priority: computePriority(c, now),
      }));

      setRows(sortByPriority(enriched));
      setTotal(contacts.length);
      setTruncated(contacts.length >= SUPERVISOR_PAGE_SIZE);
      setError(null);
      setRefreshedAt(now);
    } catch (err) {
      if (requestId !== requestIdRef.current || !mountedRef.current) return;
      const normalized =
        err instanceof Error
          ? err
          : new Error(
              typeof (err as { message?: unknown })?.message === 'string'
                ? ((err as { message: string }).message)
                : String(err)
            );
      log.error('Falha ao carregar a fila do supervisor', normalized);
      // A fila anterior fica na tela: erro de polling não apaga dado bom.
      setError(normalized);
    } finally {
      if (requestId === requestIdRef.current && mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount padrão, sem estado derivado de props para sincronizar.
    void load();

    if (refreshMs <= 0) {
      return () => {
        mountedRef.current = false;
      };
    }

    const interval = setInterval(() => {
      void load();
    }, refreshMs);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [load, refreshMs]);

  const summary = useMemo<SupervisorQueueSummary>(() => {
    const counts: SupervisorQueueSummary = { critical: 0, high: 0, medium: 0, normal: 0 };
    for (const row of rows) counts[row.priority.level] += 1;
    return counts;
  }, [rows]);

  return { rows, summary, total, truncated, loading, error, refreshedAt, reload: load };
}
