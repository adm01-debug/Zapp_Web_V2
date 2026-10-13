/**
 * PE-16 — o id de correlação nasce no navegador e chega à Edge Function.
 *
 * A Edge já tem `_shared/observability.ts` (withRequestId) e `_shared/validation.ts`
 * (getCorsHeaders), mas nada no front mandava id nenhum: cada camada inventava o
 * seu e o erro que o usuário via não casava com a linha de log da Edge. Este
 * wrapper é o único ponto que injeta os cabeçalhos de rastreio numa chamada de
 * Edge do Zapp Web:
 *
 *   - `x-request-id`     — é o cabeçalho que `resolveRequestId` (observability.ts)
 *                          já lê, valida (^[A-Za-z0-9._-]{8,64}$) e registra como
 *                          `rid`. Sem ele o id do log da Edge era outro.
 *   - `x-correlation-id` — mesmo id, para quem lê o nome canônico (a V3 usa este).
 *   - `traceparent`      — W3C Trace Context v0, para a cadeia front → Edge → banco.
 *
 * Os três carregam o MESMO id curto (o `traceparent` tem ids próprios de 128/64
 * bits, como a norma exige), então o log do cliente e o da Edge compartilham o id.
 *
 * O id é gerado por `generateCorrelationId` de `lib/logger.ts` — nada de um segundo
 * gerador. Cabeçalho extra passado em `headers` tem precedência (permite continuar
 * um trace externo). Nada de corpo, telefone, token ou texto de mensagem no log.
 *
 * Uso:
 *   const { data, error } = await invokeEdge('message-delivery', { body: { messageId } });
 *
 * Nota de CORS: o navegador só envia um cabeçalho não simples se o allow-list do
 * preflight o listar. `x-correlation-id` e `traceparent` foram acrescentados ao
 * `Access-Control-Allow-Headers` de `_shared/validation.ts` neste mesmo cartão —
 * sem isso o preflight recusaria a chamada e quebraria justamente o chat.
 */
import type { FunctionInvokeOptions } from '@supabase/functions-js';

import { supabase } from '@/integrations/supabase/client';
import { createLogger, generateCorrelationId } from '@/lib/logger';

const log = createLogger('edge-invoke');

/** Cabeçalho canônico do id (compatível com a V3). */
export const CORRELATION_HEADER = 'x-correlation-id';
/** Cabeçalho que a Edge do V2 já lê e loga como `rid`. */
export const REQUEST_ID_HEADER = 'x-request-id';

export interface EdgeInvokeOptions extends FunctionInvokeOptions {
  /**
   * Cabeçalhos extras. Têm precedência sobre os de rastreio, para o chamador
   * poder continuar um trace externo.
   */
  headers?: Record<string, string>;
}

/** Contador do último recurso de `randomHex` (ambiente sem WebCrypto). */
let contadorSemCrypto = 0;

/**
 * `2*n` bytes em hex minúsculo. Mesma escada de recurso do `crossTabSendDedupe`
 * (`getRandomValues` -> relógio + contador, nunca `Math.random`): o traceparent
 * precisa ser ÚNICO na sessão, não é segredo, e há ambiente de teste (jsdom) que
 * troca o `crypto` global e não tem `getRandomValues`.
 */
function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(buffer);
      return Array.from(buffer, (b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // `crypto` bloqueado: cai no último recurso abaixo.
  }
  contadorSemCrypto += 1;
  const semente = `${Date.now().toString(16)}${contadorSemCrypto.toString(16)}`.padEnd(bytes * 2, '0');
  return semente.slice(0, bytes * 2);
}

/**
 * Trace Context W3C v0: `00-<trace-id 32hex>-<span-id 16hex>-<flags 2hex>`.
 * Amostragem ligada (`01`) porque o volume das Edge do Zapp não é grande e a
 * correlação é o objetivo do cartão.
 */
export function makeTraceparent(): string {
  return `00-${randomHex(16)}-${randomHex(8)}-01`;
}

export interface EdgeTraceHeaders {
  correlationId: string;
  traceparent: string;
  headers: Record<string, string>;
}

