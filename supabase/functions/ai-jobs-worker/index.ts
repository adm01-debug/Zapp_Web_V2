/**
 * ai-jobs-worker — worker da fila DURÁVEL de jobs de IA (Bloco 05 / PR-3 · IA-045/IA-046).
 *
 * Por que existe: a migration 20261002371230 agenda (pg_cron, de minuto em minuto)
 * um `net.http_post` para `https://…/functions/v1/ai-jobs-worker`. Sem esta função
 * o agendador apontava para o vazio — fiação morta. Aqui está o destino do tick.
 *
 * AUTENTICAÇÃO — o MESMO padrão das demais cron-edges do projeto (`talkx-send`,
 * `multiplix-send`, `connection-health-check`, `batch-fetch-avatars`) e da migration
 * L5 `20260930240000_cron_secret_dedicado_l5`: o pg_cron manda `x-cron-secret` com o
 * segredo DEDICADO do job no Vault (`ai_jobs_cron_secret`), conferido em TEMPO
 * CONSTANTE contra a RPC SECURITY DEFINER que o lê (`get_ai_jobs_cron_secret`);
 * OU Bearer de usuário autenticado. A anon key NÃO autoriza (é pública). O guard é
 * compartilhado (`_shared/cron-secret-auth.ts`) e é FAIL-CLOSED: se a leitura do
 * Vault falhar, o header não autoriza nada → 401. Não há esquema de auth novo aqui.
 *
 * CICLO DO TICK (IA-045): claim com lease → heartbeat ANTES do trabalho →
 * handler do `kind` → heartbeat DEPOIS do trabalho → liquidação (`finish_ai_job`)
 * SOMENTE DEPOIS do efeito. O `lease_token` é o que deixa o processo reiniciar sem
 * perder trabalho nem liquidar um job que outro worker assumiu (fencing).
 *
 * REGISTRO DE HANDLERS explícito (`HANDLERS`). `kind` desconhecido NÃO inventa
 * execução: termina `failed` com `errorCode='UNKNOWN_KIND'` e o LOTE CONTINUA.
 *
 * ATENÇÃO — fiação pendente do PR: esta edge lê o segredo pela RPC
 * `get_ai_jobs_cron_secret()` (o mesmo formato de `get_multiplix_cron_secret`).
 * A migration deste PR cria o segredo no Vault, mas NÃO cria essa RPC — sem ela o
 * guard é fail-closed (401) e o tick nunca autoriza. Ver relatório da tarefa.
 *
 * Higiene: nenhum log carrega payload ou segredo; a resposta nunca leva a
 * service role nem o corpo do erro de infraestrutura.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { isAuthorizedCronOrUser, unauthorizedResponse } from "../_shared/cron-secret-auth.ts";
import { bootEdge, type EdgeInjected } from "../_shared/edge-boot.ts";
import { errorResponse, jsonResponse, requireEnv } from "../_shared/validation.ts";
import {
  AiJobInfraError,
  claimAiJobs,
  finishAiJob,
  heartbeatAiJob,
  reapAiJobs,
  type AiJob,
} from "../_shared/ai-jobs.ts";
import type { GenerateParams } from "../_shared/ai-generate.ts";
import { EffectReconcileError, handleEffectReconcile } from "../_shared/effect-reconcile.ts";

// ---------------------------------------------------------------------------
// Identidade e parâmetros do tick.
// ---------------------------------------------------------------------------

/** Id de worker ESTÁVEL, válido pela regex do servidor (`^[A-Za-z0-9._:@/-]{1,100}$`). */
export const WORKER_ID = "ai-jobs-worker";

/** Regex de `p_worker` replicada do servidor (e de `_shared/ai-jobs.ts`). */
const WORKER_PATTERN = /^[A-Za-z0-9._:@/-]{1,100}$/;

/** Jobs arrendados por tick. `claim_ai_jobs` limita a 100 no servidor. */
const CLAIM_LIMIT = 10;
/** Lease do claim (segundos), dentro da faixa 30..300 exigida pelo servidor. */
const CLAIM_LEASE_SECONDS = 60;
/** Renovação de lease antes/depois de cada job (30..300). */
const HEARTBEAT_LEASE_SECONDS = 120;

/**
 * Flag de ambiente que liga a chamada REAL de IA no handler `ai.generate`.
 * DESLIGADA por padrão: sem ela a edge não toca provedor nenhum.
 */
export const AI_GENERATE_FLAG = "AI_JOBS_ENABLE_AI_GENERATE";

