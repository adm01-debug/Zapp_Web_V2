/**
 * Shared AI Usage Logger for Edge Functions.
 * Logs token consumption per user to ai_usage_logs table.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { MODALITIES, type AiModality } from "./ai-capabilities.ts";

interface AiUsageEntry {
  functionName: string;
  userId?: string | null;
  profileId?: string | null;
  model?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  status?: string;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
  /**
   * IA-051 — correlação da execução. Ver `normalizeCorrelationId`: o campo é
   * uuid ou nada. Aceitar string livre aqui abriria a porta para gravar e-mail,
   * telefone ou id de contato dentro de um log — exatamente o que a etapa
   * proíbe ("sem usar dado pessoal como identificador de log").
   */
  requestId?: string | null;
  /** IA-051 — job da fila que originou a execução, quando veio do worker. */
  jobId?: string | null;
  /** IA-051 — tentativa do job (`ai_jobs.attempt_count`) no momento da chamada. */
  attempt?: number | null;

  /**
   * IA-052 — ROTA EFETIVA: o que REALMENTE atendeu esta execução.
   *
   * A etapa é explícita: "não inferir provedor apenas pela configuração padrão".
   * Por isso estes campos carregam o que o servidor MEDIU — o provedor que foi
   * escolhido e o modelo que a resposta trouxe — e ficam NULOS quando a chamada
   * nem chegou a ter provedor (falha de roteamento, entrada inválida). Nulo aqui
   * é informação: quer dizer "não houve rota", nunca "não conferi".
   */
  providerId?: string | null;
  providerType?: string | null;
  providerName?: string | null;
  /** Finalidade declarada pelo chamador (`AiPurpose`). */
  purpose?: string | null;
  /** Modalidade da chamada (`AiModality`): texto, visão ou áudio. */
  modality?: string | null;
  /** Modelo PEDIDO. O efetivo é a coluna `model`, que vem da resposta do provedor. */
  modelRequested?: string | null;
  /** Se a execução foi atendida por um provedor de fallback. */
  fallbackUsed?: boolean | null;
}

/** Extract token counts from OpenAI-compatible response */
export function extractTokenUsage(data: Record<string, unknown>): {
  inputTokens: number;
  outputTokens: number;
  model: string | null;
} {
  const usage = data?.usage as Record<string, unknown> | undefined;
  return {
    inputTokens: Number(usage?.prompt_tokens ?? 0),
    outputTokens: Number(usage?.completion_tokens ?? 0),
    model: (data?.model as string) || null,
  };
}

/**
 * IA-051 — normaliza um identificador de correlação.
 *
 * Regra única: só uuid v4/v1 canônico passa; qualquer outra coisa vira `null`.
 * Isso é o enforcement de "sem dado pessoal como identificador de log": um
 * e-mail (`fulano@x.com`), um telefone (`5511999998888`) ou o `contactId` da
 * identidade do IA-048 não casam com o formato e são descartados — o campo
 * nunca vira depósito de PII por descuido de um chamador futuro.
 */
export function normalizeCorrelationId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return null;
  }
  return trimmed.toLowerCase();
}

/**
 * IA-051 — normaliza o número da tentativa.
 *
 * `ai_jobs.attempt_count` é um contador inteiro e pequeno; a coluna é
 * `smallint`. Valores fora de faixa ou fracionários são descartados em vez de
 * derrubar o insert do log (registrar consumo não pode falhar por metadado).
 */
export function normalizeAttempt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 32767) return null;
  return parsed;
}

/** Texto limpo ou `null` — nunca string vazia nem sobra de espaço no log. */
function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * IA-052 — modalidade validada contra a lista canônica de `ai-capabilities.ts`.
 *
 * Mesma fonte de verdade que o roteador usa para escolher o provedor: se a
 * modalidade não está lá, ela não existe — e gravar um valor livre abriria a
 * porta para o log virar depósito de string arbitrária. Desconhecida vira
 * `null` (ausência declarada), nunca um palpite.
 */
export function normalizeModality(value: unknown): AiModality | null {
  if (typeof value !== "string") return null;
  const candidato = value.trim().toLowerCase();
  return (MODALITIES as readonly string[]).includes(candidato)
    ? (candidato as AiModality)
    : null;
}

/**
 * IA-052 — monta o `metadata` do log com a ROTA EFETIVA anexada.
 *
 * Por que a rota vive aqui e não em colunas próprias: promover coluna obrigaria
 * a regenerar `types.ts`, catálogo e manifesto de schema, e neste projeto essa
 * regeneração depende de credencial que os chats não têm — foi justamente uma
 * migration aplicada sem os derivados no repo que deixou o DB Live Guard
 * vermelho na main. A rota é dado novo de auditoria: entra agora, sem travar o
 * pipeline, e a promoção a coluna (com índice para os relatórios da IA-055/056)
 * fica registrada como pendência declarada.
 *
 * Precedência: a rota MEDIDA pelo servidor vence chave homônima do chamador —
 * um chamador não pode "inventar" o provedor que atendeu. As demais chaves que
 * o chamador mandou são preservadas.
 */
