/**
 * Filas de jobs de IA: enfileiramento durável, lease e máquina de estados
 * (Bloco 05 / PR-3 — IA-045/IA-046).
 *
 * Por que este módulo existe:
 *  - a IA pode levar minutos: um pedido aceito precisa SOBREVIVER ao isolate de
 *    edge function que morre no meio (IA-045). O job é a unidade durável; o
 *    `lease` (arrendamento) diz qual worker pode mexer nele agora;
 *  - o estado do job é um VOCABULÁRIO FECHADO (IA-046): sete valores, com
 *    transições permitidas explícitas. `partial` NÃO é concluído — é o job que
 *    produziu parte do resultado e PODE continuar.
 *
 * Regras não negociáveis garantidas aqui:
 *  1. NÃO FALHA ABERTO. Job é trabalho ACEITO: se o banco oscilar, quem chamou
 *     PRECISA saber. Erro de infraestrutura em enqueue/claim/reap/heartbeat/
 *     finish/cancel LANÇA `AiJobInfraError` (com `cause`), nunca é engolido.
 *     A ÚNICA exceção é o `false` devolvido pela RPC de `heartbeat_ai_job`/
 *     `finish_ai_job`/`cancel_ai_job`: isso é RESULTADO (lease perdido / job já
 *     fora de alcance), não falha de infraestrutura.
 *  2. TRANSIÇÕES FECHADAS (`AI_JOB_TRANSITIONS`). `canTransitionAiJob` recusa
 *     qualquer transição fora do mapa — inclusive qualquer SAÍDA de um estado
 *     terminal (succeeded/failed/cancelled/outcome_unknown não vão a lugar algum).
 *  3. IDEMPOTÊNCIA (IA-045). A `idempotencyKey` é a chave estável do job:
 *     repetir a mesma chave devolve o MESMO id, sem duplicar trabalho — quem
 *     garante isso é a RPC `enqueue_ai_job`; este módulo só passa a chave.
 *  4. Validação de PROGRAMAÇÃO (parâmetro malformado) lança `TypeError`, como
 *     `_shared/ai-budget.ts`. `worker` (regex do servidor) e `leaseSeconds`
 *     (30..300) são contrato do servidor replicado no cliente.
 *
 * Contrato (CONGELADO — consumido por outros módulos): os 7 estados, o mapa de
 * transições e os 6 wrappers `enqueueAiJob`/`claimAiJobs`/`heartbeatAiJob`/
 * `finishAiJob`/`reapAiJobs`/`cancelAiJob`, sobre as RPCs homônimas.
 *
 * Cliente/erro no padrão de `_shared/ai-usage.ts` e `_shared/ai-budget.ts`:
 * service role lido do ambiente (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`),
 * NUNCA um endereço/segredo fixo.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";

/** Prefixo do módulo nos logs (mesmo padrão de `[ai-budget]`/`[ai-usage]`). */
const LOG_PREFIX = "[ai-jobs]";

// ---------------------------------------------------------------------------
// Vocabulário de estados (IA-046) — CONGELADO, exatamente estes 7 valores.
// ---------------------------------------------------------------------------

/**
 * Os 7 estados possíveis de um `ai_job`, na ordem do contrato congelado.
 *
 *  - `queued`          — aceito, ainda não arrendado;
 *  - `running`         — um worker detém o lease e trabalha;
 *  - `partial`         — produziu parte do resultado e PODE continuar (NÃO é fim);
 *  - `succeeded`       — concluído com sucesso (terminal);
 *  - `failed`          — esgotou tentativas/erro definitivo (terminal);
 *  - `cancelled`       — cancelado por pedido explícito (terminal);
 *  - `outcome_unknown` — não se sabe se o efeito externo ocorreu (terminal).
 */
export const AI_JOB_STATUSES = [
  "queued",
  "running",
  "partial",
  "succeeded",
  "failed",
  "cancelled",
  "outcome_unknown",
] as const;

/** Estado de um job de IA. */
export type AiJobStatus = (typeof AI_JOB_STATUSES)[number];

/** Estados TERMINAIS: não aceitam mais NENHUMA transição. */
export const AI_JOB_TERMINAL_STATUSES = [
  "succeeded",
  "failed",
  "cancelled",
  "outcome_unknown",
] as const;