/**
 * Monta os cabeçalhos de rastreio com um id novo. Puro (fora do gerador de ids),
 * para o teste conseguir afirmar o formato sem chamar a Edge.
 */
export function buildEdgeTraceHeaders(extraHeaders?: Record<string, string>): EdgeTraceHeaders {
  // Um trace externo pode chegar por qualquer um dos dois nomes: se o chamador
  // mandou um id, ele vale para os dois cabeçalhos — os dois NUNCA divergem, que é
  // o que garante a correlação com a Edge.
  const providedId = extraHeaders?.[REQUEST_ID_HEADER] ?? extraHeaders?.[CORRELATION_HEADER];
  const correlationId = providedId ?? generateCorrelationId();
  const traceparent = makeTraceparent();
  return {
    correlationId,
    traceparent,
    headers: {
      [REQUEST_ID_HEADER]: correlationId,
      [CORRELATION_HEADER]: correlationId,
      traceparent,
      ...extraHeaders,
    },
  };
}

/** `status` do erro de HTTP (FunctionsHttpError); `null` em erro de rede. */
function statusOf(error: unknown): number | null {
  const context = (error as { context?: { status?: unknown } } | null)?.context;
  return typeof context?.status === 'number' ? context.status : null;
}

/** Código sintetizado quando o corpo do erro não traz um código de domínio. */
export const EDGE_ERROR_UNKNOWN = 'unknown';
/** Código sintetizado quando a chamada nem chegou à Edge (rede/DNS/timeout). */
export const EDGE_ERROR_NETWORK = 'network_error';

/** Erros por campo, como o envelope canônico da Edge devolve em `fields`. */
export type EdgeFieldErrors = Record<string, string>;

/** Erro de Edge já com o corpo lido. */
export interface ParsedEdgeError {
  /** Código de domínio do servidor (ou `EDGE_ERROR_UNKNOWN`/`EDGE_ERROR_NETWORK`). */
  code: string;
  /** Mensagem apresentável — a do corpo quando há, senão a do SDK/`fallback`. */
  message: string;
  fieldErrors: EdgeFieldErrors;
  status: number | null;
  /** Corpo cru da resposta (o chamador lê campos de domínio, ex.: `count`/`limit`). */
  raw: unknown;
}

function sdkMessageOf(error: unknown): string | null {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message.trim() !== '' ? message : null;
}

/** `fields: [{ path, message }]` do envelope canônico -> `{ campo: mensagem }`. */
function readFieldErrors(fields: unknown): EdgeFieldErrors {
  if (!Array.isArray(fields)) return {};
  const out: EdgeFieldErrors = {};
  for (const entry of fields) {
    if (!entry || typeof entry !== 'object') continue;
    const { path, message } = entry as { path?: unknown; message?: unknown };
    if (typeof path === 'string' && typeof message === 'string') out[path] = message;
  }
  return out;
}

/**
 * Lê o corpo JSON de um erro de `functions.invoke`. O supabase-js entrega a
 * `Response` crua em `error.context`; sem lê-la o usuário só veria "Edge
 * Function returned a non-2xx status code". É o ÚNICO lugar do front que faz
 * esse `clone().json()` — os hooks de domínio leem o corpo por aqui.
 */
export async function readEdgeErrorBody(error: unknown): Promise<unknown | null> {
  const context = (error as { context?: { clone?: unknown } } | null)?.context;
  if (!context || typeof context.clone !== 'function') return null;
  try {
    return await (context as { clone(): { json(): Promise<unknown> } }).clone().json();
  } catch {
    return null; // corpo sem JSON (timeout/proxy): fica a mensagem do SDK
  }
}

/**
 * Traduz o erro de `functions.invoke` num erro útil, reconhecendo:
 *   - o envelope canônico de `_shared/schemas.ts`: `{ error: { code, message, fields } }`;
 *   - o código plano da Edge: `{ error: '<codigo>', message? }` e `{ code }`;
 *   - a falha de rede (sem corpo), com `code: EDGE_ERROR_NETWORK`.
 * Nunca inventa texto: sem corpo, cai na mensagem do SDK (ou no `fallback`).
 */
