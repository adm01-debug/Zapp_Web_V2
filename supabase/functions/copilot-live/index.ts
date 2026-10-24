/**
 * copilot-live — motor de análise incremental do RADAR (CV-021–030).
 *
 * Consome jobs do kind `copilot_tick` enfileirados pelo trigger
 * `enqueue_copilot_tick_on_contact_message` (migration CV-014/015).
 *
 * ARQUITETURA (dois andares — CV-024):
 *  - Andar 1 (rápido/barato): estado incremental + detector de momento-chave.
 *    Purpose `analysis` → modelo pequeno (claude-haiku ou equivalente).
 *  - Andar 2 (forte/custoso): sugestão de próximo passo em momento-chave APENAS.
 *    Purpose `copilot` → modelo forte; ativado só quando `isKeyMoment` = true.
 *
 * CICLO DO TICK (mesmo padrão de ai-jobs-worker — CV-021):
 *   claim → heartbeat ANTES → [flag gate] → [circuito] → [orçamento] →
 *   andar-1 → gravar insight → andar-2 se necessário → heartbeat DEPOIS →
 *   finish (sucesso/falha com retentativa).
 *
 * ESTADO INCREMENTAL (CV-022):
 *   Recebe o último `copilot_sessions` + apenas as mensagens novas (a partir
 *   do cursor `last_contact_message_at`). Nunca reenvia o histórico completo.
 *
 * OBSERVABILIDADE (CV-030):
 *   Log estruturado por etapa com latência, SEM conteúdo de mensagens.
 *
 * AUTENTICAÇÃO: mesmo padrão das demais cron-edges (`x-cron-secret` ou Bearer).
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { isAuthorizedCronOrUser, unauthorizedResponse } from "../_shared/cron-secret-auth.ts";
import { bootEdge, type EdgeInjected } from "../_shared/edge-boot.ts";
import { jsonResponse, requireEnv } from "../_shared/validation.ts";
import {
  AiJobInfraError,
  claimAiJobs,
  finishAiJob,
  heartbeatAiJob,
  type AiJob,
} from "../_shared/ai-jobs.ts";
import { enforceAiCapability } from "../_shared/ai-feature-flags.ts";
import { reserveBudget, settleBudget, releaseBudget } from "../_shared/ai-budget.ts";
import { admitAiProviderCall } from "../_shared/ai-circuit.ts";
import { generateWithRouting } from "../_shared/ai-generate.ts";
import {
  CopilotLiveOutputSchema,
  parseModelOutput,
  buildAiEnvelope,
  KEY_MOMENT_TYPES,
  type CopilotLiveOutput,
} from "../_shared/ai-response-contracts.ts";

// ---------------------------------------------------------------------------
// Constantes do worker.
// ---------------------------------------------------------------------------

export const WORKER_ID = "copilot-live";
const CLAIM_LIMIT = 5;
const CLAIM_LEASE_SECONDS = 60;
const HEARTBEAT_LEASE_SECONDS = 90;

/** Limite de tokens do contexto por tick (CV-028). Prioridade: rajada > estado > memória > KB. */
const CONTEXT_TOKEN_BUDGET = 4_000;
/** Orçamento de tokens do provedor por tick. */
const PROVIDER_TOKEN_BUDGET = 800;
/** Estimativa de tokens por tick (orienta reserva; não é faturamento). */
const ESTIMATED_TOKENS = 600;
/** Máximo de mensagens novas enviadas ao modelo por tick. */
const MAX_NEW_MESSAGES = 20;
/** Mínimo de mensagens de histórico recente para contexto de estado. */
const MAX_CONTEXT_MESSAGES = 5;

// ---------------------------------------------------------------------------
// Payload do job copilot_tick.
// ---------------------------------------------------------------------------

export interface CopilotTickPayload {
  contact_id: string;
  session_id: string;
  whatsapp_connection_id: string;
  profile_id: string;
}

function isCopilotTickPayload(p: unknown): p is CopilotTickPayload {
  if (typeof p !== "object" || p === null) return false;
  const obj = p as Record<string, unknown>;
  return (
    typeof obj.contact_id === "string" &&
    typeof obj.session_id === "string" &&
    typeof obj.whatsapp_connection_id === "string" &&
    typeof obj.profile_id === "string"
  );
}

