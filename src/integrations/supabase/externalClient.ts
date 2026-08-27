import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * externalClient — segundo cliente Supabase (tnnnlkbymytvtqngbbqh)
 * Usado pelo CRM 360 e integrações externas.
 *
 * FIX: storageKey único evita Multiple GoTrueClient warning
 * (segundo cliente com mesma URL mas contexto separado)
 */

const EXTERNAL_URL = 'https://tnnnlkbymytvtqngbbqh.supabase.co';
const EXTERNAL_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRubm5sa2J5bXl0dnRxbmdiYnFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3MjU0MDEsImV4cCI6MjEwMzMwMTQwMX0.4kDVowXzo3yBVboLOFn1bsij-vBKncJXVoPot3iknC0';

export const isExternalConfigured = true;

export const externalSupabase: SupabaseClient = createClient(
  EXTERNAL_URL,
  EXTERNAL_KEY,
  {
    auth: {
      // storageKey único — evita conflito com o cliente principal (sb-supabase-auth-token)
      storageKey: 'external-sb-auth-token',
      storage:
        typeof window !== 'undefined' ? window.localStorage : undefined,
      autoRefreshToken: true,
      persistSession: false,
    },
    global: {
      headers: {
        'x-client-info': 'zapp-web-external-360',
      },
    },
  },
);

export function getExternalSupabase(): SupabaseClient {
  return externalSupabase;
}
