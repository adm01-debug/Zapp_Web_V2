/**
 * Orçamento de IA: reserva atômica, liquidação e reconciliação (Bloco 05 / PR-2 — IA-044).
 *
 * Por que este módulo existe:
 *  - a IA não pode ser disparada sem teto de consumo, mas também NÃO PODE PARAR
 *    porque o banco oscilou: a decisão de gasto é do servidor, e uma falha de
 *    infraestrutura degrada para "segue sem reserva", nunca para "derruba a IA";
 *  - o consumo ESTIMADO é uma intenção, não faturamento: só o uso REAL
 *    (`actualTokens`, via `settleBudget`) é confiável para cobrar;
 *  - uma execução interrompida deixa reserva presa se ninguém reconciliar —
 *    `reconcileBudget` existe para devolver essas reservas ao orçamento.
 *
 * Contrato (CONGELADO — consumido por outro módulo):
 *  - `reserveBudget`   → reserva/nega de forma atômica e idempotente (RPC
 *    `ai_budget_reserve`, com `p_idempotency_key` garantindo que repetir a mesma
 *    chave devolve a MESMA reserva, sem dobrar o consumo);
 *  - `settleBudget`    → grava o uso REAL (`actualTokens`) da reserva;
 *  - `releaseBudget`   → libera a reserva de uma execução que não gastou (ou gastou
 *    menos e é liquidada à parte);
 *  - `reconcileBudget` → devolve ao orçamento as reservas órfãs/interrompidas.
 *
 * Regras não negociáveis garantidas aqui:
 *  1. VALORES ESTIMADOS NUNCA SÃO FATURAMENTO CONFIRMADO — `estimatedTokens` só
 *     orienta a reserva; apenas o `actualTokens` de `settleBudget` é uso real.
 *  2. FALHA ABERTA em erro de INFRAESTRUTURA (env ausente, erro da RPC, rede,
 *     corpo inesperado): a IA segue. Devolve `{ id: null, allowed: true, ... }`
 *     com o MOTIVO distinguível no campo `reason` (`missing_env` /
 *     `infrastructure_error`), nunca confundível com uma autorização real (id
 *     presente) nem com uma NEGAÇÃO da RPC (`allowed: false`). Registra em log.
 *  3. ORÇAMENTO DEGENERADO (`limitTokens <= 0` ou `estimatedTokens <= 0`): não há o
 *     que reservar; NÃO chama a RPC e devolve `{ id: null, allowed: true }` com
 *     `reason: "invalid_budget"`. Também é falha aberta por desenho.
 *  4. Cliente/erro no padrão de `_shared/ai-usage.ts`: service role lida do ambiente
 *     (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) e NUNCA um endereço fixo.
 *  5. Só lança `TypeError` por ERRO DE PROGRAMAÇÃO (parâmetro obrigatório
 *     ausente/ inválido), como `_shared/ai-generate.ts`. Falha de infraestrutura
 *     nunca é lançada ao chamador.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";

/** Prefixo do módulo nos logs (mesmo padrão de `[ai-usage]`). */
const LOG_PREFIX = "[ai-budget]";

/**
 * TTL padrão da reserva (ms) quando o chamador não informa `ttlMs`.
 *
 * Precisa EXCEDER o maior prazo de uma chamada de IA para que a reconciliação não
 * libere uma reserva ainda em uso. O teto por capacidade mais longo do projeto
 * (`_shared/ai-generate.ts`, IA-041) é 150s para `audio_sts`; 300s = 5 min dá 2x de
 * folga. É apenas o valor sugerido pelo CHAMADOR: a RPC pode ter o seu próprio default.
 */
const DEFAULT_TTL_MS = 300_000;

/**
 * Motivo pelo qual a reserva NÃO foi criada (resultado de falha aberta ou de
 * orçamento degenerado). Sempre acompanha `id: null` + `allowed: true`.
 */
export type BudgetFallbackReason = "invalid_budget" | "missing_env" | "infrastructure_error";

/**
 * Desfecho documentado de `reserveBudget`:
 *  - `reserved`  → a RPC autorizou e a reserva existe (`id` presente);
 *  - `denied`    → a RPC NEGOU (`allowed: false`; falha FECHADA, não é open);
 *  - os demais (`BudgetFallbackReason`) → reserva não criada, IA segue.
 */
export type BudgetReservationReason = "reserved" | "denied" | BudgetFallbackReason;