// ---------------------------------------------------------------------------
// CV-025 — Detector de momento-chave.
// ---------------------------------------------------------------------------

/** Regras de detecção de momento-chave por padrão regex/keywords. */
const KEY_MOMENT_RULES: Array<{
  type: (typeof KEY_MOMENT_TYPES)[number];
  patterns: RegExp[];
}> = [
  {
    type: "price_request",
    patterns: [/quanto\s+(custa|fica|é|sai)/i, /qual\s+o\s+pre[çc]o/i, /valor\s+(do|de|por)/i, /or[çc]amento/i],
  },
  {
    type: "objection",
    patterns: [/muito\s+caro/i, /est[áa]\s+acima/i, /n[ãa]o\s+tenho\s+verba/i, /sem\s+budget/i, /outro\s+fornecedor/i],
  },
  {
    type: "buy_signal",
    patterns: [/vou\s+(fechar|comprar|pedir)/i, /quero\s+(fechar|confirmar|pedir)/i, /pode\s+enviar\s+a\s+nf/i, /fecha(mos|r)\s+neg[óo]cio/i],
  },
  {
    type: "competitor_mention",
    patterns: [/concorrente/i, /outra\s+empresa/i, /outro\s+fornecedor/i, /j[áa]\s+pesquisei/i],
  },
  {
    type: "unanswered_question",
    patterns: [/\?/],
  },
  {
    type: "deadline_request",
    patterns: [/prazo\s+(de\s+)?entrega/i, /quando\s+chega/i, /preciso\s+para\s+(dia|semana|m[êe]s)/i, /urgente/i],
  },
  {
    type: "logo_sent",
    patterns: [/logo/i, /arte/i, /arquivo/i],
  },
];

/**
 * Detecta momentos-chave nas mensagens recentes.
 * Retorna os tipos únicos detectados.
 */
export function detectKeyMoments(messages: Array<{ body: string; from_me: boolean }>): Array<(typeof KEY_MOMENT_TYPES)[number]> {
  const detected = new Set<(typeof KEY_MOMENT_TYPES)[number]>();
  for (const msg of messages) {
    if (msg.from_me) continue; // só mensagens do contato
    for (const rule of KEY_MOMENT_RULES) {
      if (rule.patterns.some((re) => re.test(msg.body ?? ""))) {
        detected.add(rule.type);
      }
    }
  }
  // sentiment_shift: detectado pelo modelo, não por regex
  return Array.from(detected);
}

// ---------------------------------------------------------------------------
// CV-024 — Decisão de andar (roteamento dois andares).
// ---------------------------------------------------------------------------

/** true quando o tick deve subir ao andar 2 (modelo forte). */
export function shouldUseTier2(keyMoments: string[]): boolean {
  const tier2Triggers = new Set<string>(["price_request", "objection", "buy_signal", "competitor_mention"]);
  return keyMoments.some((m) => tier2Triggers.has(m));
}

// ---------------------------------------------------------------------------
// CV-022 — Busca incremental de estado + mensagens novas.
// ---------------------------------------------------------------------------

interface SessionState {
  session_id: string;
  stage: string;
  brinde_state: Record<string, unknown>;
  temperature: number;
  state_version: number;
  last_contact_message_at: string | null;
}

interface NewMessage {
  id: string;
  body: string;
  from_me: boolean;
  created_at: string;
}

