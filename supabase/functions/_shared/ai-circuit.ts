/**
 * IA-050 — circuit breaker por provedor de IA (Bloco 05, pendência do PR #1602).
 *
 * Por que este módulo existe:
 *  - antes dele, `generateWithRouting` retentava a falha transitória e devolvia
 *    erro explícito, mas NUNCA suspendia um provedor que só falha: cada request
 *    novo voltava a bater no provedor caído (fetch + prazo cheio + custo) —
 *    era a degradação honesta sem a abertura de circuito (IA-CIRCUIT-001);
 *  - o desenho de reuso (IA-007 §4) manda ESTENDER o ledger existente e NÃO
 *    criar subsistema: o estado do circuito é DERIVADO de `ai_usage_logs`
 *    (a rota efetiva já é gravada em `metadata.provider_id` desde a IA-052),
 *    e a sonda da meia-abertura usa o contador atômico que já existe
 *    (`ai_rate_limit_hit` sobre `edge_rate_limits`, IA-043) — nenhuma tabela
 *    nova, nenhuma migration.
 *
 * Máquina de estados (por `provider_id`, dentro do despacho central):
 *  - CLOSED: menos de `failureThreshold` falhas CONSECUTIVAS na janela —
 *    a chamada segue normal;
 *  - OPEN: `failureThreshold` ou mais falhas consecutivas com a mais recente
 *    dentro do `cooldownMs` — a tentativa é BLOQUEADA sem fetch e devolve
 *    erro explícito (`503/CIRCUIT_OPEN` no despacho); nunca resposta vazia
 *    apresentada como análise concluída;
 *  - HALF_OPEN: a última falha já passou do `cooldownMs` — UMA sonda é
 *    admitida por janela de recuperação, decidida pelo contador atômico
 *    (`sharedRateLimit`, limite 1). Sucesso da sonda grava 'success' no
 *    ledger e fecha o circuito; fracasso grava 'error' e reabre por mais um
 *    cooldown.
 *
 * Limites de escopo definidos (o que o circuito NÃO faz):
 *  - escopo por PROVEDOR (`provider_id`), não por usuário nem por função —
 *    um provedor aberto bloqueia a si mesmo, as demais capacidades/funções
 *    seguem o roteamento normal;
 *  - NUNCA escreve em `ai_providers.is_active`: desligar a capacidade é
 *    decisão humana (IA-009/IA-039), e o desligamento não impede o
 *    atendimento humano — o bloqueio devolve `ok:false` explícito;
 *  - só contam desfechos REAIS do provedor (`status` 'success'/'error' no
 *    ledger): bloqueios (`circuit_open`), rejeições do PEDIDO (`request_error`,
 *    4xx), negações de orçamento e falhas de roteamento sem rota não alimentam
 *    nem quebram a sequência;
 *  - falha ABERTA quando a observabilidade falha (env ausente, erro de
 *    leitura do ledger, RPC da sonda indisponível): a IA segue e o motivo
 *    fica em `detail`/`source: "unavailable"` — distinguível de um veredito
 *    real, no mesmo padrão de `ai-budget`/`ai-guards`.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { sharedRateLimit } from "./ai-guards.ts";

const LOG_PREFIX = "[ai-circuit]";

/** Limiar de falhas CONSECUTIVAS na janela que abre o circuito. */
export const AI_CIRCUIT_FAILURE_THRESHOLD = 5;
/** Janela de observação das falhas no ledger (ms). */
export const AI_CIRCUIT_WINDOW_MS = 300_000; // 5 min
/** Cooldown até a meia-abertura admitir uma sonda (ms). */
export const AI_CIRCUIT_COOLDOWN_MS = 60_000; // 1 min
/** Prefixo da chave da sonda em `edge_rate_limits` (via `sharedRateLimit`). */
export const AI_CIRCUIT_PROBE_KEY_PREFIX = "ai:circuit-probe:";

export type AiCircuitState = "closed" | "open" | "half_open";

/** Overrides do circuito (testes/tuning); ausente → constantes do módulo. */
export interface AiCircuitConfig {
  failureThreshold?: number;
  windowMs?: number;
  cooldownMs?: number;
}

