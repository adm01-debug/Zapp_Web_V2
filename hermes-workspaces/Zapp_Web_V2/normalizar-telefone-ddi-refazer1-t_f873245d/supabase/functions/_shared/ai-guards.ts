/**
 * Shared guards for AI edge functions:
 *  - Per-user rate limit: cheap in-memory pre-check + AUTHORITATIVE shared counter
 *    (`ai_rate_limit_hit` RPC over `edge_rate_limits`, IA-043)
 *  - Daily quota check based on ai_usage_logs (per user × function)
 *
 * The in-memory limiter is per-isolate and resets on cold start, so it is NEVER
 * the source of truth: it only short-circuits bursts this isolate already saw and
 * spares an RPC round-trip. The authoritative verdict — per user, per organization
 * (when known), per service and per provider — comes from the atomic RPC whose
 * `INSERT ... ON CONFLICT (key) DO UPDATE` runs a single statement in Postgres.
 *
 * Returns a Response on rejection (401/429), or null when allowed.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { checkRateLimit, errorResponse, requireEnv } from "./validation.ts";
import { enforceAiCapability } from "./ai-feature-flags.ts";

/** Escopos do plano de IA-043. Cada escopo tem seu próprio contador compartilhado. */
export type AiRateLimitScope = "user" | "org" | "service" | "provider";

export interface AiGuardOptions {
  functionName: string;
  userId: string | null | undefined;
  /** Max requests per user per minute (in-memory pre-check). Default 30. */
  perUserPerMinute?: number;
  /** Max successful calls per user per 24h (DB-backed). Default 500. */
  dailyQuota?: number;
  /** Organização do usuário, quando a chamada a conhece (escopo compartilhado por org). */
  organizationId?: string | null;
  /** Identidade de serviço/worker interno (escopo compartilhado por serviço). */
  serviceId?: string | null;
  /** Provedor de IA alvo da chamada (escopo compartilhado por provedor). */
  provider?: string | null;
  /** Limite por janela do contador compartilhado. Default = perUserPerMinute. */
  sharedPerMinute?: number;
  /** Janela (segundos) do contador compartilhado. Default 60. */
  sharedWindowSeconds?: number;
  req: Request;
}

const DEFAULT_PER_USER_PER_MIN = 30;
const DEFAULT_DAILY_QUOTA = 500;
const DEFAULT_SHARED_WINDOW_SECONDS = 60;

/** Cliente de service_role memoizado por isolate (mesmo padrão de _shared/validation.ts). */
function createServiceClient() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}
let serviceClientPromise: Promise<ReturnType<typeof createServiceClient>> | null = null;
function getServiceClient(): Promise<ReturnType<typeof createServiceClient>> {
  if (!serviceClientPromise) {
    serviceClientPromise = Promise.resolve()
      .then(createServiceClient)
      .catch((err) => {
        serviceClientPromise = null;
        throw err;
      });
  }
  return serviceClientPromise;
}

/** Início determinístico da janela que contém `nowMs` (bucket de `windowSeconds`). */
function windowStart(nowMs: number, windowSeconds: number): Date {
  const bucketMs = Math.max(1, Math.floor(windowSeconds)) * 1000;
  return new Date(Math.floor(nowMs / bucketMs) * bucketMs);
}

/** Chave de escopo (sem a janela): `ai:<escopo>:<função>:<identificador>`. */
export function aiRateLimitScopeKey(
  scope: AiRateLimitScope,
  functionName: string,
  identity: string,
): string {
  return `ai:${scope}:${functionName}:${identity}`;
}

/**
 * Contador compartilhado e ATÔMICO para uma chave de escopo.
 *
 * Monta a chave final como `<key>:<ISO-do-início-da-janela>` (ex.:
 * `ai:user:ai-proxy:<userId>:2026-10-01T23:13:00.000Z`) e chama a RPC
 * `ai_rate_limit_hit`, cujo `INSERT ... ON CONFLICT (key) DO UPDATE` incrementa o
 * contador em UM único statement no Postgres. A atomicidade não depende de memória
 * local nem do isolate, então clientes distribuídos entre isolates compartilham o
 * mesmo contador (ao contrário do `checkRateLimit` em memória).
 *
 * Lança em erro de infraestrutura: o chamador decide o fallback (o guard de IA
 * falha aberto, como já faz hoje).
 */
export async function sharedRateLimit(opts: {
  key: string;
  limit: number;
  windowSeconds: number;
  now?: Date;
}): Promise<{ allowed: boolean; hits: number; limit: number }> {
  const { key, limit } = opts;
  const windowSeconds = opts.windowSeconds > 0
    ? Math.floor(opts.windowSeconds)
    : DEFAULT_SHARED_WINDOW_SECONDS;
  const start = windowStart((opts.now ?? new Date()).getTime(), windowSeconds);
  const windowedKey = `${key}:${start.toISOString()}`;

  const supabase = await getServiceClient();
  const { data, error } = await supabase.rpc("ai_rate_limit_hit", {
    p_key: windowedKey,
    p_window_start: start.toISOString(),
  });
  if (error) {
    throw new Error(`ai_rate_limit_hit failed: ${error.message ?? String(error)}`);
  }
  const hits = typeof data === "number" ? data : Number(data);
  if (!Number.isFinite(hits)) {
    throw new Error(`ai_rate_limit_hit returned a non-numeric hit count for ${windowedKey}`);
  }
  return { allowed: hits <= limit, hits, limit };
}

