// errors.ts — classificação de erro do provedor + backoff com teto + texto para
// operador (F42 / E095).
//
// Regras de negócio que o unit test trava:
//   * opt-out e número inexistente são PERMANENTES — nunca reententam, mesmo que
//     o status HTTP pareça transitório (ex.: 5xx). É o "red-before" do plano.
//   * 429 / 5xx são TRANSIENTES — reententam com 30 s, 2 min e 10 min e param no
//     teto: na 4ª tentativa vão para dead letter (nunca cresce sem fim).
//   * resultado ilegível/desconhecido é UNKNOWN — não reenvia cego (um POST
//     repetido pode duplicar mensagem); vai para conferência manual, alinhado ao
//     `outcome_unknown` já usado pelas edges.
//
// A rede não entra aqui: a função é pura (status + corpo) e o "agora" é
// injetável (`nowMs`), para o teste ser determinístico.

import { isRecord } from "../evolution-helpers.ts";

export type ProviderErrorClass = "transient" | "permanent" | "unknown";

export interface ProviderErrorInfo {
  class: ProviderErrorClass;
  /** Código estável para `error_class`/log (não é o texto do provedor). */
  code: string;
  /** Texto para o operador (E095) — nunca JSON cru. */
  operatorMessage: string;
}

/**
 * Mapa código → texto para operador (E095/F61). O monitor e o historico do
 * disparo mostram estes textos, nunca o corpo bruto do provedor.
 */
export const OPERATOR_ERROR_MESSAGES: Record<string, string> = {
  opt_out:
    "O contato pediu para não receber mensagens (opt-out). Ele foi retirado desta fila e não receberá reenvio.",
  number_not_exists: "Número não existe no WhatsApp.",
  invalid_number: "Número inválido ou incompleto. Confira o DDD e o nono dígito.",
  rate_limited:
    "O WhatsApp limitou a velocidade de envio (429). O envio será tentado de novo automaticamente.",
  provider_timeout:
    "O WhatsApp não respondeu a tempo. O envio será tentado de novo automaticamente.",
  provider_unavailable:
    "O WhatsApp está indisponível no momento (erro do servidor). O envio será tentado de novo automaticamente.",
  auth_failed:
    "Credenciais da conexão WhatsApp recusadas (401/403). Reconecte a instância e tente de novo.",
  bad_request: "O provedor recusou o pedido (400). Verifique o conteúdo da mensagem e a mídia.",
  route_not_found:
    "A rota de envio não existe no provedor (404). Pode ser versão incompatível da conexão.",
  conflict: "O provedor recusou por conflito de estado (409).",
  unknown:
    "Falha ao enviar e o provedor não informou um motivo reconhecido. O item foi separado para conferência manual.",
};

/** Texto de operador para um código; código desconhecido cai no genérico. */
export function operatorMessageFor(code: string): string {
  return OPERATOR_ERROR_MESSAGES[code] ?? OPERATOR_ERROR_MESSAGES.unknown;
}

