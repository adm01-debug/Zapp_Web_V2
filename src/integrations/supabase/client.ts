import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { LOCAL_SUPABASE, SUPABASE_URL } from '@/config/supabase';

export { SUPABASE_URL } from '@/config/supabase';

// Banco oficial: Supabase Cloud, projeto tnnnlkbymytvtqngbbqh.
// IMPORTANTE: NÃO ler VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY — essas
// variáveis são auto-injetadas pelo ambiente (Supabase Cloud) apontando para o projeto interno
// (vpkmqeumtxhrwgawxdrl) e levariam o app para o banco errado. Secrets do tipo
// EXTERNAL_* só existem em edge functions, não no bundle, então usamos valores
// fixos aqui (a ANON KEY é pública por design).
// Exceção única: o desvio explícito para o banco LOCAL de desenvolvimento, validado em
// `@/config/supabase` (só fora de build de produção e só para http://127.0.0.1|localhost).
export const SUPABASE_ANON_KEY =
  LOCAL_SUPABASE?.anonKey ??
  'eyJhbG...knC0';

// Google OAuth ATIVO desde 28/08/2026 (GET /auth/v1/settings retorna
// external.google=true). Client "ZAPP Web V2 - Gmail", redirect registrado:
// https://tnnnlkbymytvtqngbbqh.supabase.co/auth/v1/callback
export const GOOGLE_OAUTH_ENABLED = true;

// ---------------------------------------------------------------------------
// Tempo limite de fetch — nenhuma chamada de rede do Supabase pode pendurar
// para sempre.
//
// O banco responde rápido no caso normal, mas um proxy travado ou uma conexão
// meio-aberta deixa o request pendente indefinidamente: sem limite, um RPC fora
// do React Query (ou o `getSession` do bootstrap de auth) trava até a janela
// inteira do app. Um AbortController converte qualquer travamento em falha
// rápida e limpa. O `signal` do chamador (realtime, aborts por request) é
// respeitado e encadeado; nenhuma promessa fica pendente.
// ---------------------------------------------------------------------------
export const SUPABASE_FETCH_TIMEOUT_MS = 12_000;

const makeTimeoutReason = (): unknown =>
  typeof DOMException !== 'undefined'
    ? new DOMException('Supabase request timed out', 'TimeoutError')
    : Object.assign(new Error('Supabase request timed out'), { name: 'TimeoutError' });

const makeAbortReason = (reason?: unknown): unknown =>
  reason ??
  (typeof DOMException !== 'undefined'
    ? new DOMException('Supabase request aborted by caller', 'AbortError')
    : Object.assign(new Error('Supabase request aborted by caller'), { name: 'AbortError' }));

const isAbortError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { name?: string }).name === 'AbortError';

/** Requests em voo, cancelados quando a página descarrega. */
const activeControllers = new Set<AbortController>();

if (typeof window !== 'undefined') {
  window.addEventListener(
    'beforeunload',
    () => {
      activeControllers.forEach((controller) => {
        try {
          controller.abort(makeAbortReason());
        } catch {
          /* abort durante descarregamento da página não precisa de tratamento */
        }
      });
      activeControllers.clear();
    },
    { once: true }
  );
}

/** `fetch` com limite de tempo, encadeando o abort do chamador. */
export const boundedFetch: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  activeControllers.add(controller);

  const timeoutId = setTimeout(
    () => controller.abort(makeTimeoutReason()),
    SUPABASE_FETCH_TIMEOUT_MS
  );

  const callerSignal = init?.signal ?? null;
  const abortFromCaller = () => controller.abort(makeAbortReason(callerSignal?.reason));
  if (callerSignal?.aborted) abortFromCaller();
  else callerSignal?.addEventListener('abort', abortFromCaller, { once: true });

  const { signal: _callerSignal, ...restInit } = init ?? {};

  try {
    const response = await fetch(input, { ...restInit, signal: controller.signal });
    // Alguns transports/mocks ignoram o AbortSignal: descarta o resultado que
    // chegou depois do abort em vez de devolvê-lo a quem já desistiu.
    if (controller.signal.aborted) {
      throw controller.signal.reason ?? makeTimeoutReason();
    }
    return response;
  } finally {
    callerSignal?.removeEventListener('abort', abortFromCaller);
    clearTimeout(timeoutId);
    activeControllers.delete(controller);
  }
};

