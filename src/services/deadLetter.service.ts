/**
 * Fila da dead-letter de webhooks: leitura da fila e disparo do replay.
 *
 * A leitura é a RPC `webhook_dead_letter_fila` (SECURITY DEFINER, guarda
 * `is_admin_or_supervisor` no WHERE, devolve a fila sem payload) da migration
 * `20261127180000_dead_letter_fila_rpc.sql`. O replay é a MESMA Edge admin-only
 * `webhook-replay` (`supabase/functions/webhook-replay/index.ts`) — a tela não
 * reprocessa nada por conta própria.
 *
 * O `rpc` sai com cast porque a função passa a existir no banco antes do
 * `types.ts` regenerar (mesmo padrão de `useAIBudgetSummary`).
 */
import { supabase } from '@/integrations/supabase/client';

/** Teto de itens por chamada (o mesmo teto que a Edge aceita em `MAX_REPLAY_BATCH`). */
export const DEAD_LETTER_LIMITE = 50;

export interface DeadLetterItem {
  id: string;
  external_id: string | null;
  endpoint: string;
  event_type: string | null;
  retry_count: number;
  error_at: string;
  /** `false` = linha sem `replay_payload`: o replay a ignora. */
  tem_payload: boolean;
}

export interface ReplayResultado {
  endpoint?: string;
  lidas: number;
  reprocessados: number;
  resolvidos: number;
  falhas: number;
  ignorados: number;
}

const rpc = supabase.rpc.bind(supabase) as unknown as (
  nome: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>;

/** Itens da fila (mais antigos primeiro) e o total da fila, não só o da página. */
export async function fetchDeadLetterFila(
  limite: number = DEAD_LETTER_LIMITE,
): Promise<{ itens: DeadLetterItem[]; total: number }> {
  const { data, error } = await rpc('webhook_dead_letter_fila', { p_limit: limite });
  if (error) throw error;
  const itens = (data ?? []) as Array<DeadLetterItem & { total?: number }>;
  const primeiro = itens[0];
  return { itens, total: primeiro ? Number(primeiro.total ?? itens.length) : 0 };
}

/** Reprocessa a fila pela Edge admin-only e devolve o resumo que ela mesma apurou. */
export async function reprocessarDeadLetter(
  limite: number = DEAD_LETTER_LIMITE,
): Promise<ReplayResultado> {
  const { data, error } = await supabase.functions.invoke('webhook-replay', {
    method: 'POST',
    body: { limit: limite },
  });
  if (error) throw error;
  return data as ReplayResultado;
}