/** Linha mínima do ledger necessária para derivar o estado. */
export interface CircuitLedgerRow {
  status: string | null;
  created_at: string | null;
}

/** Veredito puro do circuito (derivado das linhas do ledger). */
export interface AiCircuitVerdict {
  state: AiCircuitState;
  consecutiveFailures: number;
  /** Timestamp (ms) da falha mais recente da sequência; null sem falha. */
  lastFailureAtMs: number | null;
}

/** Admissão de uma chamada ao provedor (veredito + proveniência). */
export interface AiProviderAdmission {
  /** false = bloqueado pelo circuito (sem fetch ao provedor). */
  allowed: boolean;
  state: AiCircuitState;
  consecutiveFailures: number;
  /** 'ledger' = veredito real do ledger; 'unavailable' = falha aberta de observabilidade. */
  source: "ledger" | "unavailable";
  /** Motivo legível da falha aberta (nunca use para decidir; só para log). */
  detail?: string;
}

/** Desfechos que contam como resultado REAL de chamada ao provedor. */
const OUTCOME_STATUSES: ReadonlySet<string> = new Set(["success", "error"]);

/** Normaliza overrides: valor inválido cai na constante (nunca circuito sem limiar). */
function normalizeConfig(config: AiCircuitConfig): Required<AiCircuitConfig> {
  const t = config.failureThreshold;
  const w = config.windowMs;
  const c = config.cooldownMs;
  return {
    failureThreshold: Number.isInteger(t) && (t as number) >= 1
      ? (t as number)
      : AI_CIRCUIT_FAILURE_THRESHOLD,
    windowMs: typeof w === "number" && Number.isFinite(w) && w > 0 ? w : AI_CIRCUIT_WINDOW_MS,
    cooldownMs: typeof c === "number" && Number.isFinite(c) && c > 0 ? c : AI_CIRCUIT_COOLDOWN_MS,
  };
}

/**
 * Deriva o estado do circuito das linhas do ledger (`status` + `created_at`,
 * preferencialmente ordenadas da mais nova para a mais antiga — a função é
 * defensiva e não exige a ordem para não contar errado).
 *
 * Regras:
 *  - só `status` 'success'/'error' dentro da janela são desfecho de provedor;
 *    'circuit_open', 'denied', etc. são ignorados (não contam nem quebram a
 *    sequência — senão o próprio bloqueio alimentaria/esvaziaria o limiar);
 *  - `success` encerra a sequência de falhas (recuperação = fechamento);
 *  - `consecutiveFailures >= failureThreshold` → OPEN enquanto a falha mais
 *    recente estiver dentro do cooldown; depois disso, HALF_OPEN.
 */
export function deriveCircuitVerdict(
  rows: readonly CircuitLedgerRow[],
  nowMs: number,
  config: AiCircuitConfig = {},
): AiCircuitVerdict {
  const cfg = normalizeConfig(config);
  const cutoffMs = nowMs - cfg.windowMs;

  let consecutiveFailures = 0;
  let lastFailureAtMs: number | null = null;

  // Ordena por created_at desc dentro da função: a derivação não pode depender
  // de o chamador ter ordenado certo.
  const linhas = (Array.isArray(rows) ? rows : [])
    .map((row) => ({ status: row?.status, ts: Date.parse(row?.created_at ?? "") }))
    .filter((row) => Number.isFinite(row.ts) && row.ts >= cutoffMs)
    .sort((a, b) => b.ts - a.ts);

  for (const linha of linhas) {
    if (!OUTCOME_STATUSES.has(linha.status ?? "")) continue;
    // O sucesso mais recente encerra a sequência: recuperação = fechamento.
    if (linha.status === "success") break;
    consecutiveFailures++;
    if (lastFailureAtMs === null) lastFailureAtMs = linha.ts;
  }

  if (consecutiveFailures < cfg.failureThreshold) {
    return { state: "closed", consecutiveFailures, lastFailureAtMs };
  }
  const abertoDesde = lastFailureAtMs as number;
  return {
    state: nowMs - abertoDesde >= cfg.cooldownMs ? "half_open" : "open",
    consecutiveFailures,
    lastFailureAtMs,
  };
}

