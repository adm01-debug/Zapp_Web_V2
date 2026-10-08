/**
 * AI Provider call handlers — modular dispatchers for each provider type.
 *
 * IA-038: o `config` do provedor (coluna jsonb do painel) nunca é espalhado cru.
 * Ele entra sempre pelos filtros de ./ai-routing.ts, que removem as chaves
 * reservadas (model/messages/headers/...). Modelo, mensagens e cabeçalhos de
 * autenticação são decididos pelo servidor e não podem ser sobrescritos.
 *
 * IA-040: `callLovableAI`, `callOpenAICompatible` e `callCustomWebhook` aceitam
 * `options.timeoutMs` opcional (AbortController). Sem `timeoutMs` nada muda
 * para os consumidores atuais — nenhum timer é criado e nenhum `signal` novo
 * chega ao fetch. Com `timeoutMs`, o estouro vira AbortError (erro de
 * rede/abort reconhecível), nunca uma resposta de outro serviço.
 *
 * IA-TIMEOUT-001: o prazo cobre a requisição INTEIRA — headers E corpo. O
 * timer só desarma quando a leitura do corpo termina (fim, erro ou
 * cancelamento), porque desarmar na chegada dos headers deixava um corpo
 * travado pendurar a chamada para sempre.
 *
 * IA-041/IA-042: `classifyFailure` diz se a falha é transitória, permanente ou
 * de estado desconhecido, e `withRetry` só retenta a transitória (5xx, 408, 429,
 * AbortError/TypeError de fetch) com backoff exponencial de **jitter completo**
 * e um teto global de tentativas (`MAX_TOTAL_ATTEMPTS`) além do `maxRetries` por
 * chamada. Queda de rede não vira tempestade de requisições nem reenvio cego.
 */

import { filterConfigBody, filterExtraBody, filterHeaders } from "./ai-routing.ts";
import { secureRandomFloat } from "./secure-random.ts";

/**
 * IA-TIMEOUT-001 — prazo do provedor tem de cobrir a leitura do corpo.
 *
 * Embrulha o corpo da resposta para que `desarmar` (o clearTimeout do prazo)
 * só rode quando a leitura termina: no `done`, no erro ou no cancelamento.
 * Enquanto o corpo está sendo lido, o timer continua armado — e como o abort
 * do fetch derruba a leitura do corpo, um corpo travado estoura dentro do
 * orçamento em vez de pendurar a requisição.
 */
function comPrazoAteOCorpo(response: Response, desarmar: () => void): Response {
  const corpo = response.body;
  // Sem corpo (204/304) nada a ler: desarma já.
  if (corpo === null || response.status === 204 || response.status === 205 || response.status === 304) {
    desarmar();
    return response;
  }
  const leitor = corpo.getReader();
  const embrulhado = new ReadableStream<Uint8Array>({
    async pull(controlador) {
      try {
        const { done, value } = await leitor.read();
        if (done) { desarmar(); controlador.close(); return; }
        controlador.enqueue(value);
      } catch (erro) {
        desarmar();
        controlador.error(erro);
      }
    },
    async cancel(motivo) {
      desarmar();
      try { await leitor.cancel(motivo); } catch { /* já encerrado */ }
    },
  });
  return new Response(embrulhado, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export async function callLovableAI(params: {
  messages: Array<{ role: string; content: unknown }>;
  apiKey: string;
  model?: string;
  tools?: unknown;
  toolChoice?: unknown;
  stream?: boolean;
  /** Teto de tempo opcional da requisição (ms). Ausente = comportamento de hoje. */
  options?: { timeoutMs?: number };
}): Promise<Response> {
  const body: Record<string, unknown> = {
    model: params.model || 'google/gemini-3-flash-preview',
    messages: params.messages,
  };
  if (params.tools) body.tools = params.tools;
  if (params.toolChoice) body.tool_choice = params.toolChoice;
  if (params.stream) body.stream = true;

  // Só com `timeoutMs` existe timer/signal: sem ele a chamada é idêntica à de antes.
  const timeoutMs = params.options?.timeoutMs;
  const controller = new AbortController();
  const timer = typeof timeoutMs === 'number' && timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      ...(timer !== null ? { signal: controller.signal } : {}),
    });
    // Sem `timeoutMs` não há timer nem embrulho: a resposta vai como chegou.
    if (timer === null) return response;
    // O prazo NÃO é desarmado aqui: quem o desarma é o fim do corpo.
    return comPrazoAteOCorpo(response, () => { clearTimeout(timer); });
  } catch (erro) {
    if (timer !== null) clearTimeout(timer);
    throw erro;
  }
}