// ---------------------------------------------------------------------------
// Retry de transporte — só falha transitória e só leitura.
//
//   - no máximo 2 retentativas (3 tentativas) com backoff curto 300ms/600ms;
//   - `GET`/`HEAD` são retentados; `POST` só quando é uma RPC de LEITURA da
//     allowlist abaixo. Escrita NUNCA é repetida automaticamente (o envio de
//     mensagem já é idempotente por `client_message_id`, mas repetir um POST de
//     escrita pela camada de rede não é decisão dela);
//   - `/auth/v1/` passa direto: o fluxo de token (login/refresh) tem a própria
//     temporização e o próprio tratamento de erro; repetir aqui só duplicaria
//     tentativas de refresh.
//   - body em stream (ou Request com body) passa direto: não pode ser reenviado;
//   - abort do chamador nunca é retentado;
//   - só o status 429/5xx é repetido. Um 4xx de negócio vai direto para o app;
//   - o tempo limite NÃO é retentado: repetir um banco saturado dobraria a carga
//     em vez de aliviar.
// ---------------------------------------------------------------------------
const SUPABASE_RETRY_MAX_RETRIES = 2;
const SUPABASE_RETRY_BASE_DELAY_MS = 300;
const SUPABASE_RETRY_MAX_DELAY_MS = 900;

/**
 * RPCs de LEITURA (sem efeito colateral) que podem ser repetidas. RPC de escrita
 * fora desta allowlist nunca entra no retry.
 */
const READONLY_RPC_ALLOWLIST: ReadonlySet<string> = new Set([
  'has_role',
  'is_admin_or_supervisor',
  'user_has_permission',
  'get_team_profiles',
  'search_contacts',
  'search_my_calls',
  'my_calls_kpi',
  'talk_me_list_queues',
  'talk_me_list_waiting',
  'talkx_overview_stats',
  'talkx_engine_window_open',
  'search_knowledge_base',
]);

const readMethod = (input: RequestInfo | URL, init?: RequestInit): string => {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== 'undefined' && input instanceof Request && input.method) {
    return input.method.toUpperCase();
  }
  return 'GET';
};

const readUrl = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
};

const isAuthRequest = (input: RequestInfo | URL): boolean => readUrl(input).includes('/auth/v1/');

/** Corpo que não pode ser reenviado (stream consumido) — fora do retry. */
const hasUnreplayableBody = (input: RequestInfo | URL, init?: RequestInit): boolean => {
  if (typeof ReadableStream !== 'undefined' && init?.body instanceof ReadableStream) return true;
  if (typeof Request !== 'undefined' && input instanceof Request && input.body !== null) return true;
  return false;
};

/** `POST` para `/rest/v1/rpc/<nome>` de leitura da allowlist. */
const isReadonlyRpc = (input: RequestInfo | URL): boolean => {
  const match = /\/rest\/v1\/rpc\/([a-z0-9_]+)/i.exec(readUrl(input));
  return match !== null && READONLY_RPC_ALLOWLIST.has(match[1]);
};

const podeRetentar = (input: RequestInfo | URL, init?: RequestInit): boolean => {
  if (init?.signal?.aborted) return false;
  if (isAuthRequest(input)) return false;
  if (hasUnreplayableBody(input, init)) return false;
  const method = readMethod(input, init);
  if (method === 'GET' || method === 'HEAD') return true;
  if (method === 'POST') return isReadonlyRpc(input);
  return false;
};

const statusRetentavel = (status: number): boolean => status === 429 || status >= 500;

const erroTransitorio = (err: unknown): boolean => !isAbortError(err) && err instanceof TypeError;

const retryDelayMs = (attempt: number): number =>
  Math.min(SUPABASE_RETRY_BASE_DELAY_MS * 2 ** attempt, SUPABASE_RETRY_MAX_DELAY_MS);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * `fetch` do cliente Supabase: tempo limite + retry de leitura. Na última
 * tentativa a resposta (inclusive 429/5xx) é devolvida como veio, para não
 * mudar o contrato de quem hoje lê `{ error }` do postgrest.
 */
export const supabaseFetch: typeof fetch = async (input, init) => {
  const retentavel = podeRetentar(input, init);
  let tentativa = 0;
  for (;;) {
    try {
      const response = await boundedFetch(input, init);
      if (!retentavel || !statusRetentavel(response.status) || tentativa >= SUPABASE_RETRY_MAX_RETRIES) {
        return response;
      }
    } catch (err) {
      if (!retentavel || !erroTransitorio(err) || tentativa >= SUPABASE_RETRY_MAX_RETRIES) throw err;
    }
    await sleep(retryDelayMs(tentativa));
    tentativa += 1;
  }
};

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
  global: {
    fetch: supabaseFetch,
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
