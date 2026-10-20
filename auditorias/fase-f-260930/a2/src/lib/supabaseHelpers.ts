/**
 * Typed helpers for dynamic Supabase table operations.
 * 
 * Provides a type-safe wrapper that avoids `(supabase as any)` 
 * while preventing deep type instantiation with large schemas.
 */

import { supabase } from '@/integrations/supabase/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DynamicClient = { from: (table: string) => any };

/**
 * Get a Supabase query builder for a dynamic table name.
 * Use this instead of `(supabase as any).from(tableName)`.
 */
export function fromTable(tableName: string) {
  return (supabase as unknown as DynamicClient).from(tableName);
}

/** Re-exporta o cliente Supabase para uso em componentes que precisam de realtime ou invoke. */
export { supabase };
/** Invoca uma edge function de forma tipada. */
export async function invokeEdge(fnName: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(fnName, { body });
  if (error) throw error;
  return data;
}