export async function callOpenAICompatible(params: {
  endpoint: string;
  apiKey: string;
  messages: Array<{ role: string; content: unknown }>;
  model?: string;
  tools?: unknown;
  toolChoice?: unknown;
  stream?: boolean;
  config?: Record<string, unknown>;
  /** Teto de tempo opcional da requisição (ms). Ausente = comportamento de hoje. */
  options?: { timeoutMs?: number };
}): Promise<Response> {
  const config = params.config ?? {};

  // Só as chaves de geração liberadas pelo filtro entram no corpo, e entram
  // ANTES dos campos do código: `model` e `messages` decididos pelo servidor
  // não podem ser sobrescritos pelo config do provedor.
  const body: Record<string, unknown> = {
    ...filterConfigBody(config),
    model: params.model || 'gpt-4o',
    messages: params.messages,
  };
  if (params.tools) body.tools = params.tools;
  if (params.toolChoice) body.tool_choice = params.toolChoice;
  if (params.stream) body.stream = true;

  // Cabeçalhos do config passam pela allowlist e entram primeiro; Authorization
  // e Content-Type são do código e vencem sempre (não são sobrescrevíveis).
  const headers: Record<string, string> = {
    ...filterHeaders(config.headers),
    Authorization: `Bearer ${params.apiKey}`,
    "Content-Type": "application/json",
  };

  // Mesma regra do lovable: sem `timeoutMs` nenhum timer/signal é criado.
  const timeoutMs = params.options?.timeoutMs;
  const controller = new AbortController();
  const timer = typeof timeoutMs === 'number' && timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const response = await fetch(params.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      ...(timer !== null ? { signal: controller.signal } : {}),
    });
    if (timer === null) return response;
    return comPrazoAteOCorpo(response, () => { clearTimeout(timer); });
  } catch (erro) {
    if (timer !== null) clearTimeout(timer);
    throw erro;
  }
}

export async function callCustomWebhook(params: {
  endpoint: string;
  apiKey?: string;
  messages: Array<{ role: string; content: unknown }>;
  config?: Record<string, unknown>;
  /** Teto de tempo opcional da requisição (ms). Ausente = comportamento de hoje. */
  options?: { timeoutMs?: number };
}): Promise<Response> {
  const config = params.config ?? {};

  // Mesma regra dos demais: config.headers só passa pela allowlist, e o
  // Content-Type do código é aplicado por último.
  const headers: Record<string, string> = {
    ...filterHeaders(config.headers),
    "Content-Type": "application/json",
  };
  if (params.apiKey) {
    const authScheme = (config.auth_scheme as string) || 'Bearer';
    // Authorization sempre do código, após o filtro: imutável pelo config.
    headers.Authorization = `${authScheme} ${params.apiKey}`;
  }

  // Mesma regra dos demais: sem `timeoutMs` nenhum timer/signal é criado.
  const timeoutMs = params.options?.timeoutMs;
  const controller = new AbortController();
  const timer = typeof timeoutMs === 'number' && timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const response = await fetch(params.endpoint, {
      method: "POST",
      headers,
      // extra_body filtrado entra primeiro e `messages` do código por último:
      // a configuração do webhook não pode reescrever as mensagens enviadas.
      body: JSON.stringify({
        ...filterExtraBody(config.extra_body),
        messages: params.messages,
      }),
      ...(timer !== null ? { signal: controller.signal } : {}),
    });
    if (timer === null) return response;
    return comPrazoAteOCorpo(response, () => { clearTimeout(timer); });
  } catch (erro) {
    if (timer !== null) clearTimeout(timer);
    throw erro;
  }
}

/**
 * Classe de falha de uma chamada de IA (IA-041).
 *
 * - `transient`     : vale retentar (5xx, 408, 429, rede/timeout) — pode ter sido
 *                     um soluço do provedor, sem efeito colateral conhecido;
 * - `permanent`     : retentar só repete o erro (4xx: 403/404/422...) e queima cota;
 * - `state_unknown` : não dá para saber se o pedido chegou a surtir efeito —
 *                     retentar reenviaria um efeito possivelmente não idempotente.
 */
export type AiFailureClass = 'transient' | 'permanent' | 'state_unknown';

/** Teto GLOBAL de tentativas por chamada (1 tentativa + retries). Constante do módulo. */
export const MAX_TOTAL_ATTEMPTS = 4;

/** Status HTTP que valem retentativa mesmo fora da faixa 5xx. */
const TRANSIENT_STATUSES: readonly number[] = [408, 429];

/** Erro de abort (timeout/cancelamento) em Deno e navegadores. */
function isAbortError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const candidate = err as { name?: unknown; code?: unknown };
  return candidate.name === 'AbortError' || candidate.code === 'ABORT_ERR';
}

/** Erro de transporte do `fetch` (DNS, conexão, TLS, redirecionamento). */
function isFetchTypeError(err: unknown): boolean {
  return err instanceof TypeError;
}

