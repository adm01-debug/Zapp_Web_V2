/**
 * Copiloto RADAR — handler do kind `copilot.tick` (CV-021–045).
 *
 * Produtor: gatilho `trg_copilot_tick_on_contact_message` (migration
 * 20261030200000), que agenda um tick com debounce de 4 s a cada mensagem do
 * contato. Consumidor: ai-jobs-worker (lease, retentativa, liquidação).
 *
 * Um tick:
 *   1. confere a capacidade `ai.capability.copilot_live` (desligada = não gasta);
 *   2. lê a sessão e as mensagens NOVAS desde `last_processed_message_at`;
 *   3. andar 1 (`analysis`, modelo rápido): etapa, temperatura, B·R·I·N·D·E,
 *      sinais e próximo passo;
 *   4. andar 2 (`copilot`, só em momento-chave): 3 sugestões de resposta, uma por
 *      caminho (avançar / descobrir / relacionar);
 *   5. grava a sessão com trava otimista (`state_version`) e os insights.
 *
 * Circuito, orçamento e registro de uso ficam no `generateWithRouting` — aqui não
 * se reimplementa nada disso. Portado do desenho do #1998/#2000/#2002 para o
 * esquema atual (colunas brinde_*, `copilot_insights.content`).
 */
import { z } from "https://esm.sh/zod@3.23.8";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { parseModelOutput } from "./ai-response-contracts.ts";

export const COPILOT_TICK_KIND = "copilot.tick";
export const COPILOT_FUNCTION_NAME = "copilot-live";
export const COPILOT_CAPABILITY_KEY = "ai.capability.copilot_live";

/** Máximo de mensagens novas enviadas ao modelo por tick. */
export const MAX_NEW_MESSAGES = 20;
/** Mensagens anteriores ao cursor, só para ancorar o modelo. */
export const MAX_CONTEXT_MESSAGES = 5;
/** Teto de tokens de cada chamada (orçamento do generateWithRouting). */
const BUDGET_TOKENS = 1_200;

/** Falha do TRABALHO (vira `failed` com este código no worker). */
export class CopilotTickError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "CopilotTickError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Contratos da saída do modelo.
// ---------------------------------------------------------------------------

export const SALE_STAGES = [
  "novo_contato", "qualificando", "apresentando", "negociando", "fechando", "pos_venda", "perdido",
] as const;

/** Valores aceitos pela coluna `decision_role` (CHECK constraint na migration). */
export const DECISION_ROLES = ["buyer", "user", "approver", "intermediary", "unknown"] as const;
const DECISION_ROLE_SET = new Set<string>(DECISION_ROLES);

const texto = (max: number) => z.string().trim().min(1).max(max);

export const CopilotTier1Schema = z.object({
  sale_stage: z.enum(SALE_STAGES).optional(),
  temperature: z.number().int().min(0).max(100).optional(),
  brinde: z.object({
    budget: texto(120).optional(),
    responsible: texto(120).optional(),
    intention: texto(200).optional(),
    quantity: z.number().int().positive().max(10_000_000).optional(),
    deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    delivery: texto(200).optional(),
  }).partial().optional(),
  brinde_evidence: z.record(texto(300)).optional(),
  intent: texto(80).optional(),
  sentiment: texto(40).optional(),
  comm_style: texto(80).optional(),
  decision_role: texto(80).optional(),
  occasion: texto(120).optional(),
  stakeholders: z.array(z.object({ name: texto(120).optional(), role: texto(120).optional() })).max(10).optional(),
  key_moments: z.array(texto(40)).max(10).optional(),
  risks: z.array(texto(200)).max(5).optional(),
  next_action: texto(160).optional(),
});
export type CopilotTier1Output = z.infer<typeof CopilotTier1Schema>;

export const SUGGESTION_PATHS = ["avancar", "descobrir", "relacionar"] as const;