async function fetchIncrementalState(
  supabase: SupabaseClient,
  payload: CopilotTickPayload,
): Promise<{ session: SessionState; newMessages: NewMessage[]; contextMessages: NewMessage[] } | null> {
  // Busca sessão atual
  const { data: session, error: sessErr } = await supabase
    .from("copilot_sessions")
    .select("id, stage, brinde_state, temperature, state_version, last_contact_message_at")
    .eq("id", payload.session_id)
    .single();

  if (sessErr || !session) return null;

  const cursor = session.last_contact_message_at;

  // Mensagens NOVAS (após o cursor)
  const newQuery = supabase
    .from("messages")
    .select("id, body, from_me, created_at")
    .eq("contact_id", payload.contact_id)
    .order("created_at", { ascending: true })
    .limit(MAX_NEW_MESSAGES);

  if (cursor) newQuery.gt("created_at", cursor);

  const { data: newMessages, error: msgErr } = await newQuery;
  if (msgErr) return null;

  // Contexto recente (mensagens antes do cursor para o modelo ter ancoragem)
  const ctxQuery = supabase
    .from("messages")
    .select("id, body, from_me, created_at")
    .eq("contact_id", payload.contact_id)
    .order("created_at", { ascending: false })
    .limit(MAX_CONTEXT_MESSAGES);

  if (cursor) ctxQuery.lte("created_at", cursor);

  const { data: ctxMessages } = await ctxQuery;

  return {
    session: { ...session, session_id: session.id },
    newMessages: newMessages ?? [],
    contextMessages: (ctxMessages ?? []).reverse(),
  };
}

// ---------------------------------------------------------------------------
// CV-030 — Log estruturado por etapa.
// ---------------------------------------------------------------------------