/**
 * Mapa de transições permitidas (CONGELADO).
 *
 *  - `queued`  → `running` | `cancelled`
 *  - `running` → `partial` | `succeeded` | `failed` | `cancelled` | `outcome_unknown`
 *  - `partial` → `running` | `succeeded` | `failed` | `cancelled` | `outcome_unknown`
 *  - terminais → (nada)
 *
 * `partial` NÃO é concluído: por isso ele ainda pode ir para `running` de novo.
 */
export const AI_JOB_TRANSITIONS: Record<AiJobStatus, readonly AiJobStatus[]> = {
  queued: ["running", "cancelled"],
  running: ["partial", "succeeded", "failed", "cancelled", "outcome_unknown"],
  partial: ["running", "succeeded", "failed", "cancelled", "outcome_unknown"],
  succeeded: [],
  failed: [],
  cancelled: [],
  outcome_unknown: [],
};

/** `true` quando `s` é um estado TERMINAL (não sai mais de lugar nenhum). */
export function isTerminalAiJobStatus(s: AiJobStatus): boolean {
  return (AI_JOB_TERMINAL_STATUSES as readonly string[]).includes(s);
}

/** `true` quando `value` é um dos 7 estados válidos (type guard de runtime). */
function isAiJobStatus(value: unknown): value is AiJobStatus {
  return typeof value === "string" && (AI_JOB_STATUSES as readonly string[]).includes(value);
}

/**
 * `true` se `from → to` é uma transição PERMITIDA do mapa congelado.
 *
 * Recusa: qualquer transição fora do mapa e QUALQUER saída de estado terminal
 * (a lista de um terminal é vazia). A entrada inválida em runtime devolve
 * `false` em vez de lançar — é consulta, não mutação.
 */
export function canTransitionAiJob(from: AiJobStatus, to: AiJobStatus): boolean {
  const allowed = AI_JOB_TRANSITIONS[from];
  if (!Array.isArray(allowed)) return false;
  return (allowed as readonly AiJobStatus[]).includes(to);
}

// ---------------------------------------------------------------------------
// Erro de infraestrutura (diferente de "lease perdido", que é resultado).
// ---------------------------------------------------------------------------

/**
 * Falha de INFRAESTRUTURA do subsistema de jobs (env ausente, erro da RPC, rede,
 * corpo inesperado). Carrega a causa original em `cause`.
 *
 * Importante: `heartbeatAiJob`/`finishAiJob`/`cancelAiJob` devolvendo `false`
 * NÃO é este erro — é resultado de negócio (lease perdido / job fora de alcance).
 */
export class AiJobInfraError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "AiJobInfraError";
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

// ---------------------------------------------------------------------------
// Limites/validações replicadas do servidor.
// ---------------------------------------------------------------------------

/** Regex de `worker` aceita pelo servidor: `^[A-Za-z0-9._:@/-]{1,100}$`. */
const WORKER_PATTERN = /^[A-Za-z0-9._:@/-]{1,100}$/;

/** Limites do arrendamento (segundos), iguais aos do servidor. */
const MIN_LEASE_SECONDS = 30;
const MAX_LEASE_SECONDS = 300;

/** Defaults do módulo (enviados EXPLICITAMENTE à RPC, sem depender do default do SQL). */
const DEFAULT_CLAIM_LIMIT = 10;
const DEFAULT_LEASE_SECONDS = 90;
const DEFAULT_MAX_ATTEMPTS = 8;
// Prioridade: MENOR valor e atendido ANTES (a fila ordena por priority ASC e o indice
// idx_ai_jobs_queued_priority e (priority, available_at)); 100 e o default da tabela.
const DEFAULT_PRIORITY = 100;
const MIN_PRIORITY = 0;
const MAX_PRIORITY = 1000;

// ---------------------------------------------------------------------------
// Parâmetros e resultado (contrato congelado).
// ---------------------------------------------------------------------------