export const CopilotTier2Schema = z.object({
  next_action: texto(160).optional(),
  suggestions: z.array(z.object({
    path: z.enum(SUGGESTION_PATHS),
    text: texto(300),
    play_name: texto(80).optional(),
    sources: z.array(z.object({
      text: texto(300),
      letter: z.enum(["B", "R", "I", "N", "D", "E"]).optional(),
    })).max(6).optional(),
    split_messages: z.array(texto(300)).max(3).optional(),
  })).min(1).max(3),
});
export type CopilotTier2Output = z.infer<typeof CopilotTier2Schema>;

// ---------------------------------------------------------------------------
// CV-025 — momentos-chave detectados localmente (antes de gastar modelo).
// ---------------------------------------------------------------------------

const KEY_MOMENT_RULES: Array<{ type: string; patterns: RegExp[] }> = [
  { type: "price_request", patterns: [/quanto\s+(custa|fica|é|sai)/i, /qual\s+(o|é\s+o)\s+pre[çc]o/i, /valor\s+(do|de|por)/i, /or[çc]amento/i] },
  { type: "objection", patterns: [/muito\s+caro/i, /est[áa]\s+acima/i, /n[ãa]o\s+tenho\s+verba/i, /sem\s+budget/i] },
  { type: "buy_signal", patterns: [/vou\s+(fechar|comprar|pedir)/i, /quero\s+(fechar|confirmar|pedir)/i, /pode\s+(enviar|mandar)\s+a\s+nf/i, /fecha(mos|r)\s+neg[óo]cio/i] },
  { type: "competitor_mention", patterns: [/concorrente/i, /outra\s+empresa/i, /outro\s+fornecedor/i, /j[áa]\s+pesquisei/i] },
  { type: "deadline_request", patterns: [/prazo\s+(de\s+)?entrega/i, /quando\s+chega/i, /preciso\s+para\s+(o\s+)?(dia|semana|m[êe]s)/i, /urgente/i] },
  { type: "logo_sent", patterns: [/\blogo(tipo|marca)?\b/i, /\barte\b/i] },
  { type: "unanswered_question", patterns: [/\?/] },
];

/** Andar 2 só nestes momentos: é onde a sugestão de resposta paga o custo. */
const TIER2_MOMENTS = new Set(["price_request", "objection", "buy_signal", "competitor_mention"]);

export interface TickMessage {
  id: string;
  content: string;
  sender: "contact" | "agent";
  created_at: string;
}

export function detectKeyMoments(messages: TickMessage[]): string[] {
  const found = new Set<string>();
  for (const m of messages) {
    if (m.sender !== "contact") continue;
    for (const rule of KEY_MOMENT_RULES) {
      if (rule.patterns.some((re) => re.test(m.content))) found.add(rule.type);
    }
  }
  return [...found];
}

export function shouldUseTier2(keyMoments: string[]): boolean {
  return keyMoments.some((m) => TIER2_MOMENTS.has(m));
}

// ---------------------------------------------------------------------------
// Estado da sessão.
// ---------------------------------------------------------------------------

const BRINDE_COLUMNS = {
  budget: "brinde_budget",
  responsible: "brinde_responsible",
  intention: "brinde_intention",
  quantity: "brinde_quantity",
  deadline: "brinde_deadline",
  delivery: "brinde_delivery",
} as const;
type BrindeKey = keyof typeof BRINDE_COLUMNS;

export interface SessionRow {
  id: string;
  contact_id: string;
  profile_id: string;
  sale_stage: string;
  temperature: number;
  state_version: number;
  last_processed_message_at: string | null;
  brinde_budget: string | null;
  brinde_responsible: string | null;
  brinde_intention: string | null;
  brinde_quantity: number | null;
  brinde_deadline: string | null;
  brinde_delivery: string | null;
  brinde_evidence: Record<string, string> | null;
}

const SESSION_COLUMNS = [
  "id", "contact_id", "profile_id", "sale_stage", "temperature", "state_version", "last_processed_message_at",
  ...Object.values(BRINDE_COLUMNS), "brinde_evidence",
].join(", ");

