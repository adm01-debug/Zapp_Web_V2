import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * externalClient — cliente Supabase para o CRM externo (pgxfvjmuubtbowutlide)
 * 57.728 empresas | 48.623 clientes | 4.747 contatos | 10.460 interações
 *
 * RPCs: get_companies_by_phones_batch, search_contacts_advanced,
 *       get_contact_360_by_phone, sync_interaction_from_zapp,
 *       get_contact_intelligence_by_phone
 *
 * storageKey único evita Multiple GoTrueClient warning
 * Realtime desabilitado — apenas REST queries contra o CRM
 */

const EXTERNAL_URL =
  import.meta.env.VITE_CLIENTES_SUPABASE_URL ||
  'https://pgxfvjmuubtbowutlide.supabase.co';

const EXTERNAL_KEY =
  import.meta.env.VITE_CLIENTES_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBneGZ2am11dWJ0Ym93dXRsaWRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMjcwMTIsImV4cCI6MjA4NTcwMzAxMn0.sW9N_LChqwVNUvMmQWXx87Vhs3eoTI2OKg2TT_Cg4V0';

export const isExternalConfigured = true;

export const externalSupabase: SupabaseClient = createClient(
  EXTERNAL_URL,
  EXTERNAL_KEY,
  {
    auth: {
      storageKey: 'external-sb-auth-token',
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    realtime: {
      params: { eventsPerSecond: -1 },
    },
    global: {
      headers: {
        'x-client-info': 'zapp-web-external-crm',
      },
    },
  },
);

export function getExternalSupabase(): SupabaseClient {
  return externalSupabase;
}
