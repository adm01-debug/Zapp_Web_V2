// Banco oficial do ZAPP Web V2. Kept outside the client module so utilities
// can validate object origins without importing or initializing Supabase.
export const PRODUCTION_SUPABASE_URL = 'https://tnnnlkbymytvtqngbbqh.supabase.co';

// Banco LOCAL de desenvolvimento (Arquitetura V2: agente nunca trabalha contra a producao).
//
// O app continua NAO lendo VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY: o ambiente de
// hospedagem injeta essas variaveis apontando para outro projeto (ver client.ts). O desvio para o
// banco local usa nomes dedicados e so vale quando as TRES condicoes abaixo sao verdadeiras:
//   1. o build NAO e de producao (`bun run dev`, vitest); em `vite build` o desvio e ignorado;
//   2. VITE_ZAPP_LOCAL_SUPABASE_URL aponta para a propria maquina (http://127.0.0.1 ou localhost);
//   3. VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY esta preenchida.
// Qualquer outra combinacao cai no banco oficial. Assim uma variavel perdida nunca leva o app
// para um terceiro projeto, e um build de producao nunca aponta para localhost.
// Os valores saem de `zapp-db-local env <copia> <nome>` (API_URL e ANON_KEY).
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

interface SupabaseEnv {
  PROD?: boolean;
  VITE_ZAPP_LOCAL_SUPABASE_URL?: string;
  VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY?: string;
}

export interface LocalSupabaseTarget {
  url: string;
  anonKey: string;
}

export function resolveLocalSupabase(env: SupabaseEnv | undefined): LocalSupabaseTarget | null {
  if (!env || env.PROD) return null;
  const rawUrl = env.VITE_ZAPP_LOCAL_SUPABASE_URL?.trim();
  const anonKey = env.VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY?.trim();
  if (!rawUrl || !anonKey) return null;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' || !LOCAL_HOSTS.has(parsed.hostname)) return null;
    return { url: parsed.origin, anonKey };
  } catch {
    return null;
  }
}

// `import.meta.env` nao existe quando este modulo e carregado por Node puro (scripts).
const runtimeEnv = (import.meta as { env?: SupabaseEnv }).env;

export const LOCAL_SUPABASE = resolveLocalSupabase(runtimeEnv);
export const IS_LOCAL_SUPABASE = LOCAL_SUPABASE !== null;
export const SUPABASE_URL = LOCAL_SUPABASE?.url ?? PRODUCTION_SUPABASE_URL;