/** Parâmetros de `enqueueAiJob`. */
export interface EnqueueAiJobParams {
  /** Chave de IDEMPOTÊNCIA estável: repetir devolve o MESMO id. Obrigatória e não vazia. */
  idempotencyKey: string;
  /** Tipo do job (ex.: `reply`, `summary`). Obrigatório e não vazio. */
  kind: string;
  /** Função de IA que executará o job (ex.: `ai-proxy`). Obrigatória e não vazia. */
  functionName: string;
  /** Usuário dono do job (uuid). `null`/ausente quando não houver usuário. */
  userId?: string | null;
  /** Payload do job (jsonb). Default `{}`. */
  payload?: Record<string, unknown>;
  /** Prioridade (integer 0..1000; MENOR = atendido ANTES). Default `100` (igual ao da tabela). */
  priority?: number;
  /** Quando o job fica elegível para claim. Default = agora. */
  availableAt?: Date | string;
  /** Quando o job expira (reaped/cancelado se não concluído). Default `null`. */
  expiresAt?: Date | string | null;
  /** Tentativas máximas antes de `failed`. Default `5`, mínimo `1`. */
  maxAttempts?: number;
}

/** Job arrendável, no formato consumido pelos workers (campos em camelCase). */
export interface AiJob {
  id: string;
  status: AiJobStatus;
  attemptCount: number;
  maxAttempts: number;
  leaseToken: string | null;
  priority: number;
}

// ---------------------------------------------------------------------------
// Helpers internos.
// ---------------------------------------------------------------------------

/** Mensagem de erro legível (nunca "undefined"). */
function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Registra e empacota um erro de infraestrutura (sempre lançado, nunca engolido). */
function infraError(fnName: string, stage: string, err: unknown): AiJobInfraError {
  const detail = errorText(err);
  console.error(`${LOG_PREFIX} ${fnName} falhou (${stage}): ${detail}`);
  return new AiJobInfraError(`${fnName}: falha de infraestrutura (${stage}): ${detail}`, err);
}

/** Resposta de forma inesperada (corpo inválido): também é infraestrutura. */
function badShapeError(fnName: string, detail: string): AiJobInfraError {
  console.error(`${LOG_PREFIX} ${fnName} devolveu corpo inválido: ${detail}`);
  return new AiJobInfraError(`${fnName}: resposta inválida da RPC — ${detail}`);
}

/** String obrigatória não vazia (falta/vazio é bug de quem chamou → TypeError). */
function requireNonEmptyString(value: unknown, label: string, fnName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${fnName}: "${label}" e obrigatorio e nao pode ser vazio.`);
  }
  return value;
}

/** Número finito obrigatório (tipo inválido é bug de quem chamou → TypeError). */
function requireFiniteNumber(value: unknown, label: string, fnName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${fnName}: "${label}" deve ser um numero finito.`);
  }
  return value;
}

/** Inteiro opcional ≥ `min`, com default. Fora da faixa → TypeError (programação). */
function optionalInt(value: unknown, label: string, fnName: string, fallback: number, min: number): number {
  if (value === undefined) return fallback;
  const n = requireFiniteNumber(value, label, fnName);
  const int = Math.trunc(n);
  if (int < min) {
    throw new TypeError(`${fnName}: "${label}" deve ser um inteiro >= ${min}.`);
  }
  return int;
}

/** `leaseSeconds` com default e faixa fechada [30, 300] → fora é TypeError. */
function requireLeaseSeconds(value: unknown, fnName: string): number {
  if (value === undefined) return DEFAULT_LEASE_SECONDS;
  const n = requireFiniteNumber(value, "leaseSeconds", fnName);
  const int = Math.trunc(n);
  if (int < MIN_LEASE_SECONDS || int > MAX_LEASE_SECONDS) {
    throw new TypeError(
      `${fnName}: "leaseSeconds" deve estar entre ${MIN_LEASE_SECONDS} e ${MAX_LEASE_SECONDS}.`,
    );
  }
  return int;
}

/** `Date`/`string` obrigatório → ISO-8601 (entrada inválida é bug → TypeError). */
function requireIsoString(value: unknown, label: string, fnName: string): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new TypeError(`${fnName}: "${label}" e uma Date invalida.`);
    }
    return value.toISOString();
  }
  if (typeof value === "string" && value.trim() !== "") {
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) {
      throw new TypeError(`${fnName}: "${label}" deve ser uma data ISO-8601 valida.`);
    }
    return new Date(ms).toISOString();
  }
  throw new TypeError(`${fnName}: "${label}" deve ser Date ou string ISO-8601.`);
}

