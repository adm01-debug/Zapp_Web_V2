/**
 * Shared AI Usage Logger for Edge Functions.
 * Logs token consumption per user to ai_usage_logs table.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { MODALITIES, type AiModality } from "./ai-capabilities.ts";
import { verifyHmacSignature } from "./hmac-validation.ts";

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

/**
 * R2-API-032 — consumo REAL do diagnóstico de provedor do `ai-proxy` (`test: true`).
 *
 * O diagnóstico chama o provedor DE VERDADE (chamada paga) só para verificar
 * conectividade; por isso o consumo tem de ser registrado mesmo ficando fora da
 * cota diária do guard. A linha leva finalidade PRÓPRIA (`provider_test`) e o
 * `provider_id` efetivamente testado — nunca se confunde com geração
 * operacional. `usageUnknown` preserva o tri-estado da IA-053: quando o stream
 * ou a falha impedem a medição, os tokens vão NULL, nunca zero.
 */
export async function registrarConsumoDeDiagnostico(diag: {
  userId?: string | null;
  providerId?: string | null;
  providerType?: string | null;
  providerName?: string | null;
  model?: string | null;
  ok: boolean;
  code?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  usageUnknown?: boolean;
  durationMs: number;
  requestId?: string | null;
}): Promise<void> {
  await logAiUsageDetached({
    functionName: 'ai-proxy',
    userId: diag.userId ?? null,
    providerId: diag.providerId ?? null,
    providerType: diag.providerType ?? null,
    providerName: diag.providerName ?? null,
    purpose: 'provider_test',
    modality: 'text',
    modelRequested: null,
    model: diag.model ?? null,
    inputTokens: diag.inputTokens ?? undefined,
    outputTokens: diag.outputTokens ?? undefined,
    usageUnknown: diag.usageUnknown,
    durationMs: diag.durationMs,
    status: diag.ok ? 'success' : 'error',
    errorMessage: diag.ok ? null : (diag.code ?? null),
    requestId: diag.requestId ?? null,
    metadata: { provider_test: true, test_code: diag.code ?? null },
  });
}

// ---------------------------------------------------------------------------
// IA-TIMEOUT-001 — log essencial durável com pendência na outbox
// ---------------------------------------------------------------------------
// Mantém a base de 3abda0372: chave estável e retentativa só do transitório.
// A diferença é a garantia exigida pelo schema pai: toda falha remanescente vai
// para `ai_usage_outbox`, e o reprocessamento lê a própria fila e só dá baixa
// depois de confirmar a entrega em `ai_usage_logs`.

/** Teto de tentativas do insert do log essencial (1 + reenvios). */
const MAX_TENTATIVAS_LOG = 3;

/**
 * Teto de reprocessamentos de uma pendência da outbox. Acima dele a pendência
 * recebe BAIXA EXPLÍCITA (`motivo` + `processed_at`): uma linha venenosa não
 * pode ficar para sempre na frente da fila bloqueando pendências válidas.
 */
const MAX_TENTATIVAS_REPROCESSO = 5;

/**
 * Chave de idempotência da linha de log: SHA-256 hex dos campos estáveis.
 * O próprio `metadata.log_key` não entra no cálculo.
 */
