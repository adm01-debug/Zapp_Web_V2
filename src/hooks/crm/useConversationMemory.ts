/**
 * useConversationMemory — memória viva da conversa (leitura).
 *
 * Lê `conversation_memory` do contato. É a MESMA fonte e a MESMA cadeia de
 * consulta que `useNextBestAction` já usa (select → eq → maybeSingle); sem
 * Realtime (o painel relê ao montar).
 *
 * A escrita mora em `useSalvarConversationMemory`. Daqui sai o `rowId` que ela
 * usa para decidir entre `insert` e `update` — e ele só é devolvido quando o
 * `contact_id` da linha lida é o contato pedido, para uma resposta atrasada de
 * outro contato nunca virar alvo de UPDATE.
 *
 * `status` distingue "não há memória" (empty) de "não foi possível ler"
 * (error): sem essa distinção, uma falha de RLS/rede apareceria para o
 * atendente como se o contato não tivesse memória nenhuma.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';

export interface ConversationMemoryData {
  facts: string[];
  objectionsHandled: string[];
  promisesMade: string[];
  pendingItems: string[];
  commercialSummary: string | null;
  cumulativeSummary: string | null;
  updatedAt: string | null;
}

export type ConversationMemoryStatus = 'loading' | 'ok' | 'empty' | 'error';

/**
 * jsonb pode guardar qualquer coisa: string vira string (trim), primitivo vira
 * texto e objeto/array vira JSON — nunca `String(obj)` = "[object Object]", que
 * apagaria o dado registrado. Vazio/nulo é descartado.
 */
function toTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (item === null || item === undefined) continue;
    const text = typeof item === 'string'
      ? item.trim()
      : typeof item === 'number' || typeof item === 'boolean'
        ? String(item)
        : JSON.stringify(item);
    if (text) out.push(text);
  }
  return out;
}

function toText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text : null;
}

export function parseConversationMemory(row: unknown): ConversationMemoryData | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  return {
    facts: toTextList(r.facts),
    objectionsHandled: toTextList(r.objections_handled),
    promisesMade: toTextList(r.promises_made),
    pendingItems: toTextList(r.pending_items),
    commercialSummary: toText(r.commercial_summary),
    cumulativeSummary: toText(r.cumulative_summary),
    updatedAt: typeof r.updated_at === 'string' ? r.updated_at : null,
  };
}

/** Memória sem nenhum conteúdo é o mesmo que não ter memória. */
export function hasMemoryContent(memory: ConversationMemoryData): boolean {
  return (
    memory.facts.length > 0 ||
    memory.objectionsHandled.length > 0 ||
    memory.promisesMade.length > 0 ||
    memory.pendingItems.length > 0 ||
    memory.commercialSummary !== null ||
    memory.cumulativeSummary !== null
  );
}

export function useConversationMemory(contactId: string) {
  const [memory, setMemory] = useState<ConversationMemoryData | null>(null);
  const [status, setStatus] = useState<ConversationMemoryStatus>('loading');
  const [rowId, setRowId] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  /** Reconsulta o banco — usado pelo "Tentar novamente" e depois de salvar. */
  const recarregar = useCallback(() => setTentativa((n) => n + 1), []);

  useEffect(() => {
    if (!contactId) return;
    let cancelled = false;

    const load = async () => {
      // Dentro do `load` de proposito: `setState` direto no corpo do efeito cai
      // na regra react-hooks/set-state-in-effect.
      setStatus('loading');
      const { data, error } = await supabase
        .from('conversation_memory')
        .select('id, contact_id, facts, objections_handled, promises_made, pending_items, commercial_summary, cumulative_summary, updated_at')
        .eq('contact_id', contactId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        log.error('Error fetching conversation memory:', error);
        setMemory(null);
        setRowId(null);
        setStatus('error');
        return;
      }

      const linha = (data ?? null) as { id?: unknown; contact_id?: unknown } | null;
      // Só é "nossa linha" se o contato dela é o contato pedido.
      const idProprio =
        typeof linha?.id === 'string' && linha?.contact_id === contactId ? linha.id : null;

      const parsed = parseConversationMemory(data);
      setRowId(idProprio);
      setMemory(parsed);
      setStatus(parsed && hasMemoryContent(parsed) ? 'ok' : 'empty');
    };

    void load();
    return () => { cancelled = true; };
  }, [contactId, tentativa]);

  return { memory, status, loading: status === 'loading', rowId, recarregar };
}