/** `true` só com a flag explicitamente ligada — qualquer outro valor é "desligado". */
function isAiGenerateEnabled(): boolean {
  const raw = Deno.env.get(AI_GENERATE_FLAG);
  return raw === "1" || raw === "true";
}

// Invariante de módulo: o id do worker precisa ser aceito pela regex do servidor.
// Constante válida por construção; o guard evita que uma edição futura quebre o claim.
if (!WORKER_PATTERN.test(WORKER_ID)) {
  throw new Error(`ai-jobs-worker: WORKER_ID inválido: ${WORKER_ID}`);
}

// ---------------------------------------------------------------------------
// Contrato do registro de handlers.
// ---------------------------------------------------------------------------

/** Entrada de um handler: o job arrendado e a linha completa (kind/payload) relida. */
export interface AiJobHandlerInput {
  job: AiJob;
  kind: string;
  payload: Record<string, unknown>;
  /** `ai_jobs.function_name` — finalidade declarada pelo produtor do job. */
  functionName: string;
  userId: string | null;
}

/**
 * Desfecho NORMAL de um handler. Falhas são SINALIZADAS por exceção (ver abaixo),
 * de modo que sucesso/parcial não se confunde com erro.
 * `partial` NÃO é terminal na fila: é desfecho válido e o job pode continuar.
 */
export type AiJobHandlerResult =
  | { status: "succeeded"; result?: unknown }
  | { status: "partial"; result?: unknown };

/** Um handler faz o trabalho do `kind` e devolve o desfecho; erro = lançar. */
export type AiJobHandler = (input: AiJobHandlerInput) => Promise<AiJobHandlerResult>;

/**
 * Erro de HANDLER (falha do trabalho, não de infraestrutura): vira `failed` com
 * `errorCode = code`. Erros de infraestrutura (`AiJobInfraError`) NÃO passam por
 * aqui — sobem para a resposta 5xx, porque a culpa não é do job.
 */
export class AiJobHandlerError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "AiJobHandlerError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Handlers.
// ---------------------------------------------------------------------------

/**
 * `ai_jobs.reap_expired` — manutenção LOCAL da própria fila, sem custo externo:
 * recupera jobs com lease expirado via `reap_ai_jobs()` e devolve quantos voltaram.
 *
 * É um handler REAL e verificável (o efeito é o próprio RPC, observável no teste),
 * baseado em operação já definida pela IA-045 — não inventa regra de negócio. É
 * idempotente: reaproveitar um lease já vencido não muda nada se nada venceu.
 */
async function handleReapExpired(): Promise<AiJobHandlerResult> {
  const reaped = await reapAiJobs();
  return { status: "succeeded", result: { reaped } };
}

/**
 * `ai.generate` — handler REAL do kind de geração. DELEGA para o caminho de geração
 * que já existe (`_shared/ai-generate.ts` → `generateWithRouting`): não reimplementa
 * roteamento, provedor, orçamento nem auditoria.
 *
 * DESLIGADO por padrão (`AI_JOBS_ENABLE_AI_GENERATE`): com a flag ausente o handler
 * NÃO toca provedor nenhum — lança `AI_GENERATE_DISABLED`, que o worker converte em
 * `failed`. O import é DINÂMICO de propósito: enquanto a flag está desligada, a pilha
 * de geração nem é carregada.
 */
async function handleAiGenerate(input: AiJobHandlerInput): Promise<AiJobHandlerResult> {
  if (!isAiGenerateEnabled()) {
    throw new AiJobHandlerError("AI_GENERATE_DISABLED");
  }

  const purpose = typeof input.payload.purpose === "string" ? input.payload.purpose.trim() : "";
  if (purpose === "") {
    throw new AiJobHandlerError("AI_GENERATE_BAD_PAYLOAD", "payload.purpose ausente");
  }
  const messages = input.payload.messages;
  if (!Array.isArray(messages)) {
    throw new AiJobHandlerError("AI_GENERATE_BAD_PAYLOAD", "payload.messages nao e array");
  }

  const { generateWithRouting } = await import("../_shared/ai-generate.ts");
  const system = typeof input.payload.system === "string" ? input.payload.system : null;

  const gen = await generateWithRouting({
    purpose: purpose as GenerateParams["purpose"],
    functionName: input.functionName,
    userId: input.userId,
    // IA-051 — a execução nasceu na fila: o consumo fica ligado ao job e à
    // tentativa (`ai_usage_logs.job_id` / `.attempt`). É esta ligação que
    // permite reconciliar ação, tentativa e cobrança (IA-054) depois, sem
    // precisar do conteúdo da conversa para saber de onde veio o gasto.
    jobId: input.job.id,
    attempt: input.job.attemptCount,
    messages,
    system,
  });

  if (!gen.ok) {
    throw new AiJobHandlerError(gen.errorCode ?? "AI_GENERATE_ERROR");
  }
  return {
    status: "succeeded",
    result: { status: gen.status, model: gen.model, provider: gen.providerName },
  };
}