/** Parâmetros da reserva (contrato congelado). */
export interface BudgetReserveParams {
  /**
   * Chave de IDEMPOTÊNCIA: repetir a mesma chave devolve a MESMA reserva (a RPC
   * decide), sem dobrar consumo. Obrigatória e não vazia.
   */
  idempotencyKey: string;
  /** Usuário dono do orçamento (uuid). `null`/ausente quando não houver usuário. */
  userId?: string | null;
  /** `ai_usage_logs.function_name` / função de origem. Obrigatória e não vazia. */
  functionName: string;
  /**
   * Consumo ESTIMADO em tokens — só orienta a reserva. NUNCA é faturamento:
   * o valor faturado é o `actualTokens` de `settleBudget`.
   */
  estimatedTokens: number;
  /** Teto de tokens do orçamento em que a reserva é feita. `<= 0` desliga a reserva. */
  limitTokens: number;
  /** Vida da reserva (ms); default `DEFAULT_TTL_MS`. Precisa exceder a chamada real. */
  ttlMs?: number;
}

/** Resultado da reserva (contrato congelado, com campos de motivo aditivos). */
export interface BudgetReservation {
  /** id da reserva; `null` quando NÃO houve reserva (falha aberta / degenerado / negado sem linha). */
  id: string | null;
  /** `true` quando a IA pode seguir. `false` é negação REAL da RPC (falha fechada). */
  allowed: boolean;
  /** Uso já CONFIRMADO no orçamento (tokens liquidados), devolvido pela RPC. */
  usedTokens: number;
  /** Teto de tokens em vigor para o orçamento. */
  limitTokens: number;
  /**
   * CAMPO DOCUMENTADO (aditivo): por que este resultado é o que é. `reserved`/`denied`
   * vêm da RPC; `invalid_budget`/`missing_env`/`infrastructure_error` significam
   * `id: null` + falha aberta. Ausente em consumidores antigos — trate a ausência
   * como reserva normal.
   */
  reason?: BudgetReservationReason;
  /** Detalhe legível (mensagem do banco/env). NUNCA use para decidir; só para log. */
  detail?: string | null;
}