export async function parseEdgeError(error: unknown, fallback?: string): Promise<ParsedEdgeError> {
  const status = statusOf(error);
  const raw = await readEdgeErrorBody(error);
  const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const bodyError = body?.error;
  const canonical = bodyError && typeof bodyError === 'object' ? (bodyError as Record<string, unknown>) : null;

  let code: string | null = null;
  let message: string | null = null;
  let fieldErrors: EdgeFieldErrors = {};

  if (canonical) {
    if (typeof canonical.code === 'string' && canonical.code !== '') code = canonical.code;
    if (typeof canonical.message === 'string' && canonical.message !== '') message = canonical.message;
    fieldErrors = readFieldErrors(canonical.fields);
  } else if (typeof bodyError === 'string' && bodyError !== '') {
    code = bodyError;
    message = typeof body?.message === 'string' && body.message !== '' ? body.message : bodyError;
  }
  // Código plano tem precedência (`promogifts-catalog` responde `{ error, code }`).
  if (typeof body?.code === 'string' && body.code !== '') code = body.code;
  if (!message && typeof body?.message === 'string' && body.message !== '') message = body.message;

  if (!message) message = sdkMessageOf(error) ?? fallback ?? defaultErrorMessage(status);
  if (!code) code = status === null && !body ? EDGE_ERROR_NETWORK : EDGE_ERROR_UNKNOWN;

  return { code, message, fieldErrors, status, raw };
}

function defaultErrorMessage(status: number | null): string {
  return status === null
    ? 'Falha de rede ao chamar a Edge Function.'
    : `Edge Function falhou (HTTP ${status}).`;
}

/** Erro de Edge pronto para exibir: `message` legível + `code`/`fieldErrors`. */
export class EdgeFunctionError extends Error {
  readonly code: string;
  readonly fieldErrors: EdgeFieldErrors;
  readonly status: number | null;
  readonly functionName: string;

  constructor(functionName: string, parsed: ParsedEdgeError) {
    super(parsed.message);
    this.name = 'EdgeFunctionError';
    this.functionName = functionName;
    this.code = parsed.code;
    this.fieldErrors = parsed.fieldErrors;
    this.status = parsed.status;
  }
}

/** Resultado do `invokeEdge`: sucesso com `error: null` ou falha com `error` tipado. */
export interface EdgeInvokeResult<T> {
  data: T | null;
  error: EdgeFunctionError | null;
}

/**
 * `supabase.functions.invoke` com o id de correlação injetado e o erro já
 * traduzido (`EdgeFunctionError` com `code`/`fieldErrors`), nunca lançando:
 * migrar um chamador é ler `const { data, error } = await invokeEdge(...)`.
 *
 * Em erro, registra UMA linha no cliente com o mesmo id que foi para a Edge —
 * é essa linha que o suporte casa com o `rid` do log da Edge. Só entram nome da
 * função, status e classe do erro: nada do corpo, que pode conter dado pessoal.
 */
export async function invokeEdge<T = unknown>(
  functionName: string,
  options: EdgeInvokeOptions = {},
): Promise<EdgeInvokeResult<T>> {
  const { headers: extraHeaders, ...invokeOptions } = options;
  const { correlationId, headers } = buildEdgeTraceHeaders(extraHeaders);

  const resposta = await supabase.functions.invoke<T>(functionName, {
    ...invokeOptions,
    headers,
  });

  if (resposta.error) {
    // O corpo de `error.context` é lido UMA vez, pelo parser compartilhado —
    // é ele que transforma "non-2xx" no código/mensagem que o servidor mandou.
    const parsed = await parseEdgeError(resposta.error, `Edge "${functionName}" falhou`);
    log.withCorrelation(correlationId).error(`Edge ${functionName} falhou`, {
      status: parsed.status,
      tipo: (resposta.error as { name?: string }).name,
    });
    return { data: null, error: new EdgeFunctionError(functionName, parsed) };
  }

  // Sucesso: `data` do invoke, ou `null` quando a Edge respondeu vazio.
  return { data: resposta.data ?? null, error: null };
}
