/**
 * Registro de negações de rate limit / política de rede em `public.rate_limit_logs`
 * (cartão t_6a08446c).
 *
 * Contexto: nenhuma Edge fazia INSERT em `rate_limit_logs`. As duas primitivas
 * compartilhadas que NEGAM — `resolve_network_policy` (403, via
 * `_shared/request-policy.ts`) e `consume_rate_limit`/contador local (429, via
 * `enforceRateLimit` em `_shared/validation.ts`) — negavam sem deixar rastro, e
 * o `RateLimitDashboard` lia sempre vazio. Este módulo é a fonte da linha.
 *
 * Regras fixas:
 * - A gravação é BEST-EFFORT: `recordRateLimitDenial` engole qualquer falha e só
 *   deixa um aviso no log, com o IP MASCARADO (nunca o IP completo). Nada aqui
 *   rejeita uma Promise para o chamador.
 * - O disparo é fire-and-forget (`scheduleRateLimitDenial`): não se espera o
 *   INSERT. Em runtime Supabase usa `EdgeRuntime.waitUntil` para o isolate não
 *   ser congelado antes da gravação; fora dele o `.catch` já basta.
 * - Só entram IP, endpoint (texto canônico), `request_count`, `blocked`, país e
 *   `user_agent` (truncado em 200). Nada de telefone, token ou texto de mensagem.
 * - O client é service_role — a única role que escreve em `rate_limit_logs`
 *   (bypassa RLS; não é preciso mexer na política de INSERT).
 */

/** Tamanho máximo do `user_agent` gravado (coluna é TEXT; corta o excesso). */
export const USER_AGENT_MAX_LENGTH = 200;

/** Tabela alvo. */
export const RATE_LIMIT_LOGS_TABLE = "rate_limit_logs";

/** O que o chamador sabe sobre a requisição negada. */
export interface RateLimitLogEntry {
  ip: string;
  endpoint: string;
  country?: string | null;
  userAgent?: string | null;
  /** Nº de requisições representado pela negação (default 1). */
  requestCount?: number;
  /** Sempre `true` nestes caminhos (a linha só nasce de uma negação). */
  blocked?: boolean;
}

/** Linha como a coluna do banco espera. */
export interface RateLimitLogRow {
  ip_address: string;
  endpoint: string;
  request_count: number;
  blocked: boolean;
  country?: string;
  user_agent?: string;
}

/** Trunca o `user_agent` em 200; vazio/ausente vira `null` (não grava a chave). */
export function truncateUserAgent(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > USER_AGENT_MAX_LENGTH
    ? trimmed.slice(0, USER_AGENT_MAX_LENGTH)
    : trimmed;
}

/**
 * Monta a linha de `rate_limit_logs`. Puro e testável.
 * `request_count` inválido (< 1 ou não-número) cai para 1; `blocked` default `true`.
 */
export function buildRateLimitLogRow(entry: RateLimitLogEntry): RateLimitLogRow {
  const count =
    typeof entry.requestCount === "number" && Number.isFinite(entry.requestCount) && entry.requestCount >= 1
      ? Math.floor(entry.requestCount)
      : 1;
  const row: RateLimitLogRow = {
    ip_address: entry.ip,
    endpoint: entry.endpoint,
    request_count: count,
    blocked: entry.blocked ?? true,
  };
  if (entry.country) row.country = entry.country;
  const userAgent = truncateUserAgent(entry.userAgent);
  if (userAgent) row.user_agent = userAgent;
  return row;
}

/**
 * IP mascarado para uso em log de erro. IPv4 perde o último octeto; IPv6 vira
 * `ipv6`; qualquer outra coisa vira `?`. Nunca devolve o IP completo.
 */
export function maskIpForLog(ip: string): string {
  if (!ip) return "?";
  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length === 4) {
      parts[3] = "x";
      return parts.join(".");
    }
  }
  if (ip.includes(":")) return "ipv6";
  return "?";
}

