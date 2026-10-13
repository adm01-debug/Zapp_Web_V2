import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

/**
 * Retorno de `merge_contacts_atomic` (contrato da migration 20261013051239).
 * - `merged_contacts`: quantos secundarios foram mesclados NESTA chamada.
 * - `already_merged`: quantos ja estavam mesclados no principal (chamada repetida e no-op).
 * - `moved_relations`: quantas linhas de dependencia foram realocadas para o principal.
 */
export interface ContactMergeResult {
  primary_id: string;
  merged_contacts: number;
  already_merged?: number;
  moved_relations?: number;
}

export async function mergeContactsAtomic(
  primaryId: string,
  secondaryIds: string[],
  mergedFields: Record<string, Json | undefined>,
): Promise<ContactMergeResult> {
  const sanitizedFields = Object.fromEntries(
    Object.entries(mergedFields).filter(([, value]) => value !== undefined),
  ) as Json;
  const { data, error } = await supabase.rpc('merge_contacts_atomic', {
    p_primary_id: primaryId,
    p_secondary_ids: secondaryIds,
    p_merged_fields: sanitizedFields,
  });
  if (error) throw error;
  return data as unknown as ContactMergeResult;
}
