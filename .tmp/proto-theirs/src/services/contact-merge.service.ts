import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export async function mergeContactsAtomic(
  primaryId: string,
  secondaryIds: string[],
  mergedFields: Record<string, Json | undefined>,
) {
  const sanitizedFields = Object.fromEntries(
    Object.entries(mergedFields).filter(([, value]) => value !== undefined),
  ) as Json;
  const { data, error } = await supabase.rpc('merge_contacts_atomic', {
    p_primary_id: primaryId,
    p_secondary_ids: secondaryIds,
    p_merged_fields: sanitizedFields,
  });
  if (error) throw error;
  return data;
}