/** Mensagem de erro legível (nunca "undefined"). */
function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Log estruturado do módulo (nunca lança). */
function logWarn(message: string, ctx?: Record<string, unknown>): void {
  console.warn(ctx ? `${LOG_PREFIX} ${message} ${JSON.stringify(ctx)}` : `${LOG_PREFIX} ${message}`);
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

/** Inteiro seguro para parâmetro `integer` da RPC (não-finito vira 0). */
function toSafeInt(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** Primeira linha de um `returns table (...)`, aceitando também um objeto único. */
function firstRow(data: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(data) ? data[0] : data;
  if (typeof candidate === "object" && candidate !== null && !Array.isArray(candidate)) {
    return candidate as Record<string, unknown>;
  }
  return null;
}

/**
 * Client de service role lido do ambiente (mesmo padrão de `_shared/ai-usage.ts`):
 * nenhum endereço/segredo fixo no código. Ausência de env é INFRAESTRUTURA, não bug.
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

/**
 * Falha ABERTA: a IA segue sem reserva, mas o motivo fica distinguível em `reason`
 * e no log. `usedTokens` é 0 porque não houve liquidação; `limitTokens` ecoa o teto
 * pedido pelo chamador para o consumidor manter o shape completo.
 */
function fallbackOpen(
  reason: BudgetFallbackReason,
  detail: string,
  limitTokens: number,
  ctx: Record<string, unknown>,
): BudgetReservation {
  logWarn(`falha aberta (${reason}): ${detail}`, ctx);
  return { id: null, allowed: true, usedTokens: 0, limitTokens, reason, detail };
}

/**
 * Reserva consumo de forma ATÔMICA e IDEMPOTENTE (IA-044).
 *
 * Nunca lança por falha de infraestrutura: env ausente, erro da RPC, exceção de rede
 * ou corpo inesperado devolvem falha aberta (`{ id: null, allowed: true, reason }`).
 * Só lança `TypeError` se `params` estiver malformado (erro de programação).
 */
export async function reserveBudget(p: BudgetReserveParams): Promise<BudgetReservation> {
  if (typeof p !== "object" || p === null) {
    throw new TypeError('reserveBudget: "params" e obrigatorio.');
  }

  // --- validação de programação: só isto lança --------------------------------
  const idempotencyKey = requireNonEmptyString(p.idempotencyKey, "idempotencyKey", "reserveBudget");
  const functionName = requireNonEmptyString(p.functionName, "functionName", "reserveBudget");
  const estimatedRaw = requireFiniteNumber(p.estimatedTokens, "estimatedTokens", "reserveBudget");
  const limitRaw = requireFiniteNumber(p.limitTokens, "limitTokens", "reserveBudget");

  const userId = p.userId ?? null;
  if (userId !== null && typeof userId !== "string") {
    throw new TypeError('reserveBudget: "userId" deve ser string, null ou undefined.');
  }

  // `ttlMs` informado é validado; ausente cai no default do módulo.
  const ttlRaw = p.ttlMs === undefined ? DEFAULT_TTL_MS : requireFiniteNumber(p.ttlMs, "ttlMs", "reserveBudget");
  if (ttlRaw <= 0) {
    throw new TypeError('reserveBudget: "ttlMs" deve ser um numero finito e positivo.');
  }

  // --- (3) orçamento degenerado: não há o que reservar e a IA NÃO para ---------
  if (limitRaw <= 0 || estimatedRaw <= 0) {
    const detail = `limitTokens=${limitRaw}, estimatedTokens=${estimatedRaw}`;
    logWarn("reserva ignorada: orcamento degenerado (sem chamada a RPC)", {
      functionName,
      idempotencyKey,
      limitTokens: limitRaw,
      estimatedTokens: estimatedRaw,
    });
    return { id: null, allowed: true, usedTokens: 0, limitTokens: limitRaw, reason: "invalid_budget", detail };
  }

  // --- (4) env ausente é INFRAESTRUTURA: falha aberta, mas com motivo ---------
  const { client, missingEnv } = createServiceClient();
  if (client === null) {
    return fallbackOpen("missing_env", `env ausente: ${missingEnv}`, limitRaw, {
      functionName,
      idempotencyKey,
      missing: missingEnv,
    });
  }

  // Parâmetros `integer` da RPC: teto para não subestimar (ceil). O valor ESTIMADO
  // só orienta a reserva; nada aqui vira faturamento.
  const estimatedTokens = Math.ceil(estimatedRaw);
  const limitTokens = Math.ceil(limitRaw);
  const ttlMs = Math.ceil(ttlRaw);

  try {
    const { data, error } = await client.rpc("ai_budget_reserve", {
      p_idempotency_key: idempotencyKey,
      p_user_id: userId,
      p_function_name: functionName,
      p_estimated_tokens: estimatedTokens,
      p_limit_tokens: limitTokens,
      p_ttl_ms: ttlMs,
    });

    if (error) {
      return fallbackOpen("infrastructure_error", error.message, limitTokens, {
        functionName,
        idempotencyKey,
        stage: "rpc_error",
      });
    }

    const row = firstRow(data);
    if (row === null) {
      // DECISÃO 0548 (Joaquim): separar dois desfechos que o briefing 7-2 confundia.
      //
      // (a) A RPC EXECUTOU e devolveu LISTA VAZIA. Medido em PostgreSQL descartável: a negação
      // vem como 1 linha (id NULL, allowed=false) — lista vazia é o mesmo veredito sem corpo.
      // É NEGAÇÃO: FECHADO. Tratar como "aberto" liberaria consumo sem veredito.
      if (Array.isArray(data) && data.length === 0) {
        logWarn("ai_budget_reserve devolveu 0 linhas — NEGADO (fail-closed).", {
          functionName,
          idempotencyKey,
          stage: "no_rows",
        });
        return {
          id: null,
          allowed: false,
          usedTokens: 0,
          limitTokens,
          reason: "denied",
          detail: "RPC executou e devolveu 0 linhas: negado por seguranca.",
        };
      }
      // (b) Resposta INUTILIZÁVEL (JSON inválido / corpo inesperado): é FALHA DE INFRAESTRUTURA,
      // não veredito. ABERTO, como o briefing manda, com warn registrado.
      return fallbackOpen("infrastructure_error", "ai_budget_reserve retornou corpo vazio/invalido.", limitTokens, {
        functionName,
        idempotencyKey,
        stage: "bad_shape",
      });
    }

    // `allowed` é decisão da RPC: false é negação REAL (falha FECHADA), não open.
    const allowed = row.allowed === true;
    const id = typeof row.id === "string" && row.id !== "" ? row.id : null;
    const settledLimit = toSafeInt(row.limit_tokens);

    return {
      id,
      allowed,
      usedTokens: toSafeInt(row.used_tokens),
      limitTokens: settledLimit > 0 ? settledLimit : limitTokens,
      reason: allowed ? "reserved" : "denied",
      detail: null,
    };
  } catch (err) {
    return fallbackOpen("infrastructure_error", errorText(err), limitTokens, {
      functionName,
      idempotencyKey,
      stage: "exception",
    });
  }
}

/**
 * Liquida o uso REAL da reserva (IA-044). `actualTokens` é o ÚNICO valor de
 * faturamento; o estimado da reserva não vale como confirmado.
 *
 * Falha de infraestrutura é registrada e ENGOLIDA (o caller não pode ser derrubado
 * por isso). Só lança `TypeError` com `id`/`actualTokens` malformados.
 */
export async function settleBudget(id: string, actualTokens: number): Promise<void> {
  const reservationId = requireNonEmptyString(id, "id", "settleBudget");
  const tokens = requireFiniteNumber(actualTokens, "actualTokens", "settleBudget");
  if (tokens < 0) {
    throw new TypeError('settleBudget: "actualTokens" nao pode ser negativo.');
  }
  // RPC recebe `integer`: arredonda para cima (nunca subestima o uso real).
  const actual = Math.ceil(tokens);

  const { client, missingEnv } = createServiceClient();
  if (client === null) {
    logWarn("liquidacao ignorada: variaveis de ambiente ausentes", { id: reservationId, missing: missingEnv });
    return;
  }

  try {
    const { error } = await client.rpc("ai_budget_settle", {
      p_id: reservationId,
      p_actual_tokens: actual,
    });
    if (error) {
      logWarn("falha ao liquidar reserva", { id: reservationId, error: error.message });
    }
  } catch (err) {
    logWarn("falha ao liquidar reserva", { id: reservationId, error: errorText(err) });
  }
}

/**
 * Libera uma reserva que NÃO será gasta (execução cancelada/erro antes do uso), para
 * devolvê-la ao orçamento (IA-044). Falha de infraestrutura é registrada e engolida.
 * Só lança `TypeError` com `id`/`reason` malformados.
 */
export async function releaseBudget(id: string, reason?: string): Promise<void> {
  const reservationId = requireNonEmptyString(id, "id", "releaseBudget");

  let normalizedReason = "released";
  if (reason !== undefined) {
    if (typeof reason !== "string") {
      throw new TypeError('releaseBudget: "reason" deve ser string quando informado.');
    }
    if (reason.trim() !== "") normalizedReason = reason;
  }

  const { client, missingEnv } = createServiceClient();
  if (client === null) {
    logWarn("liberacao ignorada: variaveis de ambiente ausentes", { id: reservationId, missing: missingEnv });
    return;
  }

  try {
    const { error } = await client.rpc("ai_budget_release", {
      p_id: reservationId,
      p_reason: normalizedReason,
    });
    if (error) {
      logWarn("falha ao liberar reserva", { id: reservationId, error: error.message });
    }
  } catch (err) {
    logWarn("falha ao liberar reserva", { id: reservationId, error: errorText(err) });
  }
}

/**
 * Reconcilia reservas órfãs de execuções interrompidas, devolvendo-as ao orçamento
 * (IA-044). Devolve a quantidade reconciliada pela RPC.
 *
 * Falha de infraestrutura devolve `0` e é registrada em log — o `0` é ambíguo por
 * natureza (nada a reconciliar OU falha); quem chama distingue pelo log, já que o
 * contrato congelado (`Promise<number>`) não comporta um motivo sem quebrar o tipo.
 */
export async function reconcileBudget(): Promise<number> {
  const { client, missingEnv } = createServiceClient();
  if (client === null) {
    logWarn("reconciliacao ignorada: variaveis de ambiente ausentes", { missing: missingEnv });
    return 0;
  }

  try {
    const { data, error } = await client.rpc("ai_budget_reconcile");
    if (error) {
      logWarn("falha ao reconciliar reservas", { error: error.message });
      return 0;
    }
    const reconciled = toSafeInt(data);
    return reconciled > 0 ? reconciled : 0;
  } catch (err) {
    logWarn("falha ao reconciliar reservas", { error: errorText(err) });
    return 0;
  }
}
