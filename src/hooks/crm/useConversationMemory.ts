/**
 * useConversationMemory — memória viva da conversa (somente leitura).
 *
 * Lê `conversation_memory` do contato. É a MESMA fonte e a MESMA cadeia de
 * consulta que `useNextBestAction` já usa (select → eq → maybeSingle); sem
 * Realtime (o painel relê ao montar) e sem escrita — a tela é só de leitura.
 *
 * `status` distingue "não há memória" (empty) de "não foi possível ler"
 * (error): sem essa distinção, uma falha de RLS/rede apareceria para o
 * atendente como se o contato não tivesse memória nenhuma.
 */
import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (!contactId) return;
    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .from('conversation_memory')
        .select('facts, objections_handled, promises_made, pending_items, commercial_summary, cumulative_summary, updated_at')
        .eq('contact_id', contactId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        log.error('Error fetching conversation memory:', error);
        setMemory(null);
        setStatus('error');
        return;
      }

      const parsed = parseConversationMemory(data);
      setMemory(parsed);
      setStatus(parsed && hasMemoryContent(parsed) ? 'ok' : 'empty');
    };

    void load();
    return () => { cancelled = true; };
  }, [contactId]);

  return { memory, status, loading: status === 'loading' };
}