/** Registro EXPLÍCITO de handlers — nenhum `kind` executa fora daqui. */
export const HANDLERS: Readonly<Record<string, AiJobHandler>> = {
  "ai_jobs.reap_expired": handleReapExpired,
  "ai.generate": handleAiGenerate,
  // IA-047: confirmador de efeitos externos sem confirmação. SOMENTE-LEITURA no
  // provedor — nunca reenvia (ver `_shared/effect-reconcile.ts`).
  "effect.reconcile": handleEffectReconcile,
};

// ---------------------------------------------------------------------------
// Leitura da linha completa (kind/payload) dos jobs arrendados.
// ---------------------------------------------------------------------------

/** Colunas necessárias ao registro de handlers (o claim devolve só id/lease). */
interface AiJobRow {
  id: string;
  kind: string;
  function_name: string;
  user_id: string | null;
  payload: Record<string, unknown> | null;
}

/**
 * `claimAiJobs` devolve o contrato `AiJob` (id/status/tentativas/lease/prioridade),
 * SEM `kind`/`payload` — o registro precisa deles. Relê as linhas arrendadas por id.
 * Seguro: o claim já marcou `status='running'` e gravou o `lease_token`; enquanto o
 * lease é nosso, nenhum outro worker pega a linha e o conteúdo fica estável.
 * Falha de leitura é INFRAESTRUTURA → `AiJobInfraError` (o tick responde 5xx).
 */
async function loadJobRows(
  supabase: SupabaseClient,
  jobs: AiJob[],
): Promise<Map<string, AiJobRow>> {
  const ids = jobs.map((job) => job.id);
  const { data, error } = await supabase
    .from("ai_jobs")
    .select("id, kind, function_name, user_id, payload")
    .in("id", ids);
  if (error) {
    throw new AiJobInfraError(`ai-jobs-worker: leitura de ai_jobs falhou: ${error.message}`, error);
  }

  const byId = new Map<string, AiJobRow>();
  for (const row of (data ?? []) as AiJobRow[]) {
    byId.set(row.id, row);
  }
  return byId;
}

// ---------------------------------------------------------------------------
// Handler HTTP.
// ---------------------------------------------------------------------------

/** Contadores do tick, na forma exigida no corpo da resposta. */
interface TickCounts {
  succeeded: number;
  failed: number;
  partial: number;
}

/** Renova o lease do job; `false` = lease perdido (resultado, não exceção). */
function renewLease(job: AiJob, leaseToken: string): Promise<boolean> {
  return heartbeatAiJob({
    id: job.id,
    leaseToken,
    leaseSeconds: HEARTBEAT_LEASE_SECONDS,
  });
}