export async function chaveDeLog(linha: Record<string, unknown>): Promise<string> {
  const metadata = (linha.metadata ?? {}) as Record<string, unknown>;
  const provider: Record<string, unknown> = {};
  for (const chave of Object.keys(metadata).filter((k) => k.startsWith("provider_")).sort()) {
    provider[chave] = metadata[chave];
  }
  const estavel = {
    function_name: linha.function_name ?? null,
    user_id: linha.user_id ?? null,
    model: linha.model ?? null,
    input_tokens: linha.input_tokens ?? null,
    output_tokens: linha.output_tokens ?? null,
    duration_ms: linha.duration_ms ?? null,
    status: linha.status ?? null,
    error_message: linha.error_message ?? null,
    request_id: linha.request_id ?? null,
    job_id: linha.job_id ?? null,
    attempt: linha.attempt ?? null,
    provider,
  };
  const resumo = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(estavel)),
  );
  return [...new Uint8Array(resumo)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function cabecalhosRest(serviceRoleKey: string): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

const CODIGOS_TRANSITORIOS_DE_LOG = new Set([
  "08000",
  "08003",
  "08006",
  "53300",
  "57014",
  "57P01",
  "57P02",
  "57P03",
  "58000",
  "58030",
]);

export function classificarStatusDoErroDeLog(error: { status?: unknown; code?: unknown }): number {
  const statusBruto = error.status;
  const status = typeof statusBruto === "number" ? statusBruto : Number(statusBruto);
  if (Number.isInteger(status) && status >= 100 && status <= 599) return status;

  const code = typeof error.code === "string" ? error.code.trim().toUpperCase() : "";
  if (CODIGOS_TRANSITORIOS_DE_LOG.has(code)) return 503;
  if (/^PGRST\d+$/u.test(code) || /^[0-9A-Z]{5}$/u.test(code)) return 400;

  // Sem status/código reconhecido, permanece transitório: melhor retentar e
  // enfileirar na outbox do que classificar como perda permanente sem evidência.
  return 503;
}

interface ResultadoInsertLogEssencial {
  ok: boolean;
  status: number;
}

async function inserirLinhaDeLog(
  url: string,
  chave: string,
  linha: Record<string, unknown>,
): Promise<ResultadoInsertLogEssencial> {
  const supabase = createClient(url, chave);
  const { error } = await supabase.from("ai_usage_logs").insert(linha);
  if (!error) return { ok: true, status: 201 };

  return {
    ok: false,
    status: classificarStatusDoErroDeLog(error as { status?: unknown; code?: unknown }),
  };
}

/** Há linha com esta `log_key`? Lança quando a própria checagem falha. */
async function existeLinhaDeLog(url: string, chave: string, logKey: string): Promise<boolean> {
  const resposta = await fetch(
    `${url}/rest/v1/ai_usage_logs?select=id&metadata-%3E%3Elog_key=eq.${encodeURIComponent(logKey)}&limit=1`,
    { headers: cabecalhosRest(chave) },
  );
  const corpo = await resposta.text();
  if (!resposta.ok) throw new Error(`checagem de log_key falhou: HTTP ${resposta.status}`);
  const linhas = JSON.parse(corpo) as unknown;
  return Array.isArray(linhas) && linhas.length > 0;
}

function statusTransitorioDeLog(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

async function gravarLogEssencial(
  url: string,
  chave: string,
  linha: Record<string, unknown>,
  logKey: string,
): Promise<"gravado" | "falhou"> {
  for (let tentativa = 0; tentativa < MAX_TENTATIVAS_LOG; tentativa++) {
    if (tentativa > 0) {
      try {
        if (await existeLinhaDeLog(url, chave, logKey)) return "gravado";
      } catch {
        continue;
      }
    }
    try {
      const resposta = await inserirLinhaDeLog(url, chave, linha);
      if (resposta.ok) return "gravado";
      if (!statusTransitorioDeLog(resposta.status)) return "falhou";
    } catch {
      // Sem resposta: a próxima volta confere a existência antes de reenviar.
    }
  }
  return "falhou";
}

/**
 * Enfileira na outbox a linha do log essencial que NÃO pôde ser entregue.
 *
 * `true` SÓ quando o PostgREST confirma a escrita (`resposta.ok`): conflito de
 * unicidade, alvo inexistente, 4xx/5xx ou rede fora contam como FALHA e sobem
 * para `registrarFalhaDeLog`, que emite o marcador de último recurso. Nenhum
 * caminho pode tratar a tentativa de escrita como pendência durável sem isso.
 */
async function gravarNaOutbox(
  url: string,
  chave: string,
  linha: Record<string, unknown>,
  motivo: string,
): Promise<boolean> {
  try {
    const resposta = await fetch(`${url}/rest/v1/ai_usage_outbox`, {
      method: "POST",
      headers: { ...cabecalhosRest(chave), Prefer: "return=minimal" },
      body: JSON.stringify({ payload: { linha }, motivo }),
    });
    try { await resposta.text(); } catch { /* resposta sem corpo */ }
    return resposta.ok;
  } catch {
    return false;
  }
}

/**
 * Atualiza (ou dá baixa em) uma pendência da outbox pelo `id`.
 *
 * `true` SÓ quando o PATCH confirma (`resposta.ok`). Todo chamador é obrigado a
 * olhar o retorno: PATCH recusado = a linha continua como estava.
 */
async function atualizarPendencia(
  url: string,
  chave: string,
  id: string,
  campos: Record<string, unknown>,
): Promise<boolean> {
  try {
    const resposta = await fetch(
      `${url}/rest/v1/ai_usage_outbox?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { ...cabecalhosRest(chave), Prefer: "return=minimal" },
        body: JSON.stringify(campos),
      },
    );
    try { await resposta.text(); } catch { /* resposta sem corpo */ }
    return resposta.ok;
  } catch {
    return false;
  }
}

export interface ResultadoReprocessamentoLogEssencial {
  lidos: number;
  entregues: number;
  pendentes: number;
  /**
   * Baixas definitivas COM motivo: payload inválido ou teto de tentativas
   * atingido. Não é entrega, não é pendência: é saída explícita da fila.
   */
  esgotadas: number;
  falha: string | null;
}

/**
 * Lê pendências da outbox, tenta entregá-las e só preenche `processed_at`
 * depois de a linha existir em `ai_usage_logs`. Falha de entrega ou de baixa
 * deixa o item pendente para a próxima execução.
 *
 * A fila é lida por `tentativas.asc,created_at.asc`: quem menos tentou vai
 * primeiro, então pendências venenosas (que falham sempre) não trava a fila —
 * a pendência válida mais nova não fica atrás delas. E quem esgota o teto de
 * tentativas ou chega com payload inválido sai da fila com baixa EXPLÍCITA
 * (`motivo` + `processed_at`), nunca por descarte silencioso.
 */
export async function reprocessarLogEssencial(
  limite = 50,
): Promise<ResultadoReprocessamentoLogEssencial> {
  const resultado: ResultadoReprocessamentoLogEssencial = {
    lidos: 0,
    entregues: 0,
    pendentes: 0,
    esgotadas: 0,
    falha: null,
  };
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    resultado.falha = "env_ausente";
    return resultado;
  }

  let pendencias: Array<Record<string, unknown>>;
  try {
    const resposta = await fetch(
      `${supabaseUrl}/rest/v1/ai_usage_outbox?select=id,payload,tentativas` +
        `&processed_at=is.null&order=tentativas.asc,created_at.asc` +
        `&limit=${Math.max(1, Math.floor(limite))}`,
      { headers: cabecalhosRest(serviceRoleKey) },
    );
    const corpo = await resposta.text();
    if (!resposta.ok) {
      resultado.falha = `leitura_http_${resposta.status}`;
      return resultado;
    }
    const parsed = JSON.parse(corpo) as unknown;
    if (!Array.isArray(parsed)) {
      resultado.falha = "leitura_invalida";
      return resultado;
    }
    pendencias = parsed as Array<Record<string, unknown>>;
  } catch (e) {
    resultado.falha = `leitura:${e instanceof Error ? e.message : String(e)}`;
    return resultado;
  }

  resultado.lidos = pendencias.length;
  for (const pendencia of pendencias) {
    const id = typeof pendencia.id === "string" ? pendencia.id : "";
    const payload = pendencia.payload as Record<string, unknown> | null;
    const linha = payload?.linha as Record<string, unknown> | null;
    const tentativas = Math.max(0, Math.floor(Number(pendencia.tentativas ?? 0)) || 0);
    const agora = new Date().toISOString();

    if (!id) {
      // Sem id não há como dar baixa (o PATCH é por id): fica pendente e o
      // motivo vai para o log, nunca para o silêncio.
      console.error("[ai-usage] pendência da outbox sem id não pode receber baixa");
      resultado.pendentes += 1;
      continue;
    }

    // Baixa explícita: payload inválido ou teto atingido sai da fila com
    // `motivo` gravado — nunca descarte silencioso nem loop infinito.
    if (!linha || typeof linha.function_name !== "string" || tentativas >= MAX_TENTATIVAS_REPROCESSO) {
      const motivo = tentativas >= MAX_TENTATIVAS_REPROCESSO
        ? "tentativas_esgotadas"
        : "payload_invalido";
      const baixou = await atualizarPendencia(supabaseUrl, serviceRoleKey, id, {
        motivo,
        tentativas: tentativas + 1,
        processed_at: agora,
      });
      if (baixou) resultado.esgotadas += 1;
      else resultado.pendentes += 1;
      continue;
    }

    let entregue = false;
    try {
      const logKey = await chaveDeLog(linha);
      const linhaFinal = {
        ...linha,
        metadata: { ...((linha.metadata ?? {}) as Record<string, unknown>), log_key: logKey },
      };
      entregue = await existeLinhaDeLog(supabaseUrl, serviceRoleKey, logKey) ||
        await gravarLogEssencial(supabaseUrl, serviceRoleKey, linhaFinal, logKey) === "gravado";
    } catch {
      entregue = false;
    }

    if (entregue) {
      const baixou = await atualizarPendencia(supabaseUrl, serviceRoleKey, id, {
        processed_at: agora,
      });
      if (baixou) {
        resultado.entregues += 1;
        continue;
      }
      resultado.pendentes += 1;
      continue;
    }

    const novasTentativas = tentativas + 1;
    if (novasTentativas >= MAX_TENTATIVAS_REPROCESSO) {
      // Última falha antes do teto: baixa definitiva com motivo, para a
      // pendência não virar letra morta nem travar a fila na próxima leitura.
      const baixou = await atualizarPendencia(supabaseUrl, serviceRoleKey, id, {
        motivo: "tentativas_esgotadas",
        tentativas: novasTentativas,
        processed_at: agora,
      });
      if (baixou) resultado.esgotadas += 1;
      else resultado.pendentes += 1;
      continue;
    }

    // O PATCH de tentativas também responde: descartar `resposta.ok` era o único
    // ponto em que a outbox recusava uma escrita SEM ninguém saber — o item
    // ficava pendente (correto), mas a recusa saía muda. Ela passa a sair no
    // resultado da execução, junto das demais falhas de leitura.
    const registrouTentativas = await atualizarPendencia(supabaseUrl, serviceRoleKey, id, {
      tentativas: novasTentativas,
    });
    if (!registrouTentativas) resultado.falha = "patch_tentativas_recusado";
    resultado.pendentes += 1;
  }
  return resultado;
}

function montarLinhaDeConsumo(
  entry: AiUsageEntry,
  profileId: string | null,
): Record<string, unknown> {
  return {
    user_id: entry.userId || null,
    profile_id: profileId,
    function_name: entry.functionName,
    model: entry.model || null,
    input_tokens: entry.usageUnknown === true ? null : (entry.inputTokens ?? 0),
    output_tokens: entry.usageUnknown === true ? null : (entry.outputTokens ?? 0),
    duration_ms: entry.durationMs || null,
    status: entry.status || "success",
    error_message: entry.errorMessage || null,
    metadata: buildUsageMetadata(entry),
    request_id: normalizeCorrelationId(entry.requestId),
    job_id: normalizeCorrelationId(entry.jobId),
    attempt: normalizeAttempt(entry.attempt),
  };
}

// ---------------------------------------------------------------------------
// SL-195c2 — evento de IA não confirmado vai para `public.outbox_events`
// (contrato do pai `t_c33d0cbc`), assinado com HMAC-SHA256
// ---------------------------------------------------------------------------
// O insert em `ai_usage_logs` falhou de vez e a linha virou pendência em
// `ai_usage_outbox`. Esse é o "evento de IA que ficou sem confirmação": além da
// pendência de entrega, a Edge grava o EVENTO em `outbox_events` com
// `event_id` estável (`chaveDeLog`) e assinatura HMAC sobre a serialização
// canônica da linha — o banco confere o formato e a unicidade
// (origem, event_id) faz o `ON CONFLICT DO NOTHING`; a verificação
// criptográfica fica na Edge, por `verifyHmacSignature`.

/** Nome da variável de ambiente com o segredo HMAC da outbox de IA. */
export const SEGREDO_DA_OUTBOX_DE_IA = "AI_OUTBOX_HMAC_SECRET";

/** `tipo` gravado na coluna homônima de `outbox_events` para stats de IA. */
export const TIPO_EVENTO_DE_IA = "ia.stats";

/**
 * Serialização determinística: chaves em ordem alfabética (recursivo),
 * arrays na ordem, sem espaços. Objeto cíclico LANÇA — não pode travar nem
 * devolver string ambígua, porque a assinatura cobre exatamente estes bytes.
 */
export function serializarEstatisticasCanonicas(valor: unknown): string {
  const emProfundidade = new Set<unknown>();
  const canonico = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (emProfundidade.has(v)) {
      throw new Error("serializarEstatisticasCanonicas: referência circular");
    }
    emProfundidade.add(v);
    try {
      if (Array.isArray(v)) return v.map(canonico);
      const ordenado: Record<string, unknown> = {};
      for (const chave of Object.keys(v as Record<string, unknown>).sort()) {
        ordenado[chave] = canonico((v as Record<string, unknown>)[chave]);
      }
      return ordenado;
    } finally {
      emProfundidade.delete(v);
    }
  };
  return JSON.stringify(canonico(valor));
}

/** HMAC-SHA256 do corpo, hex minúsculo (64 caracteres), sem prefixo. */
export async function assinarCorpoDoEvento(corpo: string, segredo: string): Promise<string> {
  const codificador = new TextEncoder();
  const chave = await crypto.subtle.importKey(
    "raw",
    codificador.encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign("HMAC", chave, codificador.encode(corpo));
  return [...new Uint8Array(assinatura)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Monta a linha de `outbox_events` (colunas do contrato do pai). O corpo
 * assinado é a STRING canônica guardada em `payload.corpo`: depois que o jsonb
 * do banco reordenar as chaves, qualquer verificador reconhece os bytes
 * assinados com `verifyHmacSignature(payload.corpo, linha.assinatura, segredo)`.
 */
async function montarEventoDeEstatisticasDeIa({ linha, motivo, logKey }: {
  linha: Record<string, unknown>;
  motivo: string;
  logKey: string;
}): Promise<Record<string, unknown>> {
  const origemBruta = linha.function_name == null ? "" : String(linha.function_name);
  const corpo = serializarEstatisticasCanonicas(linha);
  const payload = { corpo, motivo, log_key: logKey };
  return {
    origem: origemBruta.trim() === "" ? "ai-usage" : origemBruta,
    event_id: logKey,
    tipo: TIPO_EVENTO_DE_IA,
    payload,
    assinatura: await assinarCorpoDoEvento(
      corpo,
      Deno.env.get(SEGREDO_DA_OUTBOX_DE_IA) ?? "",
    ),
    algoritmo: "sha256",
    tentativas: 0,
  };
}

/**
 * Grava o evento de IA não confirmado em `outbox_events`. Idempotente por
 * constraint: o `resolution=ignore-duplicates` do PostgREST é o
 * `ON CONFLICT DO NOTHING` sobre UNIQUE (origem, event_id) — nunca "consulta
 * antes". NUNCA lança: o chamador é o caminho do log essencial.
 *
 * Fail-closed: sem `AI_OUTBOX_HMAC_SECRET` (ou com a própria assinatura
 * falhando na verificação) NÃO sai requisição — a coluna `assinatura` é
 * NOT NULL com CHECK de formato, e inventar uma assinatura é pior que não
 * gravar.
 */
async function gravarEstatisticaNaoConfirmada({ url, serviceRoleKey, linha, motivo, logKey }: {
  url: string;
  serviceRoleKey: string;
  linha: Record<string, unknown>;
  motivo: string;
  logKey: string;
}): Promise<boolean> {
  try {
    const segredo = Deno.env.get(SEGREDO_DA_OUTBOX_DE_IA);
    if (!segredo || segredo.trim() === "") {
      console.error(
        `[ai-usage][OUTBOX-EVENTO-NAO-ASSINADO] ${SEGREDO_DA_OUTBOX_DE_IA} ausente — evento ${logKey} não gravado`,
      );
      return false;
    }

    const evento = await montarEventoDeEstatisticasDeIa({ linha, motivo, logKey });
    const payload = evento.payload as { corpo: string };
    const confere = await verifyHmacSignature(
      payload.corpo,
      String(evento.assinatura),
      segredo,
    );
    if (!confere) {
      console.error(
        `[ai-usage][OUTBOX-EVENTO-NAO-ASSINADO] verificação da própria assinatura falhou — evento ${logKey} não gravado`,
      );
      return false;
    }

    const resposta = await fetch(
      `${url}/rest/v1/outbox_events?on_conflict=origem,event_id`,
      {
        method: "POST",
        headers: {
          ...cabecalhosRest(serviceRoleKey),
          Prefer: "return=minimal,resolution=ignore-duplicates",
        },
        body: JSON.stringify(evento),
      },
    );
    try {
      await resposta.text();
    } catch {
      // Resposta sem corpo: o que importa é o status.
    }
    return resposta.ok;
  } catch {
    return false;
  }
}

async function registrarFalhaDeLog(
  url: string,
  chave: string,
  linha: Record<string, unknown>,
  motivo: string,
): Promise<void> {
  // SL-195c2 — além da pendência de entrega (abaixo, inalterada), o evento de
  // IA que ficou sem confirmação vai para `outbox_events` assinado. A falha
  // dessa gravação é declarada pelo marcador; nada aqui enfraquece o caminho
  // original do log essencial.
  try {
    const logKey = await chaveDeLog(linha);
    const gravou = await gravarEstatisticaNaoConfirmada({
      url,
      serviceRoleKey: chave,
      linha,
      motivo,
      logKey,
    });
    if (!gravou) {
      console.error(`[ai-usage][OUTBOX-EVENTO-PERDIDO] evento ${logKey} (motivo: ${motivo})`);
    }
  } catch {
    console.error(`[ai-usage][OUTBOX-EVENTO-PERDIDO] evento não montável (motivo: ${motivo})`);
  }

  if (await gravarNaOutbox(url, chave, linha, motivo)) return;
  try {
    console.error(
      `[ai-usage][LOG-ESSENCIAL-PERDIDO] ${JSON.stringify({ motivo, linha })}`,
    );
  } catch {
    // Linha não serializável (ex.: referência circular): o motivo ainda sai.
    console.error(`[ai-usage][LOG-ESSENCIAL-PERDIDO] ${motivo} (linha não serializável)`);
  }
}

/** Log AI usage to database (essencial: nunca lança, nunca perde em silêncio) */
export async function logAiUsage(entry: AiUsageEntry): Promise<void> {
  // Env e linha ficam FORA do try só na declaração: a LEITURA de `Deno.env` e
  // a MONTAGEM da linha (`montarLinhaDeConsumo`/normalizadores) acontecem
  // dentro do try/catch — o contrato é resolver sem lançar mesmo quando a
  // entrada é inválida a ponto de a montagem explodir.
  let supabaseUrl: string | undefined;
  let serviceRoleKey: string | undefined;
  let linha: Record<string, unknown> | null = null;
  try {
    supabaseUrl = Deno.env.get("SUPABASE_URL");
    serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return;

    // A linha nasce completa antes do enriquecimento. Assim até uma falha na
    // resolução de profile_id tem um payload pronto e reprocessável na outbox.
    linha = montarLinhaDeConsumo(entry, entry.profileId || null);

    const logKey = await chaveDeLog(linha);
    linha = {
      ...linha,
      metadata: { ...((linha.metadata ?? {}) as Record<string, unknown>), log_key: logKey },
    };

    if (!entry.profileId && entry.userId) {
      const supabase = createClient(supabaseUrl, serviceRoleKey);
      linha.profile_id = await resolveProfileId(supabase, entry.userId);
    }

    if (await gravarLogEssencial(supabaseUrl, serviceRoleKey, linha, logKey) === "falhou") {
      await registrarFalhaDeLog(supabaseUrl, serviceRoleKey, linha, "insert_exaurido");
    }
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    if (!linha || !supabaseUrl || !serviceRoleKey) {
      // Sem linha (montagem/normalização explodiu) ou sem rota de persistência
      // não há outbox possível: a evidência é o marcador no log da função.
      console.error(`[ai-usage][LOG-ESSENCIAL-PERDIDO] ${JSON.stringify({ motivo })}`);
      return;
    }
    await registrarFalhaDeLog(supabaseUrl, serviceRoleKey, linha, `pre_insert:${motivo}`);
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

// ---------------------------------------------------------------------------
// IA-054 — ação, tentativa e cobrança
// ---------------------------------------------------------------------------
// O problema que estas funções resolvem, medido no desenho atual: uma AÇÃO do
// usuário pode virar VÁRIAS linhas em `ai_usage_logs` — uma por tentativa
// (retry da fila, `attempt`) e uma por salto de fallback (origem que falhou +
// destino que atendeu). Ler essas linhas ingenuamente infla a conta duas vezes:
// conta-se 2 "ações" onde houve 1 clique, e soma-se tarifa por linha onde parte
// das linhas é a MESMA intenção.
//
// Regras adotadas (e por quê):
//  1. AÇÃO = `request_id` (a intenção do usuário, levada do clique ao log pela
//     IA-051). Sem `request_id`, cai para `job_id`: é a melhor identidade de
//     intenção disponível, e é honesto assumir que uma ação ficou sem id.
//  2. TENTATIVA = uma LINHA = uma chamada ao provedor. Tentativa NÃO é ação:
//     três tentativas do mesmo request_id continuam sendo UMA ação.
//  3. COBRANÇA = só consumo MEDIDO entra em token. Linha sem medição
//     (`usage_unknown`) não vira zero: fica de fora da soma e é contada à
//     parte. É a mesma regra já congelada em `_shared/ai-budget.ts`
//     ("valores estimados nunca são faturamento confirmado") — a IA-054 estende
//     esse critério em vez de criar um segundo.
//  4. FALHA/CANCELAMENTO COM CONSUMO COBRA: um stream interrompido ou uma
//     resposta que falhou depois de consumir tokens gastou dinheiro de verdade
//     (IA-053). O que NÃO cobra é falha sem chamada ao provedor (negado por
//     quota, bloqueado por guarda, pulado).
//  5. A MESMA LINHA DUAS VEZES CONTA UMA: deduplicação por `id`, porque
//     reentrega de insert é o modo mais banal de dobrar um relatório.

/** Uma linha de consumo — do banco ou de um stub de teste. */
export interface LinhaDeConsumo {
  id: string;
  requestId?: string | null;
  jobId?: string | null;
  attempt?: number | null;
  status?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  usageUnknown?: boolean | null;
  createdAt?: string | null;
}

/** Estados que significam "não houve chamada paga ao provedor". */
const STATUS_SEM_CHAMADA = new Set([
  "denied",
  "skipped",
  "rate_limited",
  "budget_denied",
  // IA-050: tentativa bloqueada pelo circuito aberto — o provedor nem foi chamado.
  "circuit_open",
]);

/** A linha representa consumo REAL que deve entrar na conta? */
export function contaParaQuota(linha: LinhaDeConsumo): { cobra: boolean; motivo: string } {
  const status = (linha.status ?? "").toLowerCase();

  if (STATUS_SEM_CHAMADA.has(status)) {
    return { cobra: false, motivo: "sem_chamada_ao_provedor" };
  }
  if (linha.usageUnknown === true) {
    return { cobra: false, motivo: "sem_medicao" };
  }

  const entrada = linha.inputTokens ?? null;
  const saida = linha.outputTokens ?? null;
  if (entrada === null && saida === null) {
    return { cobra: false, motivo: "sem_medicao" };
  }

  // Falha e cancelamento COM medição cobram: o provedor foi chamado e consumiu.
  return { cobra: true, motivo: status === "" ? "medido" : "medido_" + status };
}

/** Identidade da AÇÃO: o id do clique; sem ele, o job é a melhor aproximação. */
export function identidadeDaAcao(linha: LinhaDeConsumo): string | null {
  if (linha.requestId) return "req:" + linha.requestId;
  if (linha.jobId) return "job:" + linha.jobId;
  return null;
}

/** Totais reconciliados de um conjunto de linhas de consumo. */
export interface ReconciliacaoDeConsumo {
  /** Intenções distintas do usuário — NUNCA o número de linhas. */
  acoes: number;
  /** Chamadas ao provedor (linhas únicas). */
  tentativas: number;
  sucessos: number;
  falhas: number;
  cancelamentos: number;
  /** Tokens somados APENAS de linhas com medição. */
  tokensMedidos: number;
  /** Linhas sem medição: ausência declarada, nunca somada como zero. */
  linhasSemMedicao: number;
  linhasCobradas: number;
  /** Ações que tiveram mais de uma tentativa (retry ou fallback). */
  acoesComMaisDeUmaTentativa: number;
  /** Linhas repetidas (`id` igual) descartadas: prova de que não dobrou. */
  linhasDuplicadasIgnoradas: number;
  /** Linhas sem identidade de ação: contam como tentativa, não como ação. */
  linhasSemIdentidadeDeAcao: number;
}

/**
 * Reconcilia linhas de consumo em ações, tentativas, falhas e consumo.
 *
 * Propriedade que o aceite exige, e que os testes provam: **duas linhas do
 * mesmo `request_id` (origem que falhou + fallback que atendeu) são UMA ação e
 * DUAS tentativas** — não duas ações. E tokens nunca são somados a partir de
 * linha sem medição.
 */
export function reconciliarConsumo(linhas: LinhaDeConsumo[]): ReconciliacaoDeConsumo {
  const vistas = new Set<string>();
  const acoes = new Set<string>();
  const tentativasPorAcao = new Map<string, number>();

  const totais: ReconciliacaoDeConsumo = {
    acoes: 0,
    tentativas: 0,
    sucessos: 0,
    falhas: 0,
    cancelamentos: 0,
    tokensMedidos: 0,
    linhasSemMedicao: 0,
    linhasCobradas: 0,
    acoesComMaisDeUmaTentativa: 0,
    linhasDuplicadasIgnoradas: 0,
    linhasSemIdentidadeDeAcao: 0,
  };

  for (const linha of linhas) {
    if (vistas.has(linha.id)) {
      totais.linhasDuplicadasIgnoradas += 1;
      continue;
    }
    vistas.add(linha.id);
    totais.tentativas += 1;

    const status = (linha.status ?? "").toLowerCase();
    // 'request_error' (IA-050) = erro HTTP do PEDIDO (4xx): a ação falhou e segue
    // contada como falha aqui — o circuito é quem ignora (não é queda do provedor).
    if (status === "error" || status === "request_error") totais.falhas += 1;
    else if (status === "cancelled") totais.cancelamentos += 1;
    else if (status === "success" || status === "fallback") totais.sucessos += 1;

    const acao = identidadeDaAcao(linha);
    if (acao === null) {
      totais.linhasSemIdentidadeDeAcao += 1;
    } else {
      if (!acoes.has(acao)) acoes.add(acao);
      tentativasPorAcao.set(acao, (tentativasPorAcao.get(acao) ?? 0) + 1);
    }

    const veredito = contaParaQuota(linha);
    if (veredito.cobra) {
      totais.linhasCobradas += 1;
      totais.tokensMedidos += (linha.inputTokens ?? 0) + (linha.outputTokens ?? 0);
    } else if (veredito.motivo === "sem_medicao") {
      totais.linhasSemMedicao += 1;
    }
  }

  totais.acoes = acoes.size;
  for (const quantidade of tentativasPorAcao.values()) {
    if (quantidade > 1) totais.acoesComMaisDeUmaTentativa += 1;
  }
  return totais;
}

/**
 * IA-054 / IA-QUOTA-001 — registra UMA ação calculada (sem chamada ao modelo).
 *
 * O defeito que isto fecha: `enforceAiGuards` mede a quota diária CONTANDO
 * linhas de `ai_usage_logs` por (user_id, function_name) — mas os handlers
 * calculados (`ai-churn-analysis`, `ai-classify-tickets`) respondiam por regras
 * próprias e nunca gravavam a linha. A ação passava pela guarda e era invisível
 * para a quota: ação, tentativa e cobrança existiam no modelo (regras 1–5
 * acima), só não estavam ligadas ao contador real.
 *
 * A linha gravada aqui é honesta com a regra 3: o handler NÃO chamou provedor,
 * então não há tokens a cobrar — `usageUnknown: true` manda as colunas de token
 * como NULL e `contaParaQuota` devolve "sem_medicao" (fora da soma, nunca zero
 * falso). A linha vale como TENTATIVA/AÇÃO para a quota e para a reconciliação;
 * `requestId` (IA-051) dá a identidade da ação quando o cliente a envia.
 *
 * Deve ser chamada UMA vez por resposta da ação admitida pela guarda — negada
 * pela guarda não gera linha (regra 4: bloqueado por guarda não tem chamada).
 */
export async function registrarAcaoCalculada(acao: {
  /** Mesmo slug passado a `enforceAiGuards` — a quota conta por (usuário, função). */
  functionName: string;
  userId: string | null;
  req: Request;
  /** Resposta que a ação produziu: o status HTTP vira o `status` da linha. */
  resposta: Response;
  /** `Date.now()` capturado quando a ação passou pela guarda. */
  inicio: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await logAiUsageDetached({
    functionName: acao.functionName,
    userId: acao.userId,
    requestId: extractAiRequestId(acao.req),
    durationMs: Date.now() - acao.inicio,
    status: acao.resposta.ok ? "success" : "error",
    usageUnknown: true,
    metadata: { acao_calculada: true, ...(acao.metadata ?? {}) },
  });
}

// ---------------------------------------------------------------------------
// IA-055 — tarifa versionada por vigência
// ---------------------------------------------------------------------------
// O problema: o consumo está medido em tokens (IA-051..054) e o dinheiro não
// existe. Transformar token em custo com um número solto tem duas falhas
// previsíveis — (a) um reajuste de preço reescreve o relatório do passado e
// (b) "não sei o preço" vira zero no relatório, que é o modo mais silencioso de
// mentir sobre custo.
//
// Por isso a tarifa tem VIGÊNCIA e a busca é por data:
//  - `valid_from` INCLUSIVO e `valid_to` EXCLUSIVO (NULL = vigente): fronteira
//    meio-aberta para que duas vigências nunca cubram o mesmo instante;
//  - entre as candidatas, vence a de `valid_from` mais recente (a tarifa nova
//    substitui a antiga sem apagar o histórico);
//  - sem tarifa aplicável o custo é `null` com motivo — NUNCA zero;
//  - unidade faz parte da identidade: tarifa de `second` não paga `token`.
//
// `source` viaja junto da tarifa escolhida para o relatório poder dizer se o
// número é ESTIMATIVA INTERNA ou CUSTO RECONCILIADO com o extrato do provedor.

/** Grandezas que se cobram, uma a uma (não se converte entre elas). */
export type UnidadeCobravel = "token" | "character" | "second" | "request";

/** Uma linha de tarifa, como vem da tabela `ai_model_prices`. */
export interface TarifaDeModelo {
  model: string;
  unit: UnidadeCobravel;
  currency: string;
  unitPrice: number;
  /** Início da vigência (inclusivo). */
  validFrom: string | Date;
  /** Fim da vigência (EXCLUSIVO); `null`/ausente = vigente. */
  validTo?: string | Date | null;
  /** `internal` = tarifa nossa; `provider_statement` = conferida no extrato. */
  source?: string | null;
}

function instante(valor: string | Date): number {
  const ms = valor instanceof Date ? valor.getTime() : Date.parse(valor);
  return Number.isFinite(ms) ? ms : Number.NaN;
}

/**
 * Tarifa vigente para (modelo, unidade) no instante `em`.
 *
 * Devolve `null` quando não há tarifa vigente — ausência declarada, porque um
 * preço inventado é pior que um custo desconhecido.
 */
export function tarifaAplicavel(
  tarifas: TarifaDeModelo[],
  consulta: { model: string; unit: UnidadeCobravel; em: string | Date },
): TarifaDeModelo | null {
  const em = instante(consulta.em);
  if (!Number.isFinite(em)) return null;

  let escolhida: TarifaDeModelo | null = null;
  let inicioEscolhido = Number.NEGATIVE_INFINITY;

  for (const tarifa of tarifas) {
    if (tarifa.model !== consulta.model || tarifa.unit !== consulta.unit) continue;

    const inicio = instante(tarifa.validFrom);
    if (!Number.isFinite(inicio) || inicio > em) continue;

    if (tarifa.validTo !== null && tarifa.validTo !== undefined) {
      const fim = instante(tarifa.validTo);
      if (!Number.isFinite(fim) || em >= fim) continue; // fim EXCLUSIVO
    }

    // Desempate DECLARADO, não dependente da ordem do array: com o mesmo início
    // de vigência podem coexistir a tarifa interna e a reconciliada com o
    // extrato. A reconciliada é o número conferido, então ela vence.
    const reconciliada = (tarifa.source ?? "internal") === "provider_statement" ? 1 : 0;
    const reconciliadaEscolhida =
      escolhida !== null && (escolhida.source ?? "internal") === "provider_statement" ? 1 : 0;

    const vence = escolhida === null ||
      inicio > inicioEscolhido ||
      (inicio === inicioEscolhido && reconciliada > reconciliadaEscolhida);

    if (vence) {
      escolhida = tarifa;
      inicioEscolhido = inicio;
    }
  }
  return escolhida;
}

/** Resultado do custo de uma quantidade, com o motivo quando não dá para calcular. */
export interface CustoCalculado {
  /** `null` quando não há tarifa aplicável (NUNCA zero por falta de dado). */
  custo: number | null;
  moeda: string | null;
  tarifa: TarifaDeModelo | null;
  fonte: string | null;
  motivo: string;
}

/**
 * Custo de `quantidade` unidades de (modelo, unidade) na data `em`.
 *
 * `quantidade` zero com tarifa aplicável é custo **zero medido** — diferente de
 * "não sei o preço", que devolve `custo: null`.
 */
export function calcularCusto(
  tarifas: TarifaDeModelo[],
  consulta: { model: string; unit: UnidadeCobravel; em: string | Date; quantidade: number },
): CustoCalculado {
  if (!Number.isFinite(consulta.quantidade) || consulta.quantidade < 0) {
    return { custo: null, moeda: null, tarifa: null, fonte: null, motivo: "quantidade_invalida" };
  }

  const tarifa = tarifaAplicavel(tarifas, consulta);
  if (tarifa === null) {
    return { custo: null, moeda: null, tarifa: null, fonte: null, motivo: "sem_tarifa_vigente" };
  }
  if (!Number.isFinite(tarifa.unitPrice) || tarifa.unitPrice < 0) {
    return { custo: null, moeda: null, tarifa: null, fonte: null, motivo: "tarifa_invalida" };
  }

  // Arredonda na menor fração praticável da coluna (8 casas): somar muitos
  // centésimos de fração gera centavo fantasma no relatório.
  const custo = Number((tarifa.unitPrice * consulta.quantidade).toFixed(8));
  return {
    custo,
    moeda: tarifa.currency,
    tarifa,
    fonte: tarifa.source ?? "internal",
    motivo: consulta.quantidade === 0 ? "zero_medido" : "calculado",
  };
}
