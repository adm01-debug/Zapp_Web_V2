import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { reportClientError } from '@/lib/errorReporter';

// Token público do Mapbox + taxonomia de falhas do mapa. Concentra três coisas que
// o picker e o balão de localização precisam igual: uma única busca do token por
// sessão (com timeout), mensagem por causa e telemetria da falha.

export type MapboxFailureKind =
  | 'timeout'
  | 'unauthorized'
  | 'rate_limited'
  | 'server_error'
  | 'network'
  | 'invalid_token'
  | 'forbidden'
  | 'unknown';

const MESSAGES: Record<MapboxFailureKind, string> = {
  timeout: 'O mapa demorou demais para carregar.',
  unauthorized: 'Sessão expirada. Recarregue a página.',
  rate_limited: 'Muitas tentativas seguidas. Aguarde um minuto.',
  server_error: 'O serviço de mapas está indisponível no servidor.',
  network: 'Sem conexão com o servidor de mapas.',
  invalid_token: 'O token do mapa é inválido ou expirou.',
  forbidden: 'Este endereço não tem permissão para usar o mapa.',
  unknown: 'Não foi possível carregar o mapa.',
};

export const MAPBOX_TOKEN_TIMEOUT_MS = 8_000;
// Cobre download do chunk do mapbox-gl + estilo + tiles. Um `load` tardio ainda limpa o erro.
export const MAPBOX_MAP_LOAD_TIMEOUT_MS = 20_000;
const TOKEN_TTL_MS = 15 * 60_000;

export class MapboxTokenError extends Error {
  readonly kind: MapboxFailureKind;
  constructor(kind: MapboxFailureKind) {
    super(MESSAGES[kind]);
    this.name = 'MapboxTokenError';
    this.kind = kind;
  }
}

export function mapboxFailureMessage(kind: MapboxFailureKind): string {
  return MESSAGES[kind];
}

export function mapboxFailureKindOf(err: unknown): MapboxFailureKind {
  return err instanceof MapboxTokenError ? err.kind : 'unknown';
}

/** Classifica o `error` do evento 'error' do mapbox-gl (carrega `status` quando veio de HTTP). */
export function mapboxFailureKindFromMapError(err: unknown): MapboxFailureKind {
  const status = (err as { status?: unknown } | null)?.status;
  if (status === 401) return 'invalid_token';
  if (status === 403) return 'forbidden';
  if (err instanceof TypeError) return 'network';
  return 'unknown';
}

type InvokeError = { name?: string; context?: { status?: unknown } } | null;

// Nota: a edge devolve corpo genérico em 5xx (errorResponse esconde a causa), então
// o status é o único sinal confiável; "secret ausente" cai em server_error.
function classifyInvokeError(error: unknown): MapboxFailureKind {
  const e = error as InvokeError;
  const status = e?.context?.status;
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 429) return 'rate_limited';
  if (typeof status === 'number' && status >= 500) return 'server_error';
  if (e?.name === 'FunctionsFetchError') return 'network';
  if (e?.name === 'FunctionsRelayError') return 'server_error';
  return 'unknown';
}

async function requestToken(): Promise<string> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new MapboxTokenError('timeout'));
    }, MAPBOX_TOKEN_TIMEOUT_MS);
  });
  try {
    const { data, error } = await Promise.race([
      supabase.functions.invoke('get-mapbox-token', { signal: controller.signal }),
      timeout,
    ]);
    if (error) throw new MapboxTokenError(classifyInvokeError(error));
    const token = (data as { token?: unknown } | null)?.token;
    if (typeof token !== 'string' || !token) throw new MapboxTokenError('unknown');
    return token;
  } catch (err) {
    if (err instanceof MapboxTokenError) throw err;
    throw new MapboxTokenError(err instanceof TypeError ? 'network' : 'unknown');
  } finally {
    clearTimeout(timer);
  }
}

let cached: { token: string; expiresAt: number } | null = null;
let inflight: Promise<string> | null = null;

/**
 * Token público do Mapbox, buscado no máximo uma vez por janela de 15 min e
 * compartilhado entre todos os mapas da tela (várias bolhas de localização na
 * mesma conversa não disparam uma invoke cada). Falhas nunca são cacheadas.
 */
export function getMapboxToken(opts: { force?: boolean } = {}): Promise<string> {
  if (!opts.force) {
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.token);
    if (inflight) return inflight;
  }
  const request: Promise<string> = requestToken()
    .then((token) => {
      cached = { token, expiresAt: Date.now() + TOKEN_TTL_MS };
      return token;
    })
    .finally(() => {
      if (inflight === request) inflight = null;
    });
  inflight = request;
  return request;
}

export function resetMapboxTokenForTests(): void {
  cached = null;
  inflight = null;
}

/** Log local + linha em audit_logs (client_error), com dedupe/limite do errorReporter. */
export function reportMapboxFailure(kind: MapboxFailureKind, where: 'picker' | 'bubble', detail?: unknown): void {
  log.error(`Mapbox falhou (${where}/${kind})`, detail);
  reportClientError(new Error(`mapbox_${kind}`), { source: `mapbox_${where}`, kind });
}
