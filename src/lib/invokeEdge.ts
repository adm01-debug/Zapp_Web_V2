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
import type { FunctionInvokeOptions, FunctionsResponse } from '@supabase/functions-js';

import { supabase } from '@/integrations/supabase/client';
import { createLogger, generateCorrelationId } from '@/lib/logger';

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

/** Código canônico para erros de rede (sem status HTTP). */
export const EDGE_ERROR_NETWORK = 'EDGE_ERROR_NETWORK';
/** Código canônico para erros sem estrutura reconhecida. */
export const EDGE_ERROR_UNKNOWN = 'EDGE_ERROR_UNKNOWN';

/** Envelope de erro normalizado devolvido por `parseEdgeError`. */
export interface ParsedEdgeError {
  /** Código de domínio (ex: `VALIDATION_ERROR`, `forbidden`). */
  code: string;
  /** Mensagem legível para o usuário. */
  message: string;
  /** Status HTTP original; `null` em erro de rede. */
  status: number | null;
  /** Erros por campo (`{ nomeDoCampo: 'mensagem' }`). */
  fieldErrors?: Record<string, string>;
  /** Corpo cru da resposta, para debug. */
  raw?: unknown;
}

/**
 * Erro tipado que `invokeEdge` devolve quando a Edge retorna um status não-2xx.
 * Estende `Error` para poder ser `throw`ado, mas o contrato de `invokeEdge`
 * nunca lança — o chamador decide.
 */
export class EdgeFunctionError extends Error implements ParsedEdgeError {
  code: string;
  status: number | null;
  fieldErrors?: Record<string, string>;
  raw?: unknown;
  functionName?: string;

  constructor(parsed: ParsedEdgeError, functionName?: string) {
    super(parsed.message);
    this.name = 'EdgeFunctionError';
    this.code = parsed.code;
    this.status = parsed.status;
    this.fieldErrors = parsed.fieldErrors;
    this.raw = parsed.raw;
    this.functionName = functionName;
  }
}

/** `status` do erro de HTTP (FunctionsHttpError); `null` em erro de rede. */
function statusOf(error: unknown): number | null {
  const context = (error as { context?: { status?: unknown } } | null)?.context;
  return typeof context?.status === 'number' ? context.status : null;
}

/**
 * Lê o corpo JSON cru do erro de Edge. Devolve `null` se não há `context.clone`
 * ou se o corpo não é JSON válido.
 */
export async function readEdgeErrorBody(error: unknown): Promise<unknown> {
  const context = (error as { context?: { clone?: () => { json?: () => Promise<unknown> } } } | null)?.context;
  if (!context?.clone) return null;
  try {
    return await context.clone().json?.() ?? null;
  } catch {
    return null;
  }
}

/**
 * Normaliza qualquer erro devolvido por `invokeEdge` (ou capturado de `catch`) em
 * um `ParsedEdgeError` com `code`, `message`, `status` e `fieldErrors`.
 *
 * Reconhece:
 *  - Envelope canônico `{ error: { code, message, fields } }` (validação estruturada)
 *  - Código plano `{ error: 'string', message?: 'string' }` (domínio)
 *  - `EdgeFunctionError` já parseado
 *  - Erro de rede (sem `context`)
 *  - Corpo não-JSON (cai na mensagem do SDK)
 */
export async function parseEdgeError(error: unknown, fallbackMessage?: string): Promise<ParsedEdgeError> {
  // Já é um EdgeFunctionError — evita re-parsear.
  if (error instanceof EdgeFunctionError) {
    return { code: error.code, message: error.message, status: error.status, fieldErrors: error.fieldErrors, raw: error.raw };
  }

  const status = statusOf(error);
  const body = await readEdgeErrorBody(error);

  if (body === null) {
    // Sem corpo: erro de rede ou fallback.
    const rawMsg = (error as { message?: string } | null)?.message;
    return {
      code: status === null ? EDGE_ERROR_NETWORK : EDGE_ERROR_UNKNOWN,
      message: rawMsg ?? fallbackMessage ?? 'Erro desconhecido',
      status,
    };
  }

  // Envelope canônico: { error: { code, message, fields } }
  const errorObj = (body as { error?: unknown })?.error;
  if (errorObj !== null && typeof errorObj === 'object' && 'code' in (errorObj as object)) {
    const e = errorObj as { code: string; message?: string; fields?: Array<{ path: string; message: string }> };
    const fieldErrors = e.fields
      ? Object.fromEntries(e.fields.map((f) => [f.path, f.message]))
      : undefined;
    return { code: e.code, message: e.message ?? e.code, status, fieldErrors, raw: body };
  }

  // Código plano: { error: 'some_code', message?: 'texto' }
  if (typeof errorObj === 'string') {
    const msg = (body as { message?: string })?.message ?? errorObj;
    return { code: errorObj, message: msg, status, raw: body };
  }

  // Fallback: usa a mensagem original do SDK (não inventa texto).
  const sdkMsg = (error as { message?: string } | null)?.message ?? fallbackMessage ?? 'Erro desconhecido';
  return { code: EDGE_ERROR_UNKNOWN, message: sdkMsg, status, raw: body };
}

/**
 * Alias de `parseEdgeError` — nome usado em `useAdminData` onde o foco é ler
 * o `status` e a `message` sem um segundo argumento de fallback.
 */
export const readEdgeError = parseEdgeError;

/**
 * `supabase.functions.invoke` com o id de correlação injetado. Mesmo contrato de
 * retorno do invoke (`{ data, error }`, nunca lança): migrar um chamador é trocar
 * `supabase.functions.invoke(` por `invokeEdge(`.
 *
 * Em erro, registra UMA linha no cliente com o mesmo id que foi para a Edge —
 * é essa linha que o suporte casa com o `rid` do log da Edge. Só entram nome da
 * função, status e classe do erro: nada do corpo, que pode conter dado pessoal.
 */
export async function invokeEdge<T = unknown>(
  functionName: string,
  options: EdgeInvokeOptions = {},
): Promise<FunctionsResponse<T>> {
  const { headers: extraHeaders, ...invokeOptions } = options;
  const { correlationId, headers } = buildEdgeTraceHeaders(extraHeaders);

  const resposta = await supabase.functions.invoke<T>(functionName, {
    ...invokeOptions,
    headers,
  });

  if (resposta.error) {
    createLogger('edge-invoke').withCorrelation(correlationId).error(`Edge ${functionName} falhou`, {
      status: statusOf(resposta.error),
      tipo: resposta.error.name,
    });
  }

  // Devolve a união do próprio invoke (sucesso com `error: null` / falha com
  // `data: null`): o discriminante não pode ser remontado à mão.
  return resposta;
}
