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
  /**
   * IA-053 — consumo DESCONHECIDO (não medido).
   *
   * Existe para separar dois casos que hoje caem no mesmo número: "medi e deu
   * zero" e "não consegui medir". A etapa é textual: o caminho de streaming não
   * pode "receber custo zero por falta de dados". Quando isto é `true`, as
   * colunas de token vão **NULL** (não 0) e o `metadata` marca
   * `usage_unknown: true` — qualquer relatório que trate ausência como zero
   * passa a ter como distinguir, e um número estimado pode ser gravado em
   * `metadata.usage_estimate` sem se passar por medição.
   */
  usageUnknown?: boolean;
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
  // IA-053 — consumo não medido é DECLARADO, não silenciado: quem lê a linha
  // sabe que o número não existe (em vez de supor que foi zero).
  if (entry.usageUnknown === true) {
    rota.usage_unknown = true;
  }
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
      // IA-053 — TRI-ESTADO dos tokens: número medido (inclusive 0) ou NULL
      // quando não houve medição. Antes, `|| 0` fazia "não medido" virar zero e
      // o caminho de streaming entrava nos relatórios com custo zero.
      input_tokens: entry.usageUnknown === true ? null : (entry.inputTokens ?? 0),
      output_tokens: entry.usageUnknown === true ? null : (entry.outputTokens ?? 0),
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

// ---------------------------------------------------------------------------
// IA-053 — streaming: medir o que dá para medir e DECLARAR o que não deu
// ---------------------------------------------------------------------------

/** O que se conseguiu observar de um stream entregue ao cliente. */
export interface StreamOutcome {
  /** O stream acabou sozinho (o provedor mandou o fim). */
  completed: boolean;
  /** O cliente desligou no meio: a saída foi PARCIAL. */
  cancelled: boolean;
  /** Bytes e chunks que passaram: fato medido, o lastro de qualquer estimativa. */
  bytes: number;
  chunks: number;
  /** Uso declarado pelo provedor no próprio stream — `null` quando ele não declara. */
  usage: { inputTokens: number; outputTokens: number } | null;
  /** Falha que interrompeu o stream, quando houve. */
  error: string | null;
}

/** Quanto da cauda do stream é guardado para procurar o `usage` final. */
const CAUDA_MAXIMA = 16_384;

/**
 * Extrai o `usage` de um stream SSE (formato OpenAI-compatible).
 *
 * O bloco de uso vem no ÚLTIMO chunk. Linha parcial (chunk cortado no meio),
 * `[DONE]` e JSON inválido são IGNORADOS de propósito: um JSON incompleto não
 * pode virar número — vira ausência declarada, que é o que a etapa exige.
 */
export function extrairUsageDoStream(
  texto: string,
): { inputTokens: number; outputTokens: number } | null {
  let achado: { inputTokens: number; outputTokens: number } | null = null;
  for (const linha of texto.split("\n")) {
    const conteudo = linha.trim();
    if (!conteudo.startsWith("data:")) continue;
    const payload = conteudo.slice("data:".length).trim();
    if (payload === "" || payload === "[DONE]") continue;
    let objeto: unknown;
    try {
      objeto = JSON.parse(payload);
    } catch {
      continue;
    }
    const uso = (objeto as { usage?: unknown } | null)?.usage;
    if (typeof uso !== "object" || uso === null) continue;
    const bruto = uso as { prompt_tokens?: unknown; completion_tokens?: unknown };
    achado = {
      inputTokens: Number(bruto.prompt_tokens ?? 0),
      outputTokens: Number(bruto.completion_tokens ?? 0),
    };
  }
  return achado;
}

/**
 * Embrulha o corpo de um stream para medir o que passa por ele, sem atrasar nem
 * alterar um byte do que o cliente recebe.
 *
 * Por que embrulhar em vez de registrar antes de devolver: num stream o consumo
 * só existe no FIM (o `usage` chega no último chunk) e o cancelamento só é
 * observável quando o cliente desliga. Registrar antes seria registrar um chute;
 * registrar depois do `return` nunca acontece — era exatamente o defeito: a
 * chamada paga de streaming não gerava linha nenhuma em `ai_usage_logs`.
 *
 * `aoTerminar` é chamado EXATAMENTE UMA VEZ — no fim, no cancelamento ou no
 * erro. O chamador deve entregar a promessa a `logAiUsageDetached` (que usa
 * `EdgeRuntime.waitUntil`) para o registro não se perder quando a função
 * encerrar.
 */
export function medirStream(
  corpo: ReadableStream<Uint8Array> | null,
  aoTerminar: (desfecho: StreamOutcome) => void | Promise<void>,
): ReadableStream<Uint8Array> | null {
  if (corpo === null) return null;

  const leitor = corpo.getReader();
  const decodificador = new TextDecoder();
  let bytes = 0;
  let chunks = 0;
  let cauda = "";
  let encerrado = false;

  const encerrar = async (parcial: Partial<StreamOutcome>): Promise<void> => {
    if (encerrado) return;
    encerrado = true;
    await aoTerminar({
      completed: parcial.completed ?? false,
      cancelled: parcial.cancelled ?? false,
      bytes,
      chunks,
      usage: extrairUsageDoStream(cauda),
      error: parcial.error ?? null,
    });
  };

  return new ReadableStream<Uint8Array>({
    async pull(controlador) {
      try {
        const { done, value } = await leitor.read();
        if (done) {
          controlador.close();
          await encerrar({ completed: true });
          return;
        }
        if (value) {
          chunks += 1;
          bytes += value.byteLength;
          cauda = (cauda + decodificador.decode(value, { stream: true })).slice(-CAUDA_MAXIMA);
          controlador.enqueue(value);
        }
      } catch (erro) {
        const motivo = erro instanceof Error ? erro.message : String(erro);
        try {
          controlador.error(erro);
        } catch {
          // Controlador já fechado: o que importa aqui é o registro do desfecho.
        }
        await encerrar({ error: motivo });
      }
    },
    async cancel(motivo) {
      try {
        await leitor.cancel(motivo);
      } catch {
        // Cancelar um stream já encerrado não é falha para quem cancela.
      }
      await encerrar({ cancelled: true });
    },
  });
}
