/**
 * effect-reconcile.ts — confirmador de efeitos externos cuja confirmação NÃO
 * chegou (Bloco 05 / PR-4 · IA-047).
 *
 * Por que existe: quando o provedor (Evolution) não devolve um recibo para um
 * envio já POSTado, a linha de origem vai para `outcome_unknown`/falha
 * não-retryável e — até aqui — NÃO havia varredor. A linha ficava parada até
 * intervenção humana. Este módulo é o VARREDOR: ele roda como um `kind` da fila
 * DURÁVEL já existente (`ai_jobs`, IA-045), reaproveitando idempotência, lease e
 * a máquina de estados (IA-046). NÃO cria tabela nem fila nova.
 *
 * REGRA DE OURO — NUNCA REENVIAR. `effect.reconcile` é SOMENTE-LEITURA no
 * provedor: ele consulta o histórico/estado (recibo durável já persistido + sonda
 * de leitura) por `external_id`; JAMAIS repete o POST de envio. Não existe
 * contrato de idempotência do provedor, então reenviar seria duplicar a mensagem
 * do cliente. Se a confirmação não chega, o job termina `failed/UNCONFIRMED` e a
 * linha de origem PERMANECE em `outcome_unknown` para ação humana.
 *
 * IDEMPOTÊNCIA DO ENFILEIRAMENTO: a chave estável é
 * `reconcile:<efeito>:<id da linha de origem>`; o `UNIQUE` de
 * `ai_jobs.idempotency_key` deduplica naturalmente — repetir o enqueue devolve o
 * MESMO job id (garantido pela RPC `enqueue_ai_job`, não por este módulo).
 *
 * CICLO DO HANDLER (kind `effect.reconcile`):
 *   confirmado            → atualiza a linha de origem p/ o estado confirmado e
 *                           devolve `succeeded`  → o worker liquida o job;
 *   não confirmado, cabe  → devolve `partial`    → `partial` NÃO é terminal: o
 *     tentativa             reaper devolve o job à fila e o tick tenta de novo;
 *   esgotou               → lança `EffectReconcileError('UNCONFIRMED')` → o
 *                           worker liquida `failed` com `errorCode='UNCONFIRMED'`
 *                           e a origem segue em `outcome_unknown`.
 *
 * LIMITE CONHECIDO (não é exactly-once externo): a Evolution GO não expõe
 * consulta de histórico por mensagem (`/chat/findMessages` não existe — GO_GAPS
 * D6); a v2 expõe, mas por `remoteJid`, não por id. Por isso a confirmação
 * primária é o RECIBO DURÁVEL que o webhook do provedor já persistiu na linha de
 * origem (status + external_id); a sonda HTTP só é tentada quando o flavor é v2.
 * Sem confirmação positiva, o efeito é tratado como NÃO ocorrido para fins de
 * automação e fica para o humano — nunca se presume exactly-once.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { AiJobInfraError, type AiJob } from "./ai-jobs.ts";
import { evoFetch, extractMessageId } from "./evolution-send.ts";

/** `kind` do job de reconciliação (registrado no worker). */
export const EFFECT_RECONCILE_KIND = "effect.reconcile";

/**
 * `function_name` do job. A reconciliação roda NO worker de jobs (`ai-jobs-worker`),
 * que é quem possui o lease e a liquidação — não é uma função de IA.
 */
export const EFFECT_RECONCILE_FUNCTION = "ai-jobs-worker";

/** Efeito: envio de um destinatário de campanha TalkX. */
export const EFFECT_TALKX_RECIPIENT_SEND = "talkx.recipient.send";
/** Efeito: envio de uma mensagem avulsa (inbox). */
export const EFFECT_MESSAGE_SEND = "message.send";

/** Prefixo da chave de idempotência (o UNIQUE da tabela faz a deduplicação). */
const RECONCILE_KEY_PREFIX = "reconcile";

/** Tentativas do job de reconciliação antes de `failed/UNCONFIRMED`. */
const RECONCILE_MAX_ATTEMPTS = 8;
/** Atraso da 1ª tentativa (dá tempo ao provedor/webhook antes da 1ª sonda). */
const RECONCILE_INITIAL_DELAY_SECONDS = 60;
/** Prioridade: MENOR = antes. A reconciliação não é urgente; não fura a fila de trabalho real. */
const RECONCILE_PRIORITY = 100;