function brindeAtual(s: SessionRow): Record<BrindeKey, unknown> {
  return Object.fromEntries(
    (Object.keys(BRINDE_COLUMNS) as BrindeKey[]).map((k) => [k, s[BRINDE_COLUMNS[k]]]),
  ) as Record<BrindeKey, unknown>;
}

/** Retorna true se a string AAAA-MM-DD representa uma data real no calendário. */
function isRealDate(d: string): boolean {
  const [y, mo, day] = d.split("-").map(Number);
  const dt = new Date(y, mo - 1, day);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === day;
}

/**
 * Patch da sessão a partir do andar 1. Campo que o modelo não trouxe NÃO apaga o
 * que já se sabia; o medidor B·R·I·N·D·E é recontado no servidor (0–6).
 */
export function buildSessionPatch(
  session: SessionRow,
  out: CopilotTier1Output,
  lastMessageAt: string,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    state_version: session.state_version + 1,
    last_tick_at: new Date().toISOString(),
    last_processed_message_at: lastMessageAt,
  };
  if (out.sale_stage) patch.sale_stage = out.sale_stage;
  if (out.temperature !== undefined) patch.temperature = out.temperature;
  for (const campo of ["intent", "sentiment", "comm_style", "occasion"] as const) {
    if (out[campo]) patch[campo] = out[campo];
  }
  if (out.decision_role) {
    if (DECISION_ROLE_SET.has(out.decision_role)) patch.decision_role = out.decision_role;
    // valor não reconhecido → omite (não sobrescreve role válido já gravado)
  }
  if (out.stakeholders?.length) patch.stakeholders = out.stakeholders;

  const brinde = { ...brindeAtual(session) };
  for (const k of Object.keys(BRINDE_COLUMNS) as BrindeKey[]) {
    const v = out.brinde?.[k];
    if (v !== undefined && v !== null) {
      // Descarta datas que passam na regex mas não existem no calendário (ex.: 2026-02-30).
      if (k === "deadline" && typeof v === "string" && !isRealDate(v)) continue;
      patch[BRINDE_COLUMNS[k]] = v;
      brinde[k] = v;
    }
  }
  patch.brinde_meter = Object.values(brinde).filter((v) => v !== null && v !== undefined && v !== "").length;
  if (out.brinde_evidence && Object.keys(out.brinde_evidence).length) {
    patch.brinde_evidence = { ...(session.brinde_evidence ?? {}), ...out.brinde_evidence };
  }
  return patch;
}

export interface InsightRow {
  session_id: string;
  profile_id: string;
  insight_type: "suggestion" | "alert" | "next_action" | "stage_change";
  content: string;
  source: "edge";
  model_version: string | null;
  state_version: number;
  tier: 1 | 2;
  latency_ms: number;
  data: Record<string, unknown>;
}

export function buildTier1Insights(
  session: SessionRow,
  out: CopilotTier1Output,
  meta: { model: string | null; latencyMs: number; stateVersion: number },
): InsightRow[] {
  const base = {
    session_id: session.id,
    profile_id: session.profile_id,
    source: "edge" as const,
    model_version: meta.model,
    state_version: meta.stateVersion,
    tier: 1 as const,
    latency_ms: meta.latencyMs,
  };
  const rows: InsightRow[] = [];
  if (out.sale_stage && out.sale_stage !== session.sale_stage) {
    rows.push({ ...base, insight_type: "stage_change", content: `${session.sale_stage} → ${out.sale_stage}`, data: { from: session.sale_stage, to: out.sale_stage } });
  }
  for (const risk of out.risks ?? []) {
    rows.push({ ...base, insight_type: "alert", content: risk, data: { risk } });
  }
  if (out.next_action) {
    rows.push({ ...base, insight_type: "next_action", content: out.next_action, data: { key_moments: out.key_moments ?? [] } });
  }
  return rows;
}

export function buildTier2Insights(
  session: SessionRow,
  out: CopilotTier2Output,
  meta: { model: string | null; latencyMs: number; stateVersion: number; keyMoments: string[] },
): InsightRow[] {
  return out.suggestions.map((s) => ({
    session_id: session.id,
    profile_id: session.profile_id,
    insight_type: "suggestion" as const,
    content: s.text,
    source: "edge" as const,
    model_version: meta.model,
    state_version: meta.stateVersion,
    tier: 2 as const,
    latency_ms: meta.latencyMs,
    data: { ...s, key_moments: meta.keyMoments },
  }));
}

