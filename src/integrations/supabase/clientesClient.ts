import { createClient } from '@supabase/supabase-js';

/**
 * GESTÃO DE CLIENTES — CRM Promobrindes
 * Supabase Cloud: pgxfvjmuubtbowutlide
 * 57.728 empresas | 48.623 clientes | 4.747 contatos | 10.460 interações
 *
 * IMPORTANT: auth.persistSession=false, realtime desabilitado
 * para evitar Multiple GoTrueClient e conflito de WebSocket
 * com o cliente principal (supabase.atomicabr.com.br)
 */

const CLIENTES_URL =
  import.meta.env.VITE_CLIENTES_SUPABASE_URL ||
  'https://pgxfvjmuubtbowutlide.supabase.co';

const CLIENTES_ANON_KEY =
  import.meta.env.VITE_CLIENTES_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBneGZ2am11dWJ0Ym93dXRsaWRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMjcwMTIsImV4cCI6MjA4NTcwMzAxMn0.sW9N_LChqwVNUvMmQWXx87Vhs3eoTI2OKg2TT_Cg4V0';

export const clientesSupabase = createClient(CLIENTES_URL, CLIENTES_ANON_KEY, {
  auth: {
    // Chave de storage separada — evita conflito com o cliente principal
    storageKey: 'clientes-sb-auth-token',
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  // Desabilitar Realtime — este cliente é só para consultas REST ao CRM
  // Evita uma segunda conexão WebSocket e o aviso "Multiple GoTrueClient"
  realtime: {
    params: {
      eventsPerSecond: -1,
    },
  },
  global: {
    headers: {
      'x-app-name': 'zapp-web',
      'x-app-version': '2.0.1',
    },
  },
});

// Helpers tipados para as tabelas principais do CRM
export const clientesDB = {
  companies:        () => clientesSupabase.from('companies'),
  customers:        () => clientesSupabase.from('customers'),
  contacts:         () => clientesSupabase.from('contacts'),
  interactions:     () => clientesSupabase.from('interactions'),
  deals:            () => clientesSupabase.from('deals'),
  profiles:         () => clientesSupabase.from('profiles'),
  whatsappMessages: () => clientesSupabase.from('whatsapp_messages'),
  rfmScores:        () => clientesSupabase.from('company_rfm_scores'),
  activities:       () => clientesSupabase.from('activities'),
  tasks:            () => clientesSupabase.from('tasks'),
  alerts:           () => clientesSupabase.from('alerts'),
  proposals:        () => clientesSupabase.from('proposals'),
};

export type ClientesSupabase = typeof clientesSupabase;