/** Mensagem de erro legível (nunca "undefined"). */
function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Erro de HANDLER da reconciliação. Carrega `code` no formato que o worker
 * (`ai-jobs-worker`) converte em `errorCode` do `finish_ai_job` — inclusive
 * `UNCONFIRMED`, que é o desfecho terminal de "não deu para confirmar".
 */
export class EffectReconcileError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "EffectReconcileError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Payload do job.
// ---------------------------------------------------------------------------

/** Payload do job `effect.reconcile` (jsonb). */
export interface EffectReconcilePayload {
  effect: string;
  source_table: string;
  source_id: string;
  /** Id no provedor, quando conhecido; `null` quando a confirmação nunca chegou. */
  external_id: string | null;
  /** Nº de tentativas da ORIGEM no momento do enfileiramento (informativo). */
  attempt_from: number;
}

/** String obrigatória não vazia (falta/vazio é bug de quem chamou). */
function requireNonEmpty(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`effect-reconcile: "${label}" e obrigatorio e nao pode ser vazio.`);
  }
  return value;
}

/** Monta a chave de idempotência ESTÁVEL do job de reconciliação. */
export function buildEffectReconcileKey(effect: string, sourceId: string): string {
  return `${RECONCILE_KEY_PREFIX}:${effect}:${sourceId}`;
}

/** Interpreta o payload do job; payload malformado → `EffectReconcileError`. */
export function parseEffectReconcilePayload(payload: Record<string, unknown>): EffectReconcilePayload {
  const effect = payload.effect;
  const sourceTable = payload.source_table;
  const sourceId = payload.source_id;
  if (typeof effect !== "string" || effect.trim() === "" ||
      typeof sourceTable !== "string" || sourceTable.trim() === "" ||
      typeof sourceId !== "string" || sourceId.trim() === "") {
    throw new EffectReconcileError(
      "EFFECT_RECONCILE_BAD_PAYLOAD",
      "payload exige effect, source_table e source_id nao vazios",
    );
  }
  const rawExternal = payload.external_id;
  const externalId = typeof rawExternal === "string" && rawExternal.trim() !== "" ? rawExternal : null;
  const rawAttempt = Number(payload.attempt_from);
  const attemptFrom = Number.isFinite(rawAttempt) && rawAttempt > 0 ? Math.trunc(rawAttempt) : 0;
  return { effect, source_table: sourceTable, source_id: sourceId, external_id: externalId, attempt_from: attemptFrom };
}

// ---------------------------------------------------------------------------
// Enfileiramento (idempotente).
// ---------------------------------------------------------------------------

/**
 * Client mínimo que a reconciliação precisa: as RPCs (`enqueue_ai_job`) e o
 * encadeamento do PostgREST (`from(...).select/update`). O `any` do `from` é o
 * mesmo idioma dos testes deste repo (o builder do Supabase é tipado por fora).
 */
export interface ReconcileClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>;
}

/**
 * Enfileira a reconciliação de UM efeito. Repetir a chamada com o mesmo
 * `effect`+`sourceId` devolve o MESMO job id (UNIQUE de `idempotency_key`).
 *
 * LANÇA `AiJobInfraError` em falha de infraestrutura (não falha aberto): quem
 * chama decide se pode absorver. No caminho de envio, a linha de origem JÁ está
 * em quarentena durável, então o chamador loga e segue — a linha permanece
 * visível para ação humana.
 */