// ---------------------------------------------------------------------------
// Prompts (CV-022/028/041).
// ---------------------------------------------------------------------------

function linhas(msgs: TickMessage[], max: number): string[] {
  return msgs.map((m) => `[${m.sender === "agent" ? "VENDEDOR" : "CONTATO"}] ${m.content.slice(0, max)}`);
}

export function buildTier1System(session: SessionRow): string {
  return [
    "Você é o RADAR, assistente de análise de vendas B2B de brindes promocionais.",
    "Analise APENAS as mensagens novas. Use o contexto só para entender a conversa.",
    `Estado atual: etapa ${session.sale_stage}, temperatura ${session.temperature}/100.`,
    `B·R·I·N·D·E já conhecido: ${JSON.stringify(brindeAtual(session))}.`,
    "Responda SOMENTE um objeto JSON com os campos (todos opcionais):",
    `  sale_stage: um de ${SALE_STAGES.join(", ")}`,
    "  temperature: inteiro 0–100 (interesse de compra)",
    "  brinde: { budget, responsible, intention, quantity (inteiro), deadline (AAAA-MM-DD real), delivery } — só o que a conversa disse",
    "  brinde_evidence: { campo: trecho literal da conversa que comprova }",
    "  intent, sentiment, comm_style, occasion: texto curto",
    `  decision_role: um de ${DECISION_ROLES.join(", ")}`,
    "  stakeholders: [{ name, role }]",
    "  key_moments: lista curta (ex.: price_request, objection, buy_signal)",
    "  risks: até 5 frases curtas",
    "  next_action: próximo passo para o vendedor (≤160 caracteres)",
    "Campo não detectado = omita. NUNCA invente valores que não estão na conversa.",
  ].join("\n");
}

export function buildUserContent(context: TickMessage[], fresh: TickMessage[]): string {
  const parts: string[] = [];
  if (context.length) parts.push("=== CONTEXTO (anteriores) ===", ...linhas(context, 200));
  parts.push("=== MENSAGENS NOVAS (analise estas) ===", ...linhas(fresh, 500));
  return parts.join("\n");
}

