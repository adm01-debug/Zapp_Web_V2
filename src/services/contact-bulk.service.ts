import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

/**
 * Mutação em lote de contatos com feedback fiel (R2-AUTH-013).
 *
 * Antes desta separação, `ContactBulkTagDialog`/`BulkActionsBar`/`useContactsCRUD`
 * anunciavam sucesso com `contactIds.length` mesmo quando o `select`/`update`
 * devolvia erro ou quando o RLS recusava parte das linhas (0 linhas afetadas sem
 * erro). Aqui quem mudou de fato fica em `succeeded`; quem o banco recusou fica em
 * `refused` (o chamador mantém esses IDs selecionados); e erro do SDK fica em
 * `failed` — nunca vira "sucesso".
 */
export interface BulkMutationOutcome {
  /** IDs cujo UPDATE afetou a linha (mudança realmente aplicada). */
  succeeded: string[];
  /** IDs que o banco recusou (linha invisível no SELECT ou UPDATE de 0 linhas). */
  refused: string[];
  /** IDs cujo SELECT/UPDATE devolveu erro do SDK. */
  failed: { id: string; error: unknown }[];
}

export function emptyOutcome(): BulkMutationOutcome {
  return { succeeded: [], refused: [], failed: [] };
}

/** IDs que precisam voltar/seguir selecionados: recusados + falhos. */
export function pendingIds(outcome: BulkMutationOutcome): string[] {
  return [...outcome.refused, ...outcome.failed.map((f) => f.id)];
}

type ContactUpdate = Database['public']['Tables']['contacts']['Update'];

/**
 * Aplica o mesmo campo a vários contatos e devolve exatamente quem mudou.
 *
 * Usa `.select('id')` no UPDATE para que o PostgREST devolva as linhas afetadas:
 * com RLS, um `update ... .in('id', ids)` sem `select` não distingue "mudou" de
 * "0 linhas" (ambos chegam sem erro) — era isso que virava sucesso total.
 */
export async function applyContactFieldUpdate(
  ids: string[],
  payload: ContactUpdate,
): Promise<BulkMutationOutcome> {
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return emptyOutcome();

  const { data, error } = await supabase
    .from('contacts')
    .update(payload)
    .in('id', wanted)
    .select('id');

  if (error) {
    return { succeeded: [], refused: [], failed: wanted.map((id) => ({ id, error })) };
  }

  const changed = new Set((data ?? []).map((row) => row.id));
  return {
    succeeded: wanted.filter((id) => changed.has(id)),
    refused: wanted.filter((id) => !changed.has(id)),
    failed: [],
  };
}

/** Parte pura da resposta: o chamador decide o que fazer com cada id. */
