import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { SUPABASE_URL } from '@/config/supabase';

export { SUPABASE_URL } from '@/config/supabase';

// Banco oficial: Supabase Cloud, projeto tnnnlkbymytvtqngbbqh.
// IMPORTANTE: NÃO ler VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY — essas
// variáveis são auto-injetadas pelo Lovable Cloud apontando para o projeto interno
// (vpkmqeumtxhrwgawxdrl) e levariam o app para o banco errado. Secrets do tipo
// EXTERNAL_* só existem em edge functions, não no bundle, então usamos valores
// fixos aqui (a ANON KEY é pública por design).
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRubm5sa2J5bXl0dnRxbmdiYnFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3MjU0MDEsImV4cCI6MjEwMzMwMTQwMX0.4kDVowXzo3yBVboLOFn1bsij-vBKncJXVoPot3iknC0';

// Google OAuth ATIVO desde 28/08/2026 (GET /auth/v1/settings retorna
// external.google=true). Client "ZAPP Web V2 - Gmail", redirect registrado:
// https://tnnnlkbymytvtqngbbqh.supabase.co/auth/v1/callback
export const GOOGLE_OAUTH_ENABLED = true;

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
  global: {
    headers: {
      'x-app-name': 'zapp-web',
      'x-app-version': '2.0.1',
    },
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export type SupabaseClient = typeof supabase;