export function buildTier2System(session: SessionRow, t1: CopilotTier1Output, keyMoments: string[]): string {
  const brinde = { ...brindeAtual(session), ...(t1.brinde ?? {}) };
  return [
    "Você é o RADAR, assistente de vendas B2B de brindes promocionais.",
    `Momento-chave: ${keyMoments.join(", ")}.`,
    `Etapa: ${t1.sale_stage ?? session.sale_stage}; temperatura ${t1.temperature ?? session.temperature}/100.`,
    `B·R·I·N·D·E: ${JSON.stringify(brinde)}.`,
    "Gere EXATAMENTE 3 sugestões de resposta para o vendedor enviar, uma por caminho:",
    "  avancar — leva a negociação ao próximo passo",
    "  descobrir — preenche uma letra do B·R·I·N·D·E que ainda falta",
    "  relacionar — cria rapport e empatia",
    "Responda SOMENTE um objeto JSON:",
    "  { next_action?: string, suggestions: [{ path, text, play_name?, sources?: [{ text, letter? }], split_messages?: [string] }] }",
    "Texto direto, sem saudação, em português do Brasil. Nunca invente preço, prazo ou dado que não esteja na conversa.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Handler.
// ---------------------------------------------------------------------------

export interface CopilotTickPayload {
  session_id: string;
  contact_id: string;
  profile_id: string;
}

export function isCopilotTickPayload(p: unknown): p is CopilotTickPayload {
  if (typeof p !== "object" || p === null) return false;
  const o = p as Record<string, unknown>;
  return typeof o.session_id === "string" && typeof o.contact_id === "string" && typeof o.profile_id === "string";
}

/** O que o handler precisa do `generateWithRouting` (injetável no teste). */
export type CopilotGenerate = (params: {
  purpose: "analysis" | "copilot";
  functionName: string;
  userId: string;
  jobId: string;
  attempt: number;
  idempotencyKey: string;
  budgetTokens: number;
  system: string;
  messages: Array<{ role: "user"; content: string }>;
}) => Promise<{ ok: boolean; data: Record<string, unknown> | null; model: string | null; errorCode?: string | null }>;

export interface CopilotTickDeps {
  supabase: SupabaseClient;
  generate: CopilotGenerate;
  /** `true` ligada, `false` desligada, `null` leitura falhou (bloqueia). */
  readFlag: (key: string) => Promise<boolean | null>;
  now?: () => number;
}

export interface CopilotTickInput {
  job: { id: string; attemptCount: number };
  payload: Record<string, unknown>;
}

export type CopilotTickResult = { status: "succeeded"; result: Record<string, unknown> };

async function lerMensagens(
  supabase: SupabaseClient,
  contactId: string,
  cursor: string | null,
): Promise<{ fresh: TickMessage[]; context: TickMessage[] }> {
  const limpa = (rows: unknown[] | null): TickMessage[] =>
    ((rows ?? []) as TickMessage[]).filter((m) => typeof m.content === "string" && m.content.trim() !== "");

  let novas = supabase
    .from("messages")
    .select("id, content, sender, created_at")
    .eq("contact_id", contactId)
    .in("sender", ["contact", "agent"])
    .order("created_at", { ascending: true })
    .limit(MAX_NEW_MESSAGES);
  if (cursor) novas = novas.gt("created_at", cursor);
  const { data: fresh, error } = await novas;
  if (error) throw new CopilotTickError("COPILOT_READ_FAILED", error.message);

  if (!cursor) return { fresh: limpa(fresh), context: [] };
  const { data: ctx } = await supabase
    .from("messages")
    .select("id, content, sender, created_at")
    .eq("contact_id", contactId)
    .in("sender", ["contact", "agent"])
    .lte("created_at", cursor)
    .order("created_at", { ascending: false })
    .limit(MAX_CONTEXT_MESSAGES);
  return { fresh: limpa(fresh), context: limpa(ctx).reverse() };
}

export async function handleCopilotTick(input: CopilotTickInput, deps: CopilotTickDeps): Promise<CopilotTickResult> {
  const now = deps.now ?? Date.now;
  if (!isCopilotTickPayload(input.payload)) {
    throw new CopilotTickError("COPILOT_BAD_PAYLOAD", "payload sem session_id/contact_id/profile_id");
  }
  const payload = input.payload;

  // 1. Capacidade: desligada ou ilegível NÃO gasta provedor.
  const flag = await deps.readFlag(COPILOT_CAPABILITY_KEY);
  if (flag !== true) {
    return { status: "succeeded", result: { skipped: flag === false ? "capability_disabled" : "capability_unreadable" } };
  }

  // 2. Sessão + mensagens novas.
  const { data: session, error: sErr } = await deps.supabase
    .from("copilot_sessions")
    .select(SESSION_COLUMNS)
    .eq("id", payload.session_id)
    .maybeSingle();
  if (sErr) throw new CopilotTickError("COPILOT_READ_FAILED", sErr.message);
  if (!session) throw new CopilotTickError("COPILOT_SESSION_NOT_FOUND");
  const s = session as unknown as SessionRow;

  const { fresh, context } = await lerMensagens(deps.supabase, s.contact_id, s.last_processed_message_at);
  if (!fresh.some((m) => m.sender === "contact")) {
    return { status: "succeeded", result: { skipped: "no_new_contact_messages" } };
  }

  const keyMoments = detectKeyMoments(fresh);
  const userContent = buildUserContent(context, fresh);
  const idem = `copilot.tick:${s.id}:${s.state_version}`;

  // 3. Andar 1.
  const t1 = now();
  const gen1 = await deps.generate({
    purpose: "analysis",
    functionName: COPILOT_FUNCTION_NAME,
    userId: payload.profile_id,
    jobId: input.job.id,
    attempt: input.job.attemptCount,
    idempotencyKey: `${idem}:t1`,
    budgetTokens: BUDGET_TOKENS,
    system: buildTier1System(s),
    messages: [{ role: "user", content: userContent }],
  });
  const lat1 = now() - t1;
  if (!gen1.ok || !gen1.data) throw new CopilotTickError(gen1.errorCode ?? "COPILOT_TIER1_FAILED");
  const raw1 = (gen1.data as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content;
  if (!raw1) throw new CopilotTickError("COPILOT_TIER1_FAILED");
  let parsed1: unknown;
  try { parsed1 = JSON.parse(raw1); } catch { throw new CopilotTickError("COPILOT_TIER1_CONTRACT"); }
  const p1 = parseModelOutput(CopilotTier1Schema, parsed1);
  if (!p1.ok) throw new CopilotTickError("COPILOT_TIER1_CONTRACT");
  const out1 = p1.data;
  // Sanitiza deadline inválida antes de usar em patch ou prompt tier2.
  if (out1.brinde?.deadline && !isRealDate(out1.brinde.deadline)) {
    delete (out1.brinde as Record<string, unknown>).deadline;
  }
  const allMoments = [...new Set([...keyMoments, ...(out1.key_moments ?? [])])];

  // 4. Andar 2 (só em momento-chave). Falha aqui não perde o andar 1.
  let out2: CopilotTier2Output | null = null;
  let lat2 = 0;
  let model2: string | null = null;
  if (shouldUseTier2(allMoments)) {
    const t2 = now();
    const gen2 = await deps.generate({
      purpose: "copilot",
      functionName: COPILOT_FUNCTION_NAME,
      userId: payload.profile_id,
      jobId: input.job.id,
      attempt: input.job.attemptCount,
      idempotencyKey: `${idem}:t2`,
      budgetTokens: BUDGET_TOKENS,
      system: buildTier2System(s, out1, allMoments),
      messages: [{ role: "user", content: userContent }],
    });
    lat2 = now() - t2;
    model2 = gen2.model;
    if (gen2.ok && gen2.data) {
      const raw2 = (gen2.data as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content;
      if (raw2) {
        try {
          const parsed2 = JSON.parse(raw2);
          const p2 = parseModelOutput(CopilotTier2Schema, parsed2);
          if (p2.ok) out2 = p2.data;
        } catch { /* tier2 inválido — não perde o tier1 */ }
      }
    }
  }

  // 5. Sessão com trava otimista: se outro tick gravou antes, não sobrescreve —
  // o cursor não anda e o próximo tick reprocessa a partir do estado novo.
  const lastAt = fresh[fresh.length - 1].created_at;
  const patch = buildSessionPatch(s, out1, lastAt);
  const { data: updated, error: uErr } = await deps.supabase
    .from("copilot_sessions")
    .update(patch)
    .eq("id", s.id)
    .eq("state_version", s.state_version)
    .select("id");
  if (uErr) throw new CopilotTickError("COPILOT_WRITE_FAILED", uErr.message);
  if (!updated || updated.length === 0) {
    return { status: "succeeded", result: { skipped: "stale_state", state_version: s.state_version } };
  }

  const stateVersion = s.state_version + 1;
  const insights = [
    ...buildTier1Insights(s, out1, { model: gen1.model, latencyMs: lat1, stateVersion }),
    ...(out2 ? buildTier2Insights(s, out2, { model: model2, latencyMs: lat2, stateVersion, keyMoments: allMoments }) : []),
  ];
  if (insights.length) {
    const { error: iErr } = await deps.supabase.from("copilot_insights").insert(insights);
    if (iErr) throw new CopilotTickError("COPILOT_WRITE_FAILED", iErr.message);
  }

  return {
    status: "succeeded",
    result: {
      tier: out2 ? 2 : 1,
      key_moments: allMoments,
      insights: insights.length,
      state_version: stateVersion,
      new_messages: fresh.length,
    },
  };
}