/** Forma estrutural do client (só o que o INSERT precisa). Suporta o service_role real e o mock. */
export interface RateLimitLogInsertResult {
  error?: unknown;
}
export interface RateLimitLogClient {
  from(table: string): {
    insert(row: RateLimitLogRow): PromiseLike<RateLimitLogInsertResult>;
  };
}
export type RateLimitLogClientFactory = () => PromiseLike<RateLimitLogClient>;

/** Um escritor de negociação: pode ser síncrono (teste) ou assíncrono (produção). */
export type RateLimitLogWriter = (entry: RateLimitLogEntry) => void | Promise<void>;

function warnInsertFailed(entry: RateLimitLogEntry, err: unknown): void {
  console.warn(JSON.stringify({
    level: "warn",
    source: "edge",
    msg: "rate_limit_log_insert_failed",
    // IP mascarado: o aviso nunca carrega o IP completo.
    ip: maskIpForLog(entry.ip),
    endpoint: entry.endpoint,
    err: err instanceof Error ? err.message : String(err),
  }));
}

/**
 * Executa o INSERT e NUNCA lança: erro retornado pelo PostgREST ou exceção do
 * client viram aviso de log (IP mascarado). É o núcleo testável de escritor.
 */
export async function insertRateLimitLog(
  client: RateLimitLogClient,
  entry: RateLimitLogEntry,
): Promise<void> {
  try {
    const { error } = await client.from(RATE_LIMIT_LOGS_TABLE).insert(buildRateLimitLogRow(entry));
    if (error) throw error;
  } catch (err) {
    warnInsertFailed(entry, err);
  }
}

let clientPromise: Promise<RateLimitLogClient> | null = null;

/** Descarta o client em cache — usado pelos testes para isolar cenários. Nunca chamado em prod. */
export function resetRateLimitLogClient(): void {
  clientPromise = null;
}

/** Client service_role para o INSERT (lazy + cacheado por isolate). */
function getRateLimitLogClient(): Promise<RateLimitLogClient> {
  if (!clientPromise) {
    clientPromise = import("https://esm.sh/@supabase/supabase-js@2.87.1")
      .then(({ createClient }) => {
        const url = Deno.env.get("SUPABASE_URL");
        const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (!url || !key) throw new Error("rate_limit_log: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");
        return createClient(url, key, { auth: { persistSession: false } }) as unknown as RateLimitLogClient;
      })
      .catch((err) => {
        clientPromise = null;
        throw err;
      });
  }
  return clientPromise;
}

/**
 * Escritor default: cria/usa o client service_role e delega ao `insertRateLimitLog`.
 * Best-effort por construção — não rejeita.
 */
export async function recordRateLimitDenial(entry: RateLimitLogEntry): Promise<void> {
  try {
    const client = await getRateLimitLogClient();
    await insertRateLimitLog(client, entry);
  } catch (err) {
    warnInsertFailed(entry, err);
  }
}

interface EdgeRuntimeLike {
  waitUntil?: (promise: Promise<unknown>) => void;
}

/**
 * Dispara a gravação SEM esperar a resposta (fire-and-forget). Se o escritor
 * lançar de forma síncrona, a exceção é engolida. Se devolver Promise, a
 * rejeição é capturada e, no runtime Supabase, a tarefa é agendada com
 * `EdgeRuntime.waitUntil` para sobreviver ao fim do handler.
 */
export function scheduleRateLimitDenial(writer: RateLimitLogWriter, entry: RateLimitLogEntry): void {
  let result: void | Promise<void>;
  try {
    result = writer(entry);
  } catch {
    return;
  }
  if (!result || typeof (result as Promise<void>).catch !== "function") return;
  const task = (result as Promise<void>).catch(() => {});
  const runtime = (globalThis as { EdgeRuntime?: EdgeRuntimeLike }).EdgeRuntime;
  if (runtime && typeof runtime.waitUntil === "function") {
    try {
      runtime.waitUntil(task);
      return;
    } catch {
      // segue para o catch já anexado
    }
  }
}