function logStage(stage: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({
    level: "info",
    source: "edge",
    function: "copilot-live",
    stage,
    ...data,
    ts: new Date().toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Gravar insight no banco.
// ---------------------------------------------------------------------------

async function upsertCopilotInsight(
  supabase: SupabaseClient,
  sessionId: string,
  output: CopilotLiveOutput,
  tier: 1 | 2,
  durationMs: number,
): Promise<void> {
  await supabase.from("copilot_insights").insert({
    session_id: sessionId,
    insight_type: tier === 2 ? "key_moment_suggestion" : "state_update",
    payload: { ...output, _tier: tier, _duration_ms: durationMs },
  });
}

async function updateSessionState(
  supabase: SupabaseClient,
  payload: CopilotTickPayload,
  output: CopilotLiveOutput,
  lastMessageAt: string | null,
  currentVersion: number,
): Promise<void> {
  const patch: Record<string, unknown> = { state_version: currentVersion + 1 };
  if (output.stage) patch.stage = output.stage;
  if (output.temperature !== undefined) patch.temperature = output.temperature;
  // Fase 4 (CV-031–040): persistir campos de inteligência B·R·I·N·D·E
  if (output.brinde_evidence) patch.brinde_evidence = output.brinde_evidence;
  if (output.comm_style) patch.comm_style = output.comm_style;
  if (output.decision_role) patch.decision_role = output.decision_role;
  if (output.occasion) patch.occasion = output.occasion;
  if (output.stakeholders) patch.stakeholders = output.stakeholders;
  if (lastMessageAt) patch.last_contact_message_at = lastMessageAt;

  if (output.brinde_delta) {
    // Merge atômico do delta B·R·I·N·D·E via RPC (otimistic lock)
    await supabase.rpc("merge_brinde_state", {
      p_session_id: payload.session_id,
      p_delta: output.brinde_delta,
      p_version: currentVersion,
    });
    // Persiste campos Phase 4 em paralelo (sem otimistic lock — eventual consistency OK aqui)
    const phase4Keys = ["brinde_evidence", "comm_style", "decision_role", "occasion", "stakeholders", "last_contact_message_at"];
    const phase4Patch = Object.fromEntries(Object.entries(patch).filter(([k]) => phase4Keys.includes(k)));
    if (Object.keys(phase4Patch).length > 0) {
      await supabase.from("copilot_sessions").update(phase4Patch).eq("id", payload.session_id);
    }
    return;
  }
  await supabase
    .from("copilot_sessions")
    .update(patch)
    .eq("id", payload.session_id)
    .eq("state_version", currentVersion);
}

// ---------------------------------------------------------------------------
// Handler do kind copilot_tick.
// ---------------------------------------------------------------------------

export interface CopilotTickHandlerDeps {
  supabase: SupabaseClient;
  req: Request;
}

export interface CopilotTickHandlerResult {
  status: "succeeded" | "failed";
  tier: 1 | 2;
  keyMoments: string[];
  durationMs: number;
  reason?: string;
}

export async function handleCopilotTick(
  job: AiJob,
  payload: CopilotTickPayload,
  deps: CopilotTickHandlerDeps,
): Promise<CopilotTickHandlerResult> {
  const t0 = Date.now();

  // CV-021: Gate de capacidade
  const gateResp = await enforceAiCapability({ functionName: "copilot-live", req: deps.req });
  if (gateResp) {
    return { status: "failed", tier: 1, keyMoments: [], durationMs: Date.now() - t0, reason: "capability_disabled" };
  }

  // CV-022: Estado incremental
  logStage("fetch_state", { job_id: job.id, session_id: payload.session_id });
  const t1 = Date.now();
  const state = await fetchIncrementalState(deps.supabase, payload);
  if (!state) {
    return { status: "failed", tier: 1, keyMoments: [], durationMs: Date.now() - t0, reason: "session_not_found" };
  }
  logStage("fetch_state_done", { job_id: job.id, new_messages: state.newMessages.length, latency_ms: Date.now() - t1 });

  if (state.newMessages.length === 0) {
    return { status: "succeeded", tier: 1, keyMoments: [], durationMs: Date.now() - t0, reason: "no_new_messages" };
  }

  // CV-025: Detecção local de momentos-chave (antes de chamar modelo)
  const localKeyMoments = detectKeyMoments(state.newMessages);
  const tier = shouldUseTier2(localKeyMoments) ? 2 : 1;

  // CV-021: Circuito
  const admission = await admitAiProviderCall("default");
  if (!admission.allowed) {
    return { status: "failed", tier, keyMoments: localKeyMoments, durationMs: Date.now() - t0, reason: "circuit_open" };
  }

  // CV-021/028: Reserva de orçamento com prioridade de contexto
  const idempotencyKey = `copilot-live:${payload.session_id}:${state.session.state_version}`;
  const reservation = await reserveBudget({
    idempotencyKey,
    userId: payload.profile_id,
    functionName: "copilot-live",
    estimatedTokens: ESTIMATED_TOKENS,
    limitTokens: PROVIDER_TOKEN_BUDGET,
  });
  if (!reservation.allowed) {
    return { status: "failed", tier, keyMoments: localKeyMoments, durationMs: Date.now() - t0, reason: "budget_denied" };
  }

  // CV-022: Montar contexto incremental (orçamento de contexto CV-028)
  const systemPrompt = buildSystemPrompt(state.session);
  const userContent = buildUserContent(state.session, state.contextMessages, state.newMessages);

  // CV-024: Andar 1 — análise incremental (modelo rápido)
  logStage("generate_tier1", { job_id: job.id, tier, key_moments: localKeyMoments });
  const t2 = Date.now();
  const gen1 = await generateWithRouting({
    purpose: "analysis",
    functionName: "copilot-live",
    userId: payload.profile_id,
    jobId: job.id,
    idempotencyKey,
    budgetTokens: PROVIDER_TOKEN_BUDGET,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  });
  const latency1 = Date.now() - t2;
  logStage("generate_tier1_done", { job_id: job.id, ok: gen1.ok, latency_ms: latency1, status: gen1.status });

  if (!gen1.ok || !gen1.data) {
    if (reservation.id) await releaseBudget(reservation.id, "generate_failed");
    return { status: "failed", tier, keyMoments: localKeyMoments, durationMs: Date.now() - t0, reason: "generate_tier1_failed" };
  }

  // CV-023: Validar contrato estrito
  const parsed1 = parseModelOutput(CopilotLiveOutputSchema, gen1.data);
  if (!parsed1.ok) {
    if (reservation.id) await releaseBudget(reservation.id, "contract_rejected");
    logStage("contract_rejected", { job_id: job.id, errors: parsed1.errors });
    return { status: "failed", tier, keyMoments: localKeyMoments, durationMs: Date.now() - t0, reason: "contract_rejected" };
  }

  const output1 = (parsed1 as { ok: true; data: CopilotLiveOutput }).data;
  const allKeyMoments = [
    ...new Set([...localKeyMoments, ...(output1.key_moments ?? [])]),
  ];

  // Grava insight do andar 1
  await upsertCopilotInsight(deps.supabase, payload.session_id, output1, 1, latency1);

  // Atualiza sessão com estado do andar 1
  const lastMsgAt = state.newMessages.at(-1)?.created_at ?? null;
  await updateSessionState(deps.supabase, payload, output1, lastMsgAt, state.session.state_version);

  let finalTier: 1 | 2 = 1;

  // CV-024: Andar 2 — sugestão em momento-chave (modelo forte)
  if (shouldUseTier2(allKeyMoments)) {
    finalTier = 2;
    logStage("generate_tier2", { job_id: job.id, key_moments: allKeyMoments });
    const t3 = Date.now();
    const gen2 = await generateWithRouting({
      purpose: "copilot",
      functionName: "copilot-live",
      userId: payload.profile_id,
      jobId: job.id,
      idempotencyKey: `${idempotencyKey}:tier2`,
      budgetTokens: PROVIDER_TOKEN_BUDGET,
      system: buildTier2Prompt(state.session, output1, allKeyMoments),
      messages: [{ role: "user", content: userContent }],
    });
    const latency2 = Date.now() - t3;
    logStage("generate_tier2_done", { job_id: job.id, ok: gen2.ok, latency_ms: latency2 });

    if (gen2.ok && gen2.data) {
      const parsed2 = parseModelOutput(CopilotLiveOutputSchema, gen2.data);
      if (parsed2.ok) {
        await upsertCopilotInsight(deps.supabase, payload.session_id, parsed2.data, 2, latency2);
      }
    }
  }

  // Liquidar orçamento
  if (reservation.id) {
    await settleBudget(reservation.id, gen1.data?.usage_tokens as number ?? ESTIMATED_TOKENS);
  }

  return {
    status: "succeeded",
    tier: finalTier,
    keyMoments: allKeyMoments,
    durationMs: Date.now() - t0,
  };
}

// ---------------------------------------------------------------------------
// Construtores de prompt (CV-022, CV-028).
// ---------------------------------------------------------------------------

function buildSystemPrompt(session: SessionState): string {
  return [
    "Você é o RADAR, assistente de análise de vendas B2B para brindes promocionais.",
    "Analise APENAS as mensagens novas fornecidas. Não repita análise de contexto anterior.",
    `Estado atual: etapa ${session.stage}, temperatura ${session.temperature}/10.`,
    `B·R·I·N·D·E atual: ${JSON.stringify(session.brinde_state)}.`,
    "Responda EXCLUSIVAMENTE em JSON válido seguindo o schema fornecido.",
    "Campos ausentes = não detectados neste tick. Nunca invente valores.",
  ].join("\n");
}

function buildUserContent(
  session: SessionState,
  contextMsgs: NewMessage[],
  newMsgs: NewMessage[],
): string {
  const parts: string[] = [];

  if (contextMsgs.length > 0) {
    parts.push("=== CONTEXTO (mensagens anteriores) ===");
    for (const m of contextMsgs) {
      parts.push(`[${m.from_me ? "VENDEDOR" : "CONTATO"}] ${m.body.slice(0, 200)}`);
    }
  }

  parts.push("=== MENSAGENS NOVAS (analise estas) ===");
  for (const m of newMsgs) {
    parts.push(`[${m.from_me ? "VENDEDOR" : "CONTATO"}] ${m.body.slice(0, 500)}`);
  }

  parts.push("");
  parts.push("Retorne JSON com campos: stage?, brinde_delta?, temperature?, intent?, sentiment?, key_moments?, risks?, next_action?, confidence?, brinde_evidence?, comm_style?, decision_role?, occasion?, stakeholders?");

  return parts.join("\n");
}

function buildTier2Prompt(
  session: SessionState,
  tier1: CopilotLiveOutput,
  keyMoments: string[],
): string {
  return [
    "Você é o RADAR, assistente de vendas B2B para brindes.",
    `Momento-chave detectado: ${keyMoments.join(", ")}.`,
    `Etapa: ${tier1.stage ?? session.stage}, temperatura: ${tier1.temperature ?? session.temperature}/10.`,
    "Gere uma sugestão de próximo passo CONCISA (≤120 chars) para o vendedor no campo next_action.",
    "Responda em JSON com pelo menos o campo next_action.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Injeção de dependência (para testes).
// ---------------------------------------------------------------------------

export interface CopilotLiveWorkerDeps {
  supabase?: SupabaseClient;
  serviceKey?: string;
  handlers?: Record<string, (job: AiJob, payload: unknown, deps: CopilotTickHandlerDeps) => Promise<CopilotTickHandlerResult>>;
}

// ---------------------------------------------------------------------------
// Handler HTTP principal.
// ---------------------------------------------------------------------------

export async function handleCopilotLive(
  req: Request,
  injected?: EdgeInjected<SupabaseClient>,
): Promise<Response> {
  const { cors, log, headers, supabase, serviceKey } = bootEdge(req, {
    fnName: "copilot-live",
    injected,
    makeClient: () =>
      createClient(
        requireEnv("SUPABASE_URL"),
        requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
        { auth: { persistSession: false } },
      ),
  });

  if (cors) return cors;

  const authorized = await isAuthorizedCronOrUser(req, supabase, {
    serviceKey,
    readVaultSecret: async () => {
      const { data, error } = await supabase.rpc("get_copilot_live_cron_secret");
      return !error && typeof data === "string" ? data : null;
    },
  });
  if (!authorized) return unauthorizedResponse(headers);

  const t0 = Date.now();
  let claimed = 0;
  let succeeded = 0;
  let failed = 0;

  try {
    const jobs = await claimAiJobs({
      worker: WORKER_ID,
      limit: CLAIM_LIMIT,
      leaseSeconds: CLAIM_LEASE_SECONDS,
    });
    claimed = jobs.length;

    for (const job of jobs) {
      // Heartbeat ANTES do trabalho (padrão ai-jobs-worker)
      const hb1 = await heartbeatAiJob({ id: job.id, leaseToken: job.leaseToken!, leaseSeconds: HEARTBEAT_LEASE_SECONDS });
      if (!hb1) {
        log.warn("lease perdido antes do trabalho", { job_id: job.id });
        failed++;
        continue;
      }

      // Valida payload
      if (!isCopilotTickPayload(job)) {
        await finishAiJob({ id: job.id, leaseToken: job.leaseToken!, status: "failed", errorCode: "UNKNOWN_PAYLOAD" });
        failed++;
        continue;
      }

      let result: CopilotTickHandlerResult;
      try {
        result = await handleCopilotTick(job, job as unknown as CopilotTickPayload, { supabase, req });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await finishAiJob({ id: job.id, leaseToken: job.leaseToken!, status: "failed", errorCode: "HANDLER_ERROR", result: { error: msg } });
        failed++;
        continue;
      }

      // Heartbeat DEPOIS do trabalho
      await heartbeatAiJob({ id: job.id, leaseToken: job.leaseToken!, leaseSeconds: HEARTBEAT_LEASE_SECONDS });

      const finalStatus = result.status === "succeeded" ? "succeeded" : "failed";
      await finishAiJob({
        id: job.id,
        leaseToken: job.leaseToken!,
        status: finalStatus,
        result: { tier: result.tier, key_moments: result.keyMoments, duration_ms: result.durationMs, reason: result.reason },
        ...(result.status === "failed" ? { errorCode: result.reason?.toUpperCase() ?? "HANDLER_FAILED" } : {}),
      });

      if (result.status === "succeeded") succeeded++;
      else failed++;
    }
  } catch (err) {
    if (err instanceof AiJobInfraError) {
      return jsonResponse({ ok: false, error: "infra_error" }, 503, req);
    }
    throw err;
  }

  const duration = Date.now() - t0;
  log.info("tick concluído", { claimed, succeeded, failed, duration_ms: duration });

  return jsonResponse({ ok: true, claimed, succeeded, failed, duration_ms: duration }, 200, req);
}

Deno.serve((req) => handleCopilotLive(req));