/**
 * Classifica a falha em transitória / permanente / estado desconhecido.
 *
 * `status` é o código HTTP quando a resposta chegou; ausente/"sem resposta"
 * (`null` ou `0`) quando a chamada morreu antes de responder — aí `err` diz o
 * porquê. Sucesso (2xx/3xx) não é falha: cai em `permanent`, ou seja,
 * "não retentável" — que é o uso em `withRetry`. Falha desconhecida (nem abort,
 * nem TypeError) é `state_unknown`: sem saber o que aconteceu, não se reenvia.
 */
export function classifyFailure(status: number | null, err?: unknown): AiFailureClass {
  // `status <= 0` significa "nenhuma resposta HTTP": `null` (o chamador não recebeu
  // código) ou `0` (resposta opaca/erro de transporte sem código — convenção já usada
  // pelos consumidores). Nesses casos quem decide é o `err`.
  if (typeof status === 'number' && Number.isFinite(status) && status > 0) {
    if (status >= 500 && status <= 599) return 'transient';
    if (TRANSIENT_STATUSES.includes(status)) return 'transient';
    // 2xx/3xx não é falha; 4xx é pedido inválido/sem permissão — repetir não resolve.
    return 'permanent';
  }

  // Sem resposta HTTP: só é retentável o que sabemos ser falha de transporte.
  if (isAbortError(err) || isFetchTypeError(err)) return 'transient';
  return 'state_unknown';
}

/**
 * Backoff exponencial COM "full jitter": atraso aleatório em [1, base * 2^attempt).
 * O jitter existe para que N clientes que caem no mesmo instante não voltem em
 * sincronia (tempestade de requisições); o piso de 1 ms garante que SEMPRE houve
 * backoff — zero ms seria indistinguível de "não esperou".
 */
function backoffDelayMs(baseDelayMs: number, attempt: number): number {
  const ceiling = Math.max(0, baseDelayMs) * Math.pow(2, Math.max(0, attempt));
  if (!Number.isFinite(ceiling) || ceiling <= 1) return ceiling > 0 ? 1 : 0;
  return Math.max(1, Math.floor(secureRandomFloat() * ceiling));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retenta uma função fetch-like com backoff exponencial + jitter.
 *
 * Regras (IA-041/IA-042):
 *  - só `transient` é retentado: 5xx, 408, 429 e AbortError/TypeError de `fetch`;
 *  - `permanent` (4xx) e `state_unknown` voltam na hora — sem reenvio cego;
 *  - `maxRetries` continua sendo o teto por chamada e `MAX_TOTAL_ATTEMPTS` é o
 *    teto GLOBAL de tentativas: nunca existe laço longo, mesmo com `maxRetries`
 *    absurdo vindo do chamador.
 * A resposta final — inclusive de erro HTTP — é devolvida como chegou (mesmo
 * contrato de antes); só erro de rede lançado esgota as tentativas com `throw`.
 */
export interface WithRetryOptions {
  /**
   * Orçamento TOTAL de tempo (ms) para a operação inteira, somando todas as
   * tentativas e esperas (IA-041: "prazo de execução total por capacidade").
   * Quando o próximo atraso não caberia no orçamento, a retentativa NÃO
   * acontece — assim um estouro de prazo nunca vira 3 ou 4 estouros em fila.
   * Sem `budgetMs`, o comportamento é exatamente o de antes.
   */
  budgetMs?: number;
}

export async function withRetry(
  fn: () => Promise<Response>,
  maxRetries = 2,
  baseDelayMs = 500,
  options?: WithRetryOptions,
): Promise<Response> {
  const requested = Number.isFinite(maxRetries) ? Math.floor(maxRetries) : 0;
  const retries = Math.max(0, Math.min(requested, MAX_TOTAL_ATTEMPTS - 1));
  const totalAttempts = retries + 1;
  const budgetMs = options?.budgetMs;
  const startedAt = Date.now();
  const semOrcamentoPara = (delayMs: number): boolean =>
    typeof budgetMs === 'number' && Number.isFinite(budgetMs) && budgetMs > 0
      ? Date.now() - startedAt + delayMs >= budgetMs
      : false;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    let response: Response;
    try {
      response = await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Rede/timeout ainda cabe retentativa; estado desconhecido não volta.
      if (classifyFailure(null, err) !== 'transient' || attempt === totalAttempts - 1) {
        throw lastError;
      }
      const delay = backoffDelayMs(baseDelayMs, attempt);
      if (semOrcamentoPara(delay)) throw lastError;
      await sleep(delay);
      continue;
    }

    // Não retentável (sucesso, 3xx, 4xx) ou estado desconhecido: devolve a resposta.
    if (classifyFailure(response.status) !== 'transient') return response;
    if (attempt === totalAttempts - 1) return response;

    // Consume body to prevent resource leak before retrying
    try { await response.text(); } catch { /* ignore */ }
    const delay = backoffDelayMs(baseDelayMs, attempt);
    if (semOrcamentoPara(delay)) return response;
    await sleep(delay);
  }

  throw lastError || new Error('All retries exhausted');
}