// Sinais permanentes preferem casar ANTES do status — um 5xx com corpo de
// opt-out/número inexistente continua permanente (não reententa).
const PERMANENT_CUES: ReadonlyArray<{ cue: string; code: string }> = [
  // opt-out / contato bloqueou
  { cue: "opt-out", code: "opt_out" },
  { cue: "opt out", code: "opt_out" },
  { cue: "opted out", code: "opt_out" },
  { cue: "optout", code: "opt_out" },
  { cue: "unsubscribe", code: "opt_out" },
  { cue: "descadastr", code: "opt_out" },
  { cue: "não deseja receber", code: "opt_out" },
  { cue: "nao deseja receber", code: "opt_out" },
  { cue: "blocked by", code: "opt_out" },
  { cue: "blocked you", code: "opt_out" },
  { cue: "recipient blocked", code: "opt_out" },
  { cue: "is blocked", code: "opt_out" },
  { cue: "you are blocked", code: "opt_out" },
  { cue: "you have been blocked", code: "opt_out" },
  { cue: "blocked this", code: "opt_out" },
  { cue: "blocklist", code: "opt_out" },
  { cue: "block list", code: "opt_out" },
  { cue: "blacklist", code: "opt_out" },
  { cue: "lista negra", code: "opt_out" },
  // número inexistente
  { cue: "not registered", code: "number_not_exists" },
  { cue: "not on whatsapp", code: "number_not_exists" },
  { cue: "isn't on whatsapp", code: "number_not_exists" },
  { cue: "is not a whatsapp", code: "number_not_exists" },
  { cue: "não está no whatsapp", code: "number_not_exists" },
  { cue: "nao esta no whatsapp", code: "number_not_exists" },
  { cue: "doesn't exist", code: "number_not_exists" },
  { cue: "does not exist", code: "number_not_exists" },
  { cue: "not exist", code: "number_not_exists" },
  { cue: "no such user", code: "number_not_exists" },
  { cue: "user not found", code: "number_not_exists" },
  { cue: "contact not found", code: "number_not_exists" },
  { cue: "número não existe", code: "number_not_exists" },
  { cue: "numero nao existe", code: "number_not_exists" },
  { cue: "número inexistente", code: "number_not_exists" },
  // número inválido
  { cue: "invalid number", code: "invalid_number" },
  { cue: "invalid phone", code: "invalid_number" },
  { cue: "invalid jid", code: "invalid_number" },
  { cue: "número inválido", code: "invalid_number" },
  { cue: "numero invalido", code: "invalid_number" },
];

const TRANSIENT_CUES: ReadonlyArray<{ cue: string; code: string }> = [
  { cue: "rate limit", code: "rate_limited" },
  { cue: "too many requests", code: "rate_limited" },
  { cue: "timeout", code: "provider_timeout" },
  { cue: "timed out", code: "provider_timeout" },
  { cue: "deadline exceeded", code: "provider_timeout" },
  { cue: "econnreset", code: "provider_timeout" },
  { cue: "connection reset", code: "provider_timeout" },
  { cue: "socket hang up", code: "provider_timeout" },
  { cue: "temporarily unavailable", code: "provider_unavailable" },
  { cue: "temporarily blocked", code: "provider_unavailable" },
  { cue: "temporary ban", code: "provider_unavailable" },
  { cue: "temporaryban", code: "provider_unavailable" },
  { cue: "service unavailable", code: "provider_unavailable" },
  { cue: "bad gateway", code: "provider_unavailable" },
  { cue: "gateway timeout", code: "provider_unavailable" },
  { cue: "internal server error", code: "provider_unavailable" },
  { cue: "try again", code: "provider_unavailable" },
];

const PERMANENT_4XX_CODES: Record<number, string> = {
  400: "bad_request",
  401: "auth_failed",
  403: "auth_failed",
  404: "route_not_found",
  405: "bad_request",
  409: "conflict",
  410: "bad_request",
  413: "bad_request",
  415: "bad_request",
  422: "bad_request",
};

function bodyText(body: unknown): string {
  if (typeof body === "string") return body.toLowerCase();
  if (body === null || body === undefined) return "";
  try {
    const serialized = isRecord(body) || Array.isArray(body) ? JSON.stringify(body) : String(body);
    return (serialized ?? "").toLowerCase();
  } catch {
    // Corpo ilegível (referência circular, BigInt, …): nenhum sinal extraível.
    return "";
  }
}

// /user/check: {exists:false} (normalizado) ou {data:{Users:[{IsInWhatsapp:false}]}} (cru).
function hasNumberNotExists(body: unknown): boolean {
  if (!isRecord(body)) return false;
  if (body.exists === false) return true;
  const data = isRecord(body.data) ? body.data : undefined;
  if (data?.exists === false) return true;
  const usersRaw = Array.isArray(body.Users) ? body.Users : Array.isArray(data?.Users) ? data.Users : undefined;
  if (usersRaw && usersRaw.length > 0) {
    return usersRaw.every(
      (u) => isRecord(u) && (u.IsInWhatsapp === false || u.exists === false),
    );
  }
  return false;
}

function info(cls: ProviderErrorClass, code: string): ProviderErrorInfo {
  return { class: cls, code, operatorMessage: operatorMessageFor(code) };
}

/**
 * Classifica a resposta de erro do provedor. `body` pode ser o JSON já parseado
 * ou o texto cru; corpo ilegível não inventa classe.
 */