/** Executa um lote arrendado e devolve os contadores por desfecho. */
async function runBatch(
  supabase: SupabaseClient,
  claimed: AiJob[],
  log: { warn: (message: string, ctx?: Record<string, unknown>) => void },
): Promise<TickCounts> {
  const rows = await loadJobRows(supabase, claimed);
  const counts: TickCounts = { succeeded: 0, failed: 0, partial: 0 };

  for (const job of claimed) {
    const row = rows.get(job.id);
    const leaseToken = job.leaseToken;
    if (!row || !leaseToken) {
      // O claim arrendou a linha e devolveu o token; ausência é quebra de contrato.
      throw new AiJobInfraError(`ai-jobs-worker: job ${job.id} sem linha ou sem lease_token`);
    }

    // Heartbeat ANTES do trabalho: estende a janela para o handler inteiro.
    if (!(await renewLease(job, leaseToken))) {
      log.warn("ai-jobs-worker: lease perdido antes do handler", { jobId: job.id });
      continue; // lease perdido é resultado: o reaper/outro worker assume
    }

    const handler = HANDLERS[row.kind];
    if (!handler) {
      // NÃO inventa execução para kind desconhecido.
      await finishAiJob({ id: job.id, leaseToken, status: "failed", errorCode: "UNKNOWN_KIND" });
      counts.failed += 1;
      continue;
    }

    let outcome: AiJobHandlerResult;
    try {
      outcome = await handler({
        job,
        kind: row.kind,
        payload: row.payload ?? {},
        functionName: row.function_name,
        userId: row.user_id,
      });
    } catch (err) {
      if (err instanceof AiJobInfraError) throw err; // infra → 5xx (não é falha do job)
      const code = err instanceof AiJobHandlerError
        ? err.code
        // IA-047: o handler de reconciliação sinaliza o terminal `failed/UNCONFIRMED`
        // (e payload/efeito inválido) pelo próprio `code`, sem acoplar o worker ao módulo.
        : err instanceof EffectReconcileError
        ? err.code
        : "HANDLER_ERROR";
      // Heartbeat DEPOIS do trabalho (mesmo no erro), antes de liquidar. Se o lease
      // se foi, NÃO liquida: outro worker assumiu a linha.
      if (await renewLease(job, leaseToken)) {
        await finishAiJob({ id: job.id, leaseToken, status: "failed", errorCode: code });
      }
      counts.failed += 1;
      continue; // o LOTE CONTINUA no próximo job
    }

    // Heartbeat DEPOIS do trabalho e ANTES da liquidação (fencing do lease).
    if (!(await renewLease(job, leaseToken))) {
      log.warn("ai-jobs-worker: lease perdido apos o handler", { jobId: job.id });
      continue;
    }

    // Liquidação SÓ DEPOIS do efeito do handler.
    const applied = await finishAiJob({
      id: job.id,
      leaseToken,
      status: outcome.status,
      result: outcome.result ?? null,
      errorCode: null,
    });
    if (!applied) {
      log.warn("ai-jobs-worker: liquidacao recusada (lease perdido)", { jobId: job.id });
      continue;
    }
    if (outcome.status === "partial") counts.partial += 1;
    else counts.succeeded += 1;
  }

  return counts;
}

/**
 * Tick da fila de jobs de IA. Handler exportado (e injetável) para o teste de runtime.
 */
export async function handleAiJobsWorker(
  req: Request,
  _injected?: EdgeInjected<SupabaseClient>,
): Promise<Response> {
  // O `??` do boot é PREGUIÇOSO: com `_injected.supabase` o requireEnv nem roda.
  const { cors, log, headers, supabase, serviceKey } = bootEdge<SupabaseClient>(req, {
    fnName: "ai-jobs-worker",
    injected: _injected,
    makeClient: () => createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY")),
  });
  if (cors) return cors;

  try {
    // Credencial de máquina do cron (x-cron-secret do Vault) OU usuário autenticado.
    // O literal da RPC fica AQUI de propósito, para o guard de catálogo
    // (scripts/db-audit/supabase-usage-guard.mjs) validar o alvo.
    const authorized = await isAuthorizedCronOrUser(req, supabase, {
      serviceKey,
      readVaultSecret: async () => {
        const { data, error } = await supabase.rpc("get_ai_jobs_cron_secret");
        return !error && typeof data === "string" ? data : null;
      },
    });
    if (!authorized) return unauthorizedResponse(headers);

    const claimed = await claimAiJobs({
      worker: WORKER_ID,
      limit: CLAIM_LIMIT,
      leaseSeconds: CLAIM_LEASE_SECONDS,
    });

    if (claimed.length === 0) {
      log.done(200, { claimed: 0 });
      return jsonResponse(
        { success: true, claimed: 0, succeeded: 0, failed: 0, partial: 0 },
        200,
        req,
      );
    }

    const counts = await runBatch(supabase, claimed, log);

    log.done(200, { claimed: claimed.length, ...counts });
    return jsonResponse(
      {
        success: true,
        claimed: claimed.length,
        succeeded: counts.succeeded,
        failed: counts.failed,
        partial: counts.partial,
      },
      200,
      req,
    );
  } catch (err) {
    // Erro de INFRAESTRUTURA do banco: 5xx com o erro no log (nunca engolido, nunca
    // no corpo). A fila é trabalho ACEITO — falha de banco não pode virar "0 jobs".
    if (err instanceof AiJobInfraError) {
      log.error("ai-jobs-worker: falha de infraestrutura na fila", {
        error: err.message,
      });
      return errorResponse("ai_jobs_infra_failure", 503, req);
    }
    log.error("ai-jobs-worker: erro inesperado", {
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse("ai_jobs_worker_failure", 500, req);
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleAiJobsWorker(req));
}