/** Payload jsonb: objeto simples (array/null não é). Falha → TypeError. */
function normalizePayload(value: unknown, fnName: string): Record<string, unknown> {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${fnName}: "payload" deve ser um objeto.`);
  }
  return value as Record<string, unknown>;
}

/** Inteiro seguro para parâmetro `integer` da RPC (não-finito vira 0). */
function toSafeInt(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/**
 * Client de service role lido do ambiente (mesmo padrão de `_shared/ai-usage.ts`):
 * nenhum endereço/segredo fixo no código. Ausência de env é INFRAESTRUTURA → LANÇA.
 */
function requireServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const missing: string[] = [];
  if (!url) missing.push("SUPABASE_URL");
  if (!key) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new AiJobInfraError(`ambiente ausente: ${missing.join(", ")}`);
  }
  try {
    return createClient(url, key);
  } catch (err) {
    throw new AiJobInfraError(`falha ao criar cliente Supabase: ${errorText(err)}`, err);
  }
}

/** Mapeia uma linha de `ai_jobs` (snake_case) para `AiJob`. Corpo inválido → LANÇA. */
function toAiJob(row: unknown, fnName: string): AiJob {
  if (typeof row !== "object" || row === null || Array.isArray(row)) {
    throw badShapeError(fnName, "linha de ai_jobs nao e um objeto.");
  }
  const r = row as Record<string, unknown>;

  const id = r.id;
  if (typeof id !== "string" || id === "") {
    throw badShapeError(fnName, "ai_jobs.id ausente/invalido.");
  }
  const status = r.status;
  if (!isAiJobStatus(status)) {
    throw badShapeError(fnName, `ai_jobs.status desconhecido: ${String(status)}`);
  }
  const leaseRaw = r.lease_token ?? r.leaseToken ?? null;
  const leaseToken = typeof leaseRaw === "string" && leaseRaw !== "" ? leaseRaw : null;

  return {
    id,
    status,
    attemptCount: toSafeInt(r.attempt_count ?? r.attemptCount),
    maxAttempts: toSafeInt(r.max_attempts ?? r.maxAttempts),
    leaseToken,
    priority: toSafeInt(r.priority),
  };
}

/** Veredito booleano de uma RPC (`returns boolean`): corpo não-booleano → LANÇA. */
function requireBooleanResult(data: unknown, fnName: string): boolean {
  if (typeof data !== "boolean") {
    throw badShapeError(fnName, `esperado boolean, recebido ${data === null ? "null" : typeof data}.`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Wrappers das RPCs (IA-045/IA-046). Todos LANÇAM AiJobInfraError na infra.
// ---------------------------------------------------------------------------

/**
 * Enfileira um job de IA de forma DURÁVEL e IDEMPOTENTE (IA-045).
 *
 * A `idempotencyKey` é a chave estável: repetir a mesma chave devolve o MESMO id
 * (garantido pela RPC `enqueue_ai_job`), sem duplicar trabalho.
 *
 * Lança `TypeError` em parâmetro malformado (bug de programação) e
 * `AiJobInfraError` em qualquer falha de infraestrutura (NÃO falha aberto).
 */
export async function enqueueAiJob(p: EnqueueAiJobParams): Promise<string> {
  if (typeof p !== "object" || p === null) {
    throw new TypeError('enqueueAiJob: "params" e obrigatorio.');
  }

  const idempotencyKey = requireNonEmptyString(p.idempotencyKey, "idempotencyKey", "enqueueAiJob");
  const kind = requireNonEmptyString(p.kind, "kind", "enqueueAiJob");
  const functionName = requireNonEmptyString(p.functionName, "functionName", "enqueueAiJob");

  const userId = p.userId ?? null;
  if (userId !== null && typeof userId !== "string") {
    throw new TypeError('enqueueAiJob: "userId" deve ser string, null ou undefined.');
  }

  const payload = normalizePayload(p.payload, "enqueueAiJob");
  const priority = optionalInt(p.priority, "priority", "enqueueAiJob", DEFAULT_PRIORITY, MIN_PRIORITY);
  if (priority > MAX_PRIORITY) {
    // Erro de PROGRAMAÇÃO: a coluna tem check (priority between 0 and 1000) — falhar aqui,
    // com nome, em vez de deixar o banco recusar com erro genérico.
    throw new TypeError(
      `priority fora da faixa ${MIN_PRIORITY}..${MAX_PRIORITY} em enqueueAiJob: ${priority}`,
    );
  }
  const maxAttempts = optionalInt(p.maxAttempts, "maxAttempts", "enqueueAiJob", DEFAULT_MAX_ATTEMPTS, 1);
  const availableAt = p.availableAt === undefined
    ? new Date().toISOString()
    : requireIsoString(p.availableAt, "availableAt", "enqueueAiJob");
  const expiresAt = p.expiresAt === undefined || p.expiresAt === null
    ? null
    : requireIsoString(p.expiresAt, "expiresAt", "enqueueAiJob");

  const client = requireServiceClient();
  let data: unknown;
  try {
    const res = await client.rpc("enqueue_ai_job", {
      p_idempotency_key: idempotencyKey,
      p_kind: kind,
      p_function_name: functionName,
      p_user_id: userId,
      p_payload: payload,
      p_priority: priority,
      p_available_at: availableAt,
      p_expires_at: expiresAt,
      p_max_attempts: maxAttempts,
    });
    if (res.error) throw res.error;
    data = res.data;
  } catch (err) {
    throw infraError("enqueueAiJob", "rpc", err);
  }

  if (typeof data !== "string" || data.trim() === "") {
    throw badShapeError("enqueueAiJob", "esperado o id (uuid) do job.");
  }
  return data;
}

/**
 * Arrenda até `limit` jobs elegíveis para `worker`, por `leaseSeconds` (IA-045).
 *
 * `worker` é validado no cliente com a MESMA regex do servidor e `leaseSeconds`
 * (30..300) é limitado aqui também: erro de PROGRAMAÇÃO → `TypeError`.
 * Falha de infraestrutura → `AiJobInfraError`.
 */
export async function claimAiJobs(p: { worker: string; limit?: number; leaseSeconds?: number }): Promise<AiJob[]> {
  if (typeof p !== "object" || p === null) {
    throw new TypeError('claimAiJobs: "params" e obrigatorio.');
  }
  const worker = requireNonEmptyString(p.worker, "worker", "claimAiJobs");
  if (!WORKER_PATTERN.test(worker)) {
    throw new TypeError(
      'claimAiJobs: "worker" deve casar ^[A-Za-z0-9._:@/-]{1,100}$.',
    );
  }
  const limit = optionalInt(p.limit, "limit", "claimAiJobs", DEFAULT_CLAIM_LIMIT, 1);
  const leaseSeconds = requireLeaseSeconds(p.leaseSeconds, "claimAiJobs");

  const client = requireServiceClient();
  let data: unknown;
  try {
    const res = await client.rpc("claim_ai_jobs", {
      p_worker: worker,
      p_limit: limit,
      p_lease_seconds: leaseSeconds,
    });
    if (res.error) throw res.error;
    data = res.data;
  } catch (err) {
    throw infraError("claimAiJobs", "rpc", err);
  }

  if (!Array.isArray(data)) {
    throw badShapeError("claimAiJobs", "esperado setof ai_jobs (array).");
  }
  return data.map((row) => toAiJob(row, "claimAiJobs"));
}

/**
 * Renova o lease de um job (IA-045). Devolve `true` se renovado.
 *
 * `false` NÃO é exceção: significa LEASE PERDIDO (outro worker assumiu / expirou);
 * é RESULTADO. Falha de infraestrutura → `AiJobInfraError`.
 */
export async function heartbeatAiJob(p: { id: string; leaseToken: string; leaseSeconds?: number }): Promise<boolean> {
  if (typeof p !== "object" || p === null) {
    throw new TypeError('heartbeatAiJob: "params" e obrigatorio.');
  }
  const id = requireNonEmptyString(p.id, "id", "heartbeatAiJob");
  const leaseToken = requireNonEmptyString(p.leaseToken, "leaseToken", "heartbeatAiJob");
  const leaseSeconds = requireLeaseSeconds(p.leaseSeconds, "heartbeatAiJob");

  const client = requireServiceClient();
  let data: unknown;
  try {
    const res = await client.rpc("heartbeat_ai_job", {
      p_id: id,
      p_lease_token: leaseToken,
      p_lease_seconds: leaseSeconds,
    });
    if (res.error) throw res.error;
    data = res.data;
  } catch (err) {
    throw infraError("heartbeatAiJob", "rpc", err);
  }
  return requireBooleanResult(data, "heartbeatAiJob");
}

/**
 * Conclui (ou marca parcial) um job (IA-045/IA-046). Devolve `true` se aplicado.
 *
 * `false` NÃO é exceção: significa LEASE PERDIDO / job já fora de alcance — RESULTADO.
 * `partial` é um desfecho válido e NÃO é terminal. Falha de infraestrutura →
 * `AiJobInfraError`.
 */
export async function finishAiJob(p: {
  id: string;
  leaseToken: string;
  status: AiJobStatus;
  result?: unknown;
  errorCode?: string | null;
}): Promise<boolean> {
  if (typeof p !== "object" || p === null) {
    throw new TypeError('finishAiJob: "params" e obrigatorio.');
  }
  const id = requireNonEmptyString(p.id, "id", "finishAiJob");
  const leaseToken = requireNonEmptyString(p.leaseToken, "leaseToken", "finishAiJob");
  if (!isAiJobStatus(p.status)) {
    throw new TypeError(
      `finishAiJob: "status" deve ser um de ${AI_JOB_STATUSES.join(", ")}.`,
    );
  }
  const errorCode = p.errorCode ?? null;
  if (errorCode !== null && typeof errorCode !== "string") {
    throw new TypeError('finishAiJob: "errorCode" deve ser string, null ou undefined.');
  }

  const client = requireServiceClient();
  let data: unknown;
  try {
    const res = await client.rpc("finish_ai_job", {
      p_id: id,
      p_lease_token: leaseToken,
      p_status: p.status,
      p_result: p.result ?? null,
      p_error_code: errorCode,
    });
    if (res.error) throw res.error;
    data = res.data;
  } catch (err) {
    throw infraError("finishAiJob", "rpc", err);
  }
  return requireBooleanResult(data, "finishAiJob");
}

/**
 * Reaper: recupera jobs com lease expirado (IA-045). Devolve a quantidade reaped.
 *
 * Falha de infraestrutura → `AiJobInfraError` (NÃO devolve 0 silencioso, que
 * mascararia a falha — diferente do módulo de orçamento, de propósito).
 */
export async function reapAiJobs(): Promise<number> {
  const client = requireServiceClient();
  let data: unknown;
  try {
    const res = await client.rpc("reap_ai_jobs");
    if (res.error) throw res.error;
    data = res.data;
  } catch (err) {
    throw infraError("reapAiJobs", "rpc", err);
  }

  const n = typeof data === "number" ? data : typeof data === "string" ? Number(data) : Number.NaN;
  if (!Number.isFinite(n)) {
    throw badShapeError("reapAiJobs", "esperado um inteiro de jobs reaped.");
  }
  return Math.trunc(n);
}

/**
 * Cancela um job (IA-046). Devolve `true` se cancelado.
 *
 * `false` NÃO é exceção: job já terminal / inexistente — RESULTADO.
 * Falha de infraestrutura → `AiJobInfraError`.
 */
export async function cancelAiJob(p: { id: string; reason?: string }): Promise<boolean> {
  if (typeof p !== "object" || p === null) {
    throw new TypeError('cancelAiJob: "params" e obrigatorio.');
  }
  const id = requireNonEmptyString(p.id, "id", "cancelAiJob");

  let reason = "cancelled";
  if (p.reason !== undefined) {
    if (typeof p.reason !== "string") {
      throw new TypeError('cancelAiJob: "reason" deve ser string quando informado.');
    }
    if (p.reason.trim() !== "") reason = p.reason;
  }

  const client = requireServiceClient();
  let data: unknown;
  try {
    const res = await client.rpc("cancel_ai_job", {
      p_id: id,
      p_reason: reason,
    });
    if (res.error) throw res.error;
    data = res.data;
  } catch (err) {
    throw infraError("cancelAiJob", "rpc", err);
  }
  return requireBooleanResult(data, "cancelAiJob");
}
