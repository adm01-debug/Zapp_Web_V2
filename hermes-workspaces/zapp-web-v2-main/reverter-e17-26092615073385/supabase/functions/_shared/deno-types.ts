/**
 * Tipos compartilhados das Edge Functions (Deno).
 * Import type-only: não adiciona peso de runtime aos bundles.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type { SupabaseClient };

/** Linha genérica de payload JSON sem esquema garantido pelo upstream. */
export type JsonRecord = Record<string, unknown>;