/** Mensagem de erro legível (mesmo helper dos módulos irmãos). */
function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Client de service role lido do ambiente (mesmo padrão de `ai-budget.ts`):
 * nenhum endereço/segredo fixo. Env ausente é INFRAESTRUTURA → falha aberta.
 */
function createServiceClient(): { client: SupabaseClient | null; missingEnv: string | null } {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const missing: string[] = [];
  if (!url) missing.push("SUPABASE_URL");
  if (!key) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return { client: null, missingEnv: missing.join(", ") };
  return { client: createClient(url, key), missingEnv: null };
}

function failOpen(detail: string): AiProviderAdmission {
  console.warn(`${LOG_PREFIX} falha aberta: ${detail}`);
  return { allowed: true, state: "closed", consecutiveFailures: 0, source: "unavailable", detail };
}

/**
 * Decide se a próxima chamada ao provedor pode acontecer (IA-050).
 *
 * Nunca lança por falha de infraestrutura: env ausente, erro de leitura do
 * ledger ou RPC da sonda devolvem `allowed: true` com `source: "unavailable"`
 * — a observabilidade quebrada não pode derrubar a IA (degradação honesta é
 * do despacho). Só um veredito do ledger (`source: "ledger"`) bloqueia.
 */
export async function admitAiProviderCall(
  providerId: string | null | undefined,
  config: AiCircuitConfig = {},
): Promise<AiProviderAdmission> {
  const cfg = normalizeConfig(config);
  if (typeof providerId !== "string" || providerId.trim() === "") {
    return failOpen("provider_id ausente — sem chave de circuito, a chamada segue");
  }
  const circuitKey = providerId.trim().toLowerCase();

  const { client, missingEnv } = createServiceClient();
  if (client === null) {
    return failOpen(`env ausente: ${missingEnv}`);
  }

  const nowMs = Date.now();
  const since = new Date(nowMs - cfg.windowMs).toISOString();
  let rows: CircuitLedgerRow[];
  try {
    // Só desfechos reais do provedor deste circuito, mais novos primeiro.
    const { data, error } = await client
      .from("ai_usage_logs")
      .select("status, created_at")
      .eq("metadata->>provider_id", circuitKey)
      .in("status", ["success", "error"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(Math.max(cfg.failureThreshold * 2, 16));
    if (error) {
      return failOpen(`leitura do ledger falhou: ${error.message}`);
    }
    rows = (data ?? []) as CircuitLedgerRow[];
  } catch (err) {
    return failOpen(`leitura do ledger lançou: ${errorText(err)}`);
  }

  const verdict = deriveCircuitVerdict(rows, nowMs, cfg);
  if (verdict.state === "closed") {
    return {
      allowed: true,
      state: "closed",
      consecutiveFailures: verdict.consecutiveFailures,
      source: "ledger",
    };
  }
  if (verdict.state === "open") {
    return {
      allowed: false,
      state: "open",
      consecutiveFailures: verdict.consecutiveFailures,
      source: "ledger",
    };
  }

  // HALF_OPEN: UMA sonda por janela de recuperação, decidida pelo contador
  // atômico `ai_rate_limit_hit` (edge_rate_limits) — único hit vale a sonda;
  // o resto da janela bloqueia. Falha da RPC → falha aberta (a IA segue).
  try {
    const sonda = await sharedRateLimit({
      key: `${AI_CIRCUIT_PROBE_KEY_PREFIX}${circuitKey}`,
      limit: 1,
      windowSeconds: Math.max(1, Math.ceil(cfg.cooldownMs / 1000)),
    });
    return {
      allowed: sonda.allowed,
      state: "half_open",
      consecutiveFailures: verdict.consecutiveFailures,
      source: "ledger",
    };
  } catch (err) {
    return {
      allowed: true,
      state: "half_open",
      consecutiveFailures: verdict.consecutiveFailures,
      source: "unavailable",
      detail: `sonda indisponivel: ${errorText(err)}`,
    };
  }
}