export async function enqueueEffectReconcile(p: {
  supabase: ReconcileClient;
  effect: string;
  sourceTable: string;
  sourceId: string;
  externalId?: string | null;
  attemptFrom?: number;
  userId?: string | null;
}): Promise<string> {
  if (typeof p !== "object" || p === null) {
    throw new TypeError('enqueueEffectReconcile: "params" e obrigatorio.');
  }
  const effect = requireNonEmpty(p.effect, "effect");
  const sourceTable = requireNonEmpty(p.sourceTable, "sourceTable");
  const sourceId = requireNonEmpty(p.sourceId, "sourceId");
  if (!p.supabase || typeof p.supabase.rpc !== "function") {
    throw new TypeError('enqueueEffectReconcile: "supabase" (client) e obrigatorio.');
  }
  const externalId = p.externalId ?? null;
  if (externalId !== null && typeof externalId !== "string") {
    throw new TypeError('enqueueEffectReconcile: "externalId" deve ser string, null ou undefined.');
  }
  const rawAttempt = Number(p.attemptFrom ?? 0);
  const attemptFrom = Number.isFinite(rawAttempt) && rawAttempt > 0 ? Math.trunc(rawAttempt) : 0;

  const payload: EffectReconcilePayload = {
    effect,
    source_table: sourceTable,
    source_id: sourceId,
    external_id: externalId,
    attempt_from: attemptFrom,
  };
  const availableAt = new Date(Date.now() + RECONCILE_INITIAL_DELAY_SECONDS * 1000).toISOString();

  let data: unknown;
  try {
    const res = await p.supabase.rpc("enqueue_ai_job", {
      p_idempotency_key: buildEffectReconcileKey(effect, sourceId),
      p_kind: EFFECT_RECONCILE_KIND,
      p_function_name: EFFECT_RECONCILE_FUNCTION,
      p_user_id: p.userId ?? null,
      p_payload: payload,
      p_priority: RECONCILE_PRIORITY,
      p_available_at: availableAt,
      p_expires_at: null,
      p_max_attempts: RECONCILE_MAX_ATTEMPTS,
    });
    if (res.error) throw res.error;
    data = res.data;
  } catch (err) {
    throw new AiJobInfraError(
      `enqueueEffectReconcile: falha de infraestrutura: ${errorText(err)}`,
      err,
    );
  }
  if (typeof data !== "string" || data.trim() === "") {
    throw new AiJobInfraError("enqueueEffectReconcile: resposta invalida da RPC (esperado o id do job).");
  }
  return data;
}

// ---------------------------------------------------------------------------
// Regras por efeito.
// ---------------------------------------------------------------------------

interface EffectRule {
  /** Tabela de origem cuja linha é atualizada quando o efeito é confirmado. */
  sourceTable: string;
  /** Estados que já significam "confirmado pelo provedor". */
  confirmedStatuses: readonly string[];
  /** Estados incertos que PODEM ser corrigidos para "confirmado". */
  uncertainStatuses: readonly string[];
}

const EFFECT_RULES: Readonly<Record<string, EffectRule>> = {
  [EFFECT_TALKX_RECIPIENT_SEND]: {
    sourceTable: "talkx_recipients",
    confirmedStatuses: ["sent", "delivered", "read"],
    uncertainStatuses: ["outcome_unknown", "failed"],
  },
  [EFFECT_MESSAGE_SEND]: {
    sourceTable: "messages",
    confirmedStatuses: ["sent", "delivered", "read"],
    uncertainStatuses: ["failed", "sending"],
  },
};

// ---------------------------------------------------------------------------
// Confirmação (somente-leitura) e aplicação.
// ---------------------------------------------------------------------------

/** Contexto da reconciliação (derivado do payload do job). */
export interface EffectReconcileContext {
  effect: string;
  sourceTable: string;
  sourceId: string;
  externalId: string | null;
  attemptFrom: number;
  payload: Record<string, unknown>;
}

/** Resultado da confirmação. */
export type EffectConfirmation =
  | { state: "confirmed"; externalId: string; detail?: Record<string, unknown> }
  | { state: "unconfirmed"; detail?: Record<string, unknown> };

/** Confirma (somente-leitura) se o efeito ocorreu. Nunca envia nada. */
export type EffectConfirmer = (ctx: EffectReconcileContext) => Promise<EffectConfirmation>;

/** Aplica o estado confirmado na linha de origem. Idempotente. */
export type EffectApplier = (ctx: EffectReconcileContext, externalId: string) => Promise<boolean>;

/** Costura de dependências do handler (injetável para teste/mutação). */
export interface EffectReconcileDeps {
  confirm: EffectConfirmer;
  applyConfirmed: EffectApplier;
}

/** Fetcher injetável (mesmo formato de `_shared/evolution-send.ts`). */
type Fetcher = (url: string, options: RequestInit) => Promise<Response>;

