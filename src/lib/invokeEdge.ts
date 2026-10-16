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
    log.withCorrelation(correlationId).error(`Edge ${functionName} falhou`, {
      status: statusOf(resposta.error),
      tipo: resposta.error.name,
    });
  }

  // Devolve a união do próprio invoke (sucesso com `error: null` / falha com
  // `data: null`): o discriminante não pode ser remontado à mão.
  return resposta;
}