function buildUsageMetadata(entry: AiUsageEntry): Record<string, unknown> {
  const rota: Record<string, unknown> = {
    fallback_used: entry.fallbackUsed === true,
  };
  const medidas: Record<string, unknown> = {
    provider_id: normalizeCorrelationId(entry.providerId),
    provider_type: textOrNull(entry.providerType),
    provider_name: textOrNull(entry.providerName),
    purpose: textOrNull(entry.purpose),
    modality: normalizeModality(entry.modality),
    model_requested: textOrNull(entry.modelRequested),
  };
  for (const [chave, valor] of Object.entries(medidas)) {
    // Nulo NÃO sobrescreve: o chamador pode saber algo que o registrador não.
    if (valor !== null) rota[chave] = valor;
  }
  return { ...(entry.metadata ?? {}), ...rota };
}

/** IA-051 — header em que o cliente manda o id opaco da operação de IA. */
export const AI_REQUEST_ID_HEADER = "x-ai-request-id";

/** IA-051 — lê o id de correlação enviado pelo cliente (uuid ou nada). */
export function extractAiRequestId(req: Request): string | null {
  return normalizeCorrelationId(req.headers.get(AI_REQUEST_ID_HEADER));
}

/** Extract user ID from Authorization header (JWT) */
export function extractUserIdFromRequest(req: Request): string | null {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) return null;
    const token = authHeader.replace('Bearer ', '');
    // Decode JWT payload (no verification needed, just extraction)
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.sub || null;
  } catch {
    return null;
  }
}

/** Resolve profile_id from user_id via profiles table */
// deno-lint-ignore no-explicit-any
async function resolveProfileId(
  supabase: any,
  userId: string | null | undefined
): Promise<string | null> {
  if (!userId) return null;
  try {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    return (data as Record<string, unknown>)?.id as string || null;
  } catch {
    return null;
  }
}

/**
 * `EdgeRuntime` é um global do runtime do Supabase Edge Functions e pode NÃO
 * existir no Deno local nem na suíte de testes. Declaramos o tipo (opcional)
 * apenas para poder checá-lo com segurança de tipos; em runtime a referência
 * resolve para o global, e a guarda abaixo trata o caso de ele não existir.
 */
declare const EdgeRuntime: { waitUntil?: (promise: Promise<unknown>) => void } | undefined;

/**
 * Log AI usage WITHOUT blocking the response and WITHOUT losing the record.
 *
 * `logAiUsage` continua sendo AGUARDADA pelo chamador. Esta variante existe para
 * os pontos em que a resposta ao usuário não pode esperar o insert (ex.: o
 * `ai-proxy`). Em vez de descartar a promessa com `void` — o que transforma o
 * consumo PAGO em registro perdido se a função encerrar antes do insert —
 * registramos a promessa em `EdgeRuntime.waitUntil` quando o runtime o oferece,
 * para que a função só encerre após o insert concluir. Quando `waitUntil` NÃO
 * existe (Deno local/teste), caímos no `await`, garantindo a gravação de forma
 * síncrona ao chamador. A promessa NUNCA é descartada: é exatamente esse
 * vazamento que esta função corrige.
 */
export async function logAiUsageDetached(entry: AiUsageEntry): Promise<void> {
  const promise = logAiUsage(entry);
  if (typeof EdgeRuntime !== "undefined" && typeof EdgeRuntime.waitUntil === "function") {
    EdgeRuntime.waitUntil(promise);
    return;
  }
  await promise;
}

/** Log AI usage to database (fire-and-forget, non-blocking) */
export async function logAiUsage(entry: AiUsageEntry): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Auto-resolve profile_id if not provided
    const profileId = entry.profileId || await resolveProfileId(supabase, entry.userId);

    await supabase.from('ai_usage_logs').insert({
      user_id: entry.userId || null,
      profile_id: profileId,
      function_name: entry.functionName,
      model: entry.model || null,
      input_tokens: entry.inputTokens || 0,
      output_tokens: entry.outputTokens || 0,
      duration_ms: entry.durationMs || null,
      status: entry.status || 'success',
      error_message: entry.errorMessage || null,
      // IA-052 — rota efetiva anexada aqui, num lugar só: nenhum chamador
      // precisa lembrar do formato, e o que o servidor mediu não se perde.
      metadata: buildUsageMetadata(entry),
      // IA-051 — correlação ponta a ponta. Passa pelo normalizador para que
      // nenhum dado pessoal atravesse este caminho, mesmo por engano.
      request_id: normalizeCorrelationId(entry.requestId),
      job_id: normalizeCorrelationId(entry.jobId),
      attempt: normalizeAttempt(entry.attempt),
    });
  } catch (e) {
    // Never throw — logging failures must not break the main flow
    console.warn(`[ai-usage] Failed to log: ${e instanceof Error ? e.message : String(e)}`);
  }
}