export interface AiRateLimitDecision {
  allowed: boolean;
  /** "shared" = veredito da RPC atômica; "local" = infra indisponível, decisão veio do pré-filtro em memória (fail-open). */
  source: "shared" | "local";
  hits: number;
  limit: number;
}

export interface AiRateLimitTarget {
  key: string;
  limit: number;
}

/** Escopos aplicáveis à chamada, sem inventar dado ausente (org/serviço/provedor só quando informados). */
export function aiRateLimitTargets(opts: AiGuardOptions, perMin: number): AiRateLimitTarget[] {
  const limit = opts.sharedPerMinute ?? perMin;
  const targets: AiRateLimitTarget[] = [];
  if (opts.userId) {
    targets.push({ key: aiRateLimitScopeKey("user", opts.functionName, opts.userId), limit });
  }
  if (opts.organizationId) {
    targets.push({ key: aiRateLimitScopeKey("org", opts.functionName, opts.organizationId), limit });
  }
  if (opts.serviceId) {
    targets.push({ key: aiRateLimitScopeKey("service", opts.functionName, opts.serviceId), limit });
  }
  if (opts.provider) {
    targets.push({ key: aiRateLimitScopeKey("provider", opts.functionName, opts.provider), limit });
  }
  return targets;
}

/**
 * Veredito autoritativo de rate limit para todos os escopos aplicáveis.
 *
 * Falha aberto quando a infraestrutura cai, mas o retorno registra que a decisão
 * veio do caminho local (`source: "local"`) — nunca da fonte de verdade.
 */
export async function checkSharedAiRateLimits(opts: {
  targets: AiRateLimitTarget[];
  windowSeconds?: number;
  now?: Date;
}): Promise<AiRateLimitDecision> {
  const windowSeconds = opts.windowSeconds && opts.windowSeconds > 0
    ? opts.windowSeconds
    : DEFAULT_SHARED_WINDOW_SECONDS;
  let last: { hits: number; limit: number } = { hits: 0, limit: 0 };
  try {
    for (const target of opts.targets) {
      const result = await sharedRateLimit({
        key: target.key,
        limit: target.limit,
        windowSeconds,
        now: opts.now,
      });
      last = { hits: result.hits, limit: result.limit };
      if (!result.allowed) {
        return { allowed: false, source: "shared", hits: result.hits, limit: result.limit };
      }
    }
    return { allowed: true, source: "shared", hits: last.hits, limit: last.limit };
  } catch (err) {
    console.warn(JSON.stringify({
      level: "warn",
      source: "edge",
      msg: "[ai-guards] contador de rate limit compartilhado indisponivel; decisao veio do pre-filtro local (fail-open)",
      error: err instanceof Error ? err.message : String(err),
    }));
    return { allowed: true, source: "local", hits: last.hits, limit: last.limit };
  }
}

export async function enforceAiGuards(opts: AiGuardOptions): Promise<Response | null> {
  const { functionName, userId, req } = opts;
  if (!userId) return errorResponse("Unauthenticated", 401, req);

  // 0) Kill switch por capacidade (IA-009). ANTES do pré-filtro, do contador
  //    compartilhado e da cota: capacidade desligada não reserva orçamento nem
  //    consome limite. Desliga SÓ o `enabled = false` booleano explícito; chave
  //    AUSENTE vale LIGADA (sem seed, ausência é "o operador não desligou"); erro
  //    de leitura ou valor não booleano FECHAM (fail-closed/503).
  const capability = await enforceAiCapability({ functionName, req });
  if (capability) return capability;

  const perMin = opts.perUserPerMinute ?? DEFAULT_PER_USER_PER_MIN;

  // 1) Cheap local pre-check (per-isolate). NOT the source of truth: it only
  //    rejects bursts this isolate already saw, sparing an RPC round-trip.
  const rl = checkRateLimit(`ai:user:${functionName}:${userId}`, perMin, 60_000);
  if (!rl.allowed) {
    return errorResponse(`Per-user rate limit exceeded (${perMin}/min)`, 429, req);
  }

  // 2) Authoritative shared/atomic limit (edge_rate_limits via ai_rate_limit_hit).
  //    Scoped per user, and per org/service/provider when the caller provides them.
  const decision = await checkSharedAiRateLimits({
    targets: aiRateLimitTargets(opts, perMin),
    windowSeconds: opts.sharedWindowSeconds,
  });
  if (!decision.allowed) {
    return errorResponse(`Per-user rate limit exceeded (${decision.limit}/min)`, 429, req);
  }

  // 3) Daily quota via ai_usage_logs (service role)
  const quota = opts.dailyQuota ?? DEFAULT_DAILY_QUOTA;
  try {
    const supabase = await getServiceClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from("ai_usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("function_name", functionName)
      .gte("created_at", since);
    if (error) {
      // Fail open on infra error (do not block users)
      return null;
    }
    if ((count ?? 0) >= quota) {
      return errorResponse(`Daily AI quota exceeded (${quota}/day)`, 429, req);
    }
  } catch (_e) {
    // Fail open
    return null;
  }
  return null;
}