interface ProbeDeps {
  supabase: ReconcileClient;
  fetcher: Fetcher;
}

/** Alvo (instância + telefone) para a sonda de leitura no provedor. */
interface ProbeTarget {
  instanceId: string | null;
  phone: string | null;
}

/** Lê um campo string de uma linha desconhecida do PostgREST. */
function strField(row: unknown, field: string): string | null {
  if (!row || typeof row !== "object") return null;
  const value = (row as Record<string, unknown>)[field];
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * Resolve, por leitura, a instância do WhatsApp e o telefone do destinatário a
 * partir da linha de origem. Somente SELECT — nenhum efeito.
 */
async function resolveProbeTarget(supabase: ReconcileClient, ctx: EffectReconcileContext): Promise<ProbeTarget> {
  if (ctx.effect === EFFECT_MESSAGE_SEND) {
    const { data: msg } = await supabase.from("messages")
      .select("contact_id, whatsapp_connection_id").eq("id", ctx.sourceId).maybeSingle();
    const contactId = strField(msg, "contact_id");
    const connId = strField(msg, "whatsapp_connection_id");
    const phone = contactId
      ? strField((await supabase.from("contacts").select("phone").eq("id", contactId).maybeSingle()).data, "phone")
      : null;
    const instanceId = connId
      ? strField((await supabase.from("whatsapp_connections").select("instance_id").eq("id", connId).maybeSingle()).data, "instance_id")
      : null;
    return { instanceId, phone };
  }
  if (ctx.effect === EFFECT_TALKX_RECIPIENT_SEND) {
    const { data: rec } = await supabase.from("talkx_recipients")
      .select("contact_id, campaign_id").eq("id", ctx.sourceId).maybeSingle();
    const contactId = strField(rec, "contact_id");
    const campaignId = strField(rec, "campaign_id");
    const phone = contactId
      ? strField((await supabase.from("contacts").select("phone").eq("id", contactId).maybeSingle()).data, "phone")
      : null;
    const connId = campaignId
      ? strField((await supabase.from("talkx_campaigns").select("whatsapp_connection_id").eq("id", campaignId).maybeSingle()).data, "whatsapp_connection_id")
      : null;
    const instanceId = connId
      ? strField((await supabase.from("whatsapp_connections").select("instance_id").eq("id", connId).maybeSingle()).data, "instance_id")
      : null;
    return { instanceId, phone };
  }
  return { instanceId: null, phone: null };
}

/**
 * Sonda SOMENTE-LEITURA no provedor por `external_id`. Em v2 usa a rota real de
 * busca de histórico (`/chat/findMessages/{instance}`, a MESMA de
 * `_shared/evolution-sync-actions.ts`); na GO essa rota não existe (GO_GAPS D6),
 * então a sonda se declara indisponível e a decisão fica pelo recibo durável.
 *
 * NUNCA chama rota de envio (`/message/send*`). Qualquer falha de leitura (rede,
 * HTTP, corpo) é tratada como "não confirmado" — não é falha de infraestrutura
 * nossa e não pode derrubar o tick.
 */
export async function probeProviderReadOnly(
  ctx: EffectReconcileContext,
  deps: ProbeDeps,
): Promise<EffectConfirmation> {
  if (!ctx.externalId) {
    return { state: "unconfirmed", detail: { reason: "no_external_id" } };
  }
  if ((Deno.env.get("EVOLUTION_API_FLAVOR") ?? "go") !== "v2") {
    return { state: "unconfirmed", detail: { reason: "provider_history_unsupported" } };
  }
  const url = Deno.env.get("EVOLUTION_API_URL");
  const key = Deno.env.get("EVOLUTION_API_KEY");
  if (!url || !key) {
    return { state: "unconfirmed", detail: { reason: "provider_env_absent" } };
  }
  try {
    const target = await resolveProbeTarget(deps.supabase, ctx);
    if (!target.instanceId || !target.phone) {
      return { state: "unconfirmed", detail: { reason: "probe_target_unresolved" } };
    }
    const remoteJid = `${target.phone.replace(/\D/g, "")}@s.whatsapp.net`;
    const res = await evoFetch(
      url.replace(/\/+$/, ""),
      key,
      `/chat/findMessages/${target.instanceId}`,
      { where: { key: { remoteJid } }, page: 1, offset: 50 },
      deps.fetcher,
      "POST", // verbo da BUSCA de histórico no v2; NÃO é envio (não é /message/send*)
    );
    if (!res.ok) {
      return { state: "unconfirmed", detail: { reason: `provider_read_http_${res.status}` } };
    }
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      return { state: "unconfirmed", detail: { reason: "provider_read_invalid_body" } };
    }
    const messages = Array.isArray(json)
      ? json
      : (json && typeof json === "object" && Array.isArray((json as { messages?: unknown }).messages)
        ? (json as { messages: unknown[] }).messages
        : []);
    const found = messages.some((m) => extractMessageId(m) === ctx.externalId);
    return found
      ? { state: "confirmed", externalId: ctx.externalId, detail: { source: "provider_history" } }
      : { state: "unconfirmed", detail: { reason: "provider_history_miss" } };
  } catch (err) {
    return { state: "unconfirmed", detail: { reason: "provider_read_failed", error: errorText(err) } };
  }
}