export function providerErrorInfo(status: number, body: unknown): ProviderErrorInfo {
  const text = bodyText(body);

  // 1. Sinais permanentes (precedem o status).
  for (const { cue, code } of PERMANENT_CUES) {
    if (text.includes(cue)) return info("permanent", code);
  }
  if (hasNumberNotExists(body)) return info("permanent", "number_not_exists");

  // 2. Transitórios por status.
  if (status === 429) return info("transient", "rate_limited");
  if (status === 408 || status === 425) return info("transient", "provider_timeout");
  if (status >= 500 && status <= 599) return info("transient", "provider_unavailable");

  // 3. Transitórios por sinal textual (ex.: falha de rede sem status HTTP).
  for (const { cue, code } of TRANSIENT_CUES) {
    if (text.includes(cue)) return info("transient", code);
  }

  // 4. Permanentes por status (erro do cliente: não adianta repetir).
  if (status >= 400 && status <= 499) {
    return info("permanent", PERMANENT_4XX_CODES[status] ?? "bad_request");
  }

  // 5. Sem sinal reconhecido.
  return info("unknown", "unknown");
}

/** Só a classe — exatamente `transient | permanent | unknown`. */
export function classifyProviderError(status: number, body: unknown): ProviderErrorClass {
  return providerErrorInfo(status, body).class;
}

/** Texto de operador direto do par (status, corpo). */
export function operatorMessageForError(status: number, body: unknown): string {
  return providerErrorInfo(status, body).operatorMessage;
}

/** Teto de backoff em ms: 30 s, 2 min, 10 min. Nunca cresce além disto. */
export const BACKOFF_CEILING_MS: readonly number[] = [30_000, 120_000, 600_000];
/** Quantas tentativas antes de dead letter (a 4ª falha aposenta o item). */
export const MAX_ATTEMPTS = 4;

export interface BackoffDecision {
  action: "retry" | "dead_letter";
  /** Tentativa que acabou de falhar (1-based). */
  attempt: number;
  /** Espera até o próximo retry (0 em dead letter). */
  delayMs: number;
  /** ISO do próximo retry (só em `retry`). */
  retryAfter?: string;
  reason: string;
}

/**
 * Backoff exponencial com teto. `attempt` é a tentativa que falhou (1-based):
 * 1→30 s, 2→2 min, 3→10 min, 4→dead letter (e continua morto daí em diante).
 */
export function nextBackoff(attempt: number, nowMs: number = Date.now()): BackoffDecision {
  const a = Number.isFinite(attempt) ? Math.max(1, Math.floor(attempt)) : 1;
  if (a >= MAX_ATTEMPTS) {
    return {
      action: "dead_letter",
      attempt: a,
      delayMs: 0,
      reason: `tentativa ${a} de ${MAX_ATTEMPTS}: esgotada (dead letter)`,
    };
  }
  const delayMs = BACKOFF_CEILING_MS[Math.min(a - 1, BACKOFF_CEILING_MS.length - 1)];
  return {
    action: "retry",
    attempt: a,
    delayMs,
    retryAfter: new Date(nowMs + delayMs).toISOString(),
    reason: `tentativa ${a}: retry em ${delayMs}ms`,
  };
}

/**
 * Decide o que fazer com uma falha do provedor já classificada:
 *   permanent → dead letter imediato (opt-out e número inexistente NUNCA reententam);
 *   unknown   → dead letter (não reenvia cego; exige conferência);
 *   transient → backoff com teto, dead letter na 4ª.
 */
export function planRetry(
  info: ProviderErrorInfo,
  attempt: number,
  nowMs: number = Date.now(),
): BackoffDecision {
  const a = Number.isFinite(attempt) ? Math.max(1, Math.floor(attempt)) : 1;
  if (info.class === "permanent") {
    return {
      action: "dead_letter",
      attempt: a,
      delayMs: 0,
      reason: `${info.code}: falha permanente, nunca reenvia`,
    };
  }
  if (info.class === "unknown") {
    return {
      action: "dead_letter",
      attempt: a,
      delayMs: 0,
      reason: `${info.code}: resultado desconhecido, exige conferência manual`,
    };
  }
  return nextBackoff(a, nowMs);
}
