import { createContext, createElement, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import type { MessageReaction } from './types';

/**
 * PERFORMANCE (auditoria de paridade V3 -> V2): reações da conversa em UMA
 * consulta.
 *
 * Cada balão monta `MessageReactions` e `QuickReactionBar`, e os dois chamavam
 * `useMessageReactions(messageId)`: era UMA consulta a `message_reactions` por
 * mensagem ao abrir a conversa (dezenas de GETs). O `ReactionsBatchProvider`
 * cobre os ids das mensagens em lote (blocos de `REACTIONS_BATCH_SIZE`) e SEMEIA
 * o cache react-query por mensagem — os hooks por mensagem leem o cache em vez
 * de consultar sozinhos.
 *
 * O provider garante:
 *  - enquanto o lote cobre um id ainda sem resultado, o hook daquela mensagem
 *    fica `enabled:false` (nenhuma consulta própria) — a trava é POR MENSAGEM:
 *    id fora da lista do provider consulta sozinho na hora, sem esperar o lote;
 *  - o lote NÃO sobrescreve cache mais novo: chave invalidada pelo realtime ou
 *    escrita DEPOIS do início do lote é preservada (o hook por mensagem refaz a
 *    consulta e traz a versão fresca);
 *  - id novo (mensagem nova) entra num lote incremental só dele, sem refazer a
 *    consulta de todas as mensagens;
 *  - os nomes dos autores vêm de UM `.in('id', …)` com a união dos user_ids de
 *    todos os blocos, ANTES de semear (sem N+1 por bloco).
 */

/** Teto de ids por `.in()` (limite de URL do PostgREST). */
export const REACTIONS_BATCH_SIZE = 100;

/** Chave react-query por mensagem — a MESMA usada por `useMessageReactions`. */
export const messageReactionsQueryKey = (messageId: string) =>
  ['message-reactions', messageId] as const;

interface ReactionsBatchContextValue {
  /** Ids da conversa cobertos pelo lote (lista atual do provider). */
  coveredIds: Set<string>;
  /** Ids já resolvidos: semeados pelo lote ou liberados para fallback solo. */
  settledIds: Set<string>;
}

const ReactionsBatchContext = createContext<ReactionsBatchContextValue | null>(null);

/** Contexto do lote. Sem provider (consumidor antigo) devolve `null`. */
export function useReactionsBatch(): ReactionsBatchContextValue | null {
  return useContext(ReactionsBatchContext);
}

function chunkIds(ids: string[], size: number): string[][] {
  const parts: string[][] = [];
  for (let i = 0; i < ids.length; i += size) parts.push(ids.slice(i, i + size));
  return parts;
}

function groupReactionsByMessage(rows: MessageReaction[]): Record<string, MessageReaction[]> {
  return rows.reduce((acc, row) => {
    if (!acc[row.message_id]) acc[row.message_id] = [];
    acc[row.message_id].push(row);
    return acc;
  }, {} as Record<string, MessageReaction[]>);
}

/** Nomes dos autores em UM `.in()` com a união dos user_ids — mesma fonte do hook por mensagem. */
async function fetchReactionUserNames(userIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (userIds.length === 0) return names;
  const { data, error } = await supabase.from('profiles').select('id, name').in('id', userIds);
  if (error) throw error;
  for (const user of data ?? []) names.set(user.id, user.name ?? '');
  return names;
}

/**
 * Semeia o cache da mensagem sem sobrescrever dado mais novo: chave invalidada
 * (o realtime invalida ao chegar reação nova) ou já escrita DEPOIS do início do
 * lote é preservada — o hook por mensagem faz o refetch e traz a versão fresca.
 */
function seedMessageReactions(
  queryClient: QueryClient,
  messageId: string,
  reactions: MessageReaction[],
  batchStartedAt: number,
): void {
  const key = messageReactionsQueryKey(messageId);
  const state = queryClient.getQueryState(key);
  if (state && (state.isInvalidated || state.dataUpdatedAt >= batchStartedAt)) return;
  queryClient.setQueryData(key, reactions);
}

interface ReactionsBatchProviderProps {
  /** Ids das mensagens da conversa (o provider é quem consulta em lote). */
  messageIds: string[];
  children: ReactNode;
}

export function ReactionsBatchProvider({ messageIds, children }: ReactionsBatchProviderProps) {
  const queryClient = useQueryClient();
  const idsKey = messageIds.join(',');
  const ids = useMemo(
    () => Array.from(new Set(messageIds.filter((id) => Boolean(id)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idsKey],
  );

  // Ids que o lote já resolveu (semeados ou com fallback liberado). O estado é
  // publicado no contexto para a trava por mensagem durante o render; o ref
  // espelha o mesmo conjunto para o efeito assíncrono calcular faltantes sem
  // reconsultar ids recém-resolvidos antes de o render seguinte aplicar o estado.
  const [settled, setSettled] = useState<Set<string>>(() => new Set());
  const settledIdsRef = useRef<Set<string>>(new Set());
  const inFlightIdsRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(false);

  useEffect(() => {
    const inFlightIds = inFlightIdsRef.current;
    const settledIds = settledIdsRef.current;

    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      inFlightIds.clear();
      settledIds.clear();
    };
  }, []);

  useEffect(() => {
    const inFlightIds = inFlightIdsRef.current;
    const settledIds = settledIdsRef.current;
    const missing = ids.filter((id) => !settledIds.has(id) && !inFlightIds.has(id));
    if (missing.length === 0) return;

    missing.forEach((id) => inFlightIds.add(id));
    const batchStartedAt = Date.now();

    const load = async () => {
      try {
        // Fase 1: reações em blocos (teto de ids por `.in()` do PostgREST),
        // acumulando tudo antes de semear — os nomes vêm depois, de uma vez.
        const parts = chunkIds(missing, REACTIONS_BATCH_SIZE);
        const succeeded: string[][] = [];
        const failed: string[][] = [];
        const allGrouped: Record<string, MessageReaction[]> = {};
        for (const part of parts) {
          try {
            const { data, error } = await supabase
              .from('message_reactions')
              .select('*')
              .in('message_id', part);
            if (error) throw error;
            if (!mountedRef.current) return;
            const grouped = groupReactionsByMessage((data ?? []) as unknown as MessageReaction[]);
            for (const [id, rows] of Object.entries(grouped)) {
              const existing = allGrouped[id] ?? [];
              existing.push(...rows);
              allGrouped[id] = existing;
            }
            succeeded.push(part);
          } catch (chunkError) {
            if (!mountedRef.current) return;
            // Falha no bloco: não semeia — o hook por mensagem assume sozinho
            // (cache vazio). Sem isso o `pending` ficaria preso e o carregando
            // nunca terminaria.
            log.error('Error fetching reactions batch:', chunkError);
            failed.push(part);
          }
        }
        if (!mountedRef.current) return;

        // Fase 2: UM `.in('id', …)` com a união dos user_ids de TODOS os blocos.
        const userIds = Array.from(
          new Set(
            Object.values(allGrouped)
              .flatMap((rows) => rows.map((row) => row.user_id))
              .filter((value): value is string => Boolean(value)),
          ),
        );
        let names = new Map<string, string>();
        try {
          names = await fetchReactionUserNames(userIds);
        } catch (nameError) {
          // Nome é enfeite do tooltip: sem ele a reação ainda vale.
          log.error('Error fetching reaction user names:', nameError);
        }
        if (!mountedRef.current) return;

        // Fase 3: semeia (a guarda preserva cache mais novo/invalidado) e marca
        // SÓ o que foi resolvido — semeado ou falhado com fallback liberado.
        for (const part of succeeded) {
          for (const id of part) {
            const reactions = (allGrouped[id] ?? []).map((row) => ({
              ...row,
              user_name: row.user_id ? names.get(row.user_id) || 'Agente' : 'Cliente',
            }));
            seedMessageReactions(queryClient, id, reactions, batchStartedAt);
          }
        }
        const resolved = [...succeeded, ...failed].flat();
        if (resolved.length > 0 && mountedRef.current) {
          const settledIds = settledIdsRef.current;
          resolved.forEach((id) => settledIds.add(id));
          setSettled(new Set(settledIds));
        }
      } finally {
        missing.forEach((id) => inFlightIdsRef.current.delete(id));
      }
    };

    void load();
  }, [ids, idsKey, queryClient]);

  const value = useMemo(
    () => ({ coveredIds: new Set(ids), settledIds: settled }),
    [ids, settled],
  );

  return createElement(ReactionsBatchContext.Provider, { value }, children);
}

/**
 * Hook antigo de carregamento em lote (mantido como contrato público —
 * `useMessageReactions` o re-exporta). A conversa usa o `ReactionsBatchProvider`.
 */
export function useMessagesReactions(messageIds: string[]) {
  const [reactionsMap, setReactionsMap] = useState<Record<string, MessageReaction[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (messageIds.length === 0) return;

    const fetchReactions = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('message_reactions')
          .select('*')
          .in('message_id', messageIds);

        if (error) throw error;

        const grouped = groupReactionsByMessage((data ?? []) as unknown as MessageReaction[]);

        if (isMountedRef.current) {
          setReactionsMap(grouped);
        }
      } catch (err) {
        log.error('Error fetching reactions:', err);
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    void fetchReactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageIds.join(',')]);

  return { reactionsMap, isLoading };
}