/**
 * Constrói o par confirmar/aplicar COM o client e o fetcher injetados. Testes e
 * a prova por mutação usam esta fábrica para exercitar o código REAL sem banco
 * nem rede.
 */
export function makeEffectReconcileDeps(opts: {
  supabase: ReconcileClient;
  fetcher?: Fetcher;
  probe?: EffectConfirmer;
}): EffectReconcileDeps {
  const fetcher: Fetcher = opts.fetcher ?? ((u, o) => fetch(u, o));
  const probe: EffectConfirmer = opts.probe ?? ((ctx) => probeProviderReadOnly(ctx, { supabase: opts.supabase, fetcher }));

  const confirm: EffectConfirmer = async (ctx) => {
    const rule = EFFECT_RULES[ctx.effect];
    if (!rule) return { state: "unconfirmed", detail: { reason: "unknown_effect" } };

    // (1) RECIBO DURÁVEL já persistido na linha de origem (somente SELECT). É a
    //     confirmação primária: o webhook do provedor grava status/external_id.
    const { data, error } = await opts.supabase
      .from(rule.sourceTable)
      .select("status, external_id")
      .eq("id", ctx.sourceId)
      .maybeSingle();
    if (error) {
      throw new AiJobInfraError(
        `effect-reconcile: leitura de ${rule.sourceTable} falhou: ${error.message ?? "erro"}`,
        error,
      );
    }
    if (!data) {
      return { state: "unconfirmed", detail: { reason: "source_missing" } };
    }
    const status = strField(data, "status");
    const receiptId = strField(data, "external_id");
    if (receiptId && status && rule.confirmedStatuses.includes(status)) {
      return { state: "confirmed", externalId: receiptId, detail: { source: "durable_receipt" } };
    }

    // (2) Sonda de LEITURA no provedor (quando o flavor suporta). Não confirma
    //     nada por si só: só devolve o que o provedor reporta.
    const probed = await probe(ctx);
    if (probed.state === "confirmed") return probed;

    return {
      state: "unconfirmed",
      detail: { reason: "not_confirmed", durable_status: status ?? null, probe: probed.detail ?? null },
    };
  };

  const applyConfirmed: EffectApplier = async (ctx, externalId) => {
    const rule = EFFECT_RULES[ctx.effect];
    if (!rule) throw new EffectReconcileError("EFFECT_RECONCILE_UNKNOWN_EFFECT");
    const now = new Date().toISOString();
    const patch = ctx.effect === EFFECT_MESSAGE_SEND
      ? { status: "sent", external_id: externalId, status_updated_at: now, updated_at: now }
      : { status: "sent", external_id: externalId, sent_at: now, error_message: null, updated_at: now };
    // Guarda pelos estados INCERTOS: já confirmado por outro caminho não é
    // sobrescrito (idempotente). Linha fora desses estados → 0 linhas.
    const { data, error } = await opts.supabase
      .from(rule.sourceTable)
      .update(patch)
      .eq("id", ctx.sourceId)
      .in("status", rule.uncertainStatuses)
      .select("id");
    if (error) {
      throw new AiJobInfraError(
        `effect-reconcile: atualizacao de ${rule.sourceTable} falhou: ${error.message ?? "erro"}`,
        error,
      );
    }
    return Array.isArray(data) && data.length > 0;
  };

  return { confirm, applyConfirmed };
}

