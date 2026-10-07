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

/**
 * Adiciona/remove tags em vários contatos.
 *
 * - SELECT com erro NÃO vira lista vazia: devolve `failed` e o chamador reporta a
 *   falha (antes `tags=[]` era fabricado e o UPDATE sobrescrevia as tags reais).
 * - Contato que o SELECT não devolveu (RLS) fica em `refused` — não recebe update.
 * - Cada UPDATE leva `.select('id')`: 0 linhas afetadas = recusa, não sucesso.
 */
export async function applyContactTagChange(
  ids: string[],
  change: { add?: string[]; remove?: string[] },
): Promise<BulkMutationOutcome> {
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return emptyOutcome();

  const { data, error } = await supabase
    .from('contacts')
    .select('id, tags')
    .in('id', wanted);

  if (error) {
    return { succeeded: [], refused: [], failed: wanted.map((id) => ({ id, error })) };
  }

  const rows = (data ?? []) as { id: string; tags: string[] | null }[];
  const readIds = new Set(rows.map((row) => row.id));
  // Invisível no SELECT = recusado pelo RLS (nunca inventamos estado para ele).
  const refused = wanted.filter((id) => !readIds.has(id));
  const succeeded: string[] = [];
  const failed: { id: string; error: unknown }[] = [];

  for (const row of rows) {
    const next = new Set(row.tags ?? []);
    for (const tag of change.add ?? []) next.add(tag);
    for (const tag of change.remove ?? []) next.delete(tag);
    const nextTags = [...next];

    if (sameTags(row.tags, nextTags)) continue;

    const { data: updated, error: updateError } = await supabase
      .from('contacts')
      .update({ tags: nextTags })
      .eq('id', row.id)
      .select('id');

    if (updateError) {
      failed.push({ id: row.id, error: updateError });
    } else if ((updated ?? []).length > 0) {
      succeeded.push(row.id);
    } else {
      refused.push(row.id);
    }
  }

  return { succeeded, refused, failed };
}

function sameTags(current: string[] | null, next: string[]): boolean {
  const before = current ?? [];
  if (before.length !== next.length) return false;
  const set = new Set(before);
  return next.every((tag) => set.has(tag));
}