// ---------------------------------------------------------------------------
// Handler do kind `effect.reconcile`.
// ---------------------------------------------------------------------------

/** Entrada do handler (mesma forma de `AiJobHandlerInput` do worker). */
export interface EffectReconcileInput {
  job: AiJob;
  kind: string;
  payload: Record<string, unknown>;
  functionName: string;
  userId: string | null;
}

/** Desfecho normal (o terminal `failed` é sinalizado por exceção, como no worker). */
export type EffectReconcileResult =
  | { status: "succeeded"; result?: unknown }
  | { status: "partial"; result?: unknown };

/** Cria o client de service role do ambiente (mesmo padrão do resto do repo). */
function requireReconcileClient(): ReconcileClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new AiJobInfraError("effect-reconcile: ambiente ausente (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  }
  try {
    return createClient(url, key) as unknown as ReconcileClient;
  } catch (err) {
    throw new AiJobInfraError(`effect-reconcile: falha ao criar cliente: ${errorText(err)}`, err);
  }
}

/** Deps de produção (client do ambiente + sonda real). */
export function defaultEffectReconcileDeps(): EffectReconcileDeps {
  return makeEffectReconcileDeps({ supabase: requireReconcileClient() });
}

/** Lê inteiro não-negativo (ausente vira 0). */
function toInt(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/**
 * Confirmador de efeitos externos (kind `effect.reconcile`). SOMENTE-LEITURA no
 * provedor: NUNCA reenvia. Ver o cabeçalho do módulo para o desfecho por estado.
 */
export async function handleEffectReconcile(
  input: EffectReconcileInput,
  deps?: EffectReconcileDeps,
): Promise<EffectReconcileResult> {
  const payload = input && typeof input.payload === "object" && input.payload !== null ? input.payload : {};
  const parsed = parseEffectReconcilePayload(payload);
  if (!EFFECT_RULES[parsed.effect]) {
    throw new EffectReconcileError("EFFECT_RECONCILE_UNKNOWN_EFFECT", `efeito desconhecido: ${parsed.effect}`);
  }

  const ctx: EffectReconcileContext = {
    effect: parsed.effect,
    sourceTable: parsed.source_table,
    sourceId: parsed.source_id,
    externalId: parsed.external_id,
    attemptFrom: parsed.attempt_from,
    payload,
  };
  const d = deps ?? defaultEffectReconcileDeps();

  const confirmation = await d.confirm(ctx);
  if (confirmation.state === "confirmed") {
    const applied = await d.applyConfirmed(ctx, confirmation.externalId);
    return {
      status: "succeeded",
      result: {
        effect: ctx.effect,
        source_id: ctx.sourceId,
        external_id: confirmation.externalId,
        confirmed: true,
        applied,
      },
    };
  }

  const attemptCount = toInt(input?.job?.attemptCount);
  const maxAttempts = toInt(input?.job?.maxAttempts);
  const exhausted = maxAttempts > 0 && attemptCount >= maxAttempts;
  if (exhausted) {
    // Terminal: o worker converte em `failed` com errorCode 'UNCONFIRMED'. A
    // linha de origem NÃO é tocada e permanece em `outcome_unknown` para humano.
    throw new EffectReconcileError(
      "UNCONFIRMED",
      `efeito ${ctx.effect} origem ${ctx.sourceId} nao confirmado apos ${attemptCount}/${maxAttempts} tentativas`,
    );
  }

  // `partial` NÃO é terminal: o reaper devolve o job à fila (backoff) e o
  // próximo tick tenta confirmar de novo. O MESMO job — enqueue repetido
  // devolve o mesmo id (UNIQUE de idempotency_key).
  return {
    status: "partial",
    result: {
      effect: ctx.effect,
      source_id: ctx.sourceId,
      confirmed: false,
      attempt: attemptCount,
      max_attempts: maxAttempts,
    },
  };
}
