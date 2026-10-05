/**
 * Shared AI Usage Logger for Edge Functions.
 * Logs token consumption per user to ai_usage_logs table.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
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
   * IA-TIMEOUT-001 — identidade ÚNICA do evento de log (uuid), opcional.
   *
   * Quando o chamador a fornece (ex.: reentrega de um mesmo evento pelo worker
   * ou por `EdgeRuntime.waitUntil`), ela é usada como `event_id` da linha e a
   * restrição UNIQUE do banco colapsa a reentrega em UM registro. Quando
   * ausente — ou quando o valor não é uuid — o produtor gera uma nova. NUNCA
   * deriva do conteúdo: consumos legítimos idênticos são eventos distintos.
   */
  eventId?: string | null;
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

// ---------------------------------------------------------------------------
// IA-TIMEOUT-001 — log essencial durável: identidade única por evento no banco
// (UNIQUE + ON CONFLICT) e outbox persistente para o que falhar
// ---------------------------------------------------------------------------
// O defeito medido: `logAiUsage` fazia UM insert e engolia a falha com
// `console.warn`. Consumo PAGO virava registro perdido — e uma resposta
// perdida DEPOIS da escrita era indistinguível de falha real.
//
// A política aqui é garantida pelo BANCO, não por checagem prévia:
//  - `event_id`: uuid gerado UMA vez aqui no produtor (ou recebido do chamador
//    em reentrega), independente do conteúdo — consumos legítimos idênticos
//    são eventos distintos e gravam linhas distintas;
//  - a tabela tem UNIQUE(event_id) e o insert é UPSERT
//    (`on_conflict=event_id` + `resolution=ignore-duplicates`): reentregar o
//    mesmo evento é absorvido pela restrição, sem SELECT antes de inserir
//    (consultar-antes-de-inserir admitiria corrida entre a checagem e o
//    insert — era o buraco da rodada anterior);
//  - retenta até MAX_TENTATIVAS_LOG o que é transitório (sem resposta, 429,
//    5xx); permanente (4xx) para na hora, porque repetir só repete o erro;
//  - qualquer falha que sobrar — do insert esgotado OU de um passo antes ou
//    depois dele (geração de id, montagem da linha, enriquecimento) — persiste
//    na OUTBOX (`ai_usage_outbox`), fila durável no próprio banco, lida por
//    `reprocessarOutboxDeLog`. O console só aparece como ÚLTIMO recurso,
//    quando nem a outbox consegue gravar.

/** Teto de tentativas do insert do log essencial (1 + reenvios). */
const MAX_TENTATIVAS_LOG = 3;

/**
 * Escrita/leitura do log essencial via PostgREST direto, não pelo cliente
 * supabase-js: a política de retentativa precisa do STATUS HTTP da resposta
 * (429/5xx retenta, 4xx não) e o `PostgrestError` do cliente não garante esse
 * campo — sem ele, transitório e permanente seriam indistinguíveis.
 */
function cabecalhosRest(serviceRoleKey: string): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

/** 429/5xx valem retentativa; 4xx é pedido inválido — repetir só repete o erro. */
function statusTransitorioDeLog(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

/**
 * UPSERT da linha de consumo ancorado em `event_id`.
 *
 * `on_conflict=event_id` + `resolution=ignore-duplicates` = `ON CONFLICT DO
 * NOTHING`: quem decide se a linha já existe é a restrição UNIQUE, dentro da
 * mesma operação atômica — não existe janela de corrida. Com
 * `return=representation` o PostgREST devolve `[linha]` quando inseriu e `[]`
 * quando a reentrega foi absorvida; a chamada classifica os dois como entrega
 * confirmada (o que importa é existir UMA linha daquele evento).
 */
async function upsertLinhaDeLog(
  url: string,
  chave: string,
  linha: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; inserida: boolean }> {
  const resposta = await fetch(`${url}/rest/v1/ai_usage_logs?on_conflict=event_id`, {
    method: "POST",
    headers: {
      ...cabecalhosRest(chave),
      Prefer: "resolution=ignore-duplicates,return=representation",
    },
    body: JSON.stringify(linha),
  });
  let inserida = true;
  try {
    const corpo = await resposta.text();
    if (corpo) {
      const parsed = JSON.parse(corpo) as unknown;
      if (Array.isArray(parsed) && parsed.length === 0) inserida = false;
    }
  } catch {
    // Corpo ilegível: `ok` ainda classifica a entrega; `inserida` é detalhe.
  }
  return { ok: resposta.ok, status: resposta.status, inserida };
}

/**
 * Grava a linha retentando só o transitório.
 *
 * Nenhuma checagem de existência: a restrição UNIQUE(event_id) faz a
 * reentrega (e a resposta perdida depois da escrita) ser absorvida pelo
 * próprio insert, sem janela de corrida.
 */
async function gravarLogEssencial(
  url: string,
  chave: string,
  linha: Record<string, unknown>,
): Promise<"gravado" | "falhou"> {
  for (let tentativa = 0; tentativa < MAX_TENTATIVAS_LOG; tentativa++) {
    try {
      const resposta = await upsertLinhaDeLog(url, chave, linha);
      if (resposta.ok) return "gravado";
      if (!statusTransitorioDeLog(resposta.status)) return "falhou";
    } catch {
      // fetch lançou = sem resposta: transitório, a próxima volta reinsere —
      // se a anterior gravou, a restrição absorve a duplicata.
    }
  }
  return "falhou";
}

/**
 * Persiste uma falha de log na OUTBOX durável (`ai_usage_outbox`).
 *
 * Também upsert por `event_id`: a mesma falha registrada duas vezes (reentrada
 * do próprio erro) vira uma linha só. `event_id` pode ser `null` quando a
 * falha aconteceu ANTES da identidade ser gerada — a coluna admite NULL e a
 * entrada é reconhecível pelo payload.
 */
async function gravarNaOutbox(
  url: string,
  chave: string,
  eventId: string | null,
  payload: Record<string, unknown>,
  motivo: string,
): Promise<boolean> {
  try {
    const resposta = await fetch(`${url}/rest/v1/ai_usage_outbox?on_conflict=event_id`, {
      method: "POST",
      headers: {
        ...cabecalhosRest(chave),
        Prefer: "resolution=ignore-duplicates,return=representation",
      },
      body: JSON.stringify({ event_id: eventId, payload, motivo }),
    });
    const corpo = await resposta.text();
    if (!resposta.ok) return false;
    // A resposta é `[]` quando o UNIQUE(event_id) absorveu o conflito — a linha
    // já existia. Se essa linha já tinha sido ENTREGUE (`processed_at`), o
    // mesmo evento falhou de NOVO: ignorar a duplicata apagaria a falha nova
    // (era o buraco apontado). Devolvemos o registro à fila; linha ainda
    // PENDENTE não é tocada, porque já está na fila.
    if (eventId !== null && ehConflitoAbsorvido(corpo)) {
      return await devolverPendenciaAOutbox(url, chave, eventId, payload, motivo);
    }
    return true;
  } catch {
    return false;
  }
}

/** `true` quando o corpo é o array vazio do `ON CONFLICT DO NOTHING` (conflito absorvido). */
function ehConflitoAbsorvido(corpo: string): boolean {
  if (corpo === "") return false;
  try {
    const parsed = JSON.parse(corpo) as unknown;
    return Array.isArray(parsed) && parsed.length === 0;
  } catch {
    return false;
  }
}

/**
 * Devolve à fila o registro JÁ ENTREGUE do mesmo evento que falhou de novo.
 *
 * O filtro `processed_at=not.is.null` é a garantia de que só a linha congelada
 * volta a pendente: um registro que ainda está pendente permanece intocado.
 * Falha aqui é propagada para `gravarNaOutbox`: sem reenfileiramento, a
 * falha nova não ficou durável e precisa acionar o marcador observável.
 */
async function devolverPendenciaAOutbox(
  url: string,
  chave: string,
  eventId: string,
  payload: Record<string, unknown>,
  motivo: string,
): Promise<boolean> {
  try {
    const resposta = await fetch(
      `${url}/rest/v1/ai_usage_outbox?event_id=eq.${encodeURIComponent(eventId)}` +
        `&processed_at=not.is.null`,
      {
        method: "PATCH",
        headers: { ...cabecalhosRest(chave), Prefer: "return=minimal" },
        body: JSON.stringify({ processed_at: null, tentativas: 0, payload, motivo }),
      },
    );
    try {
      await resposta.text();
    } catch {
      return false;
    }
    return resposta.ok;
  } catch {
    return false;
  }
}

/**
 * Serializa a entrada do log para a outbox sem poder falhar de novo: se a
 * própria entrada não é serializável (getter que lança, ciclos), guarda-se o
 * mínimo identificável em vez de perder o rastro da falha.
 */
function serializarEntrada(entry: AiUsageEntry): Record<string, unknown> {
  try {
    return JSON.parse(JSON.stringify(entry)) as Record<string, unknown>;
  } catch {
    try {
      return {
        function_name: entry.functionName ?? null,
        _entrada_nao_serializavel: true,
      };
    } catch {
      return { _entrada_nao_serializavel: true };
    }
  }
}

/**
 * Registro durável de falha de log: outbox primeiro, console como último
 * recurso.
 *
 * A OUTBOX é o mecanismo — a linha (ou a entrada, quando a falha foi antes da
 * montagem) fica PENDENTE no banco até `reprocessarOutboxDeLog` confirmar a
 * entrega. Só quando a própria outbox não grava é que o marcador
 * `[ai-usage][LOG-ESSENCIAL-PERDIDO]` aparece: nesse ponto o console é a
 * única observabilidade que resta, e o payload completo vai junto para um
 * resgate manual.
 */
async function registrarFalhaDeLog(
  url: string,
  chave: string,
  eventId: string | null,
  linha: Record<string, unknown> | null,
  entry: AiUsageEntry,
  motivo: string,
): Promise<void> {
  const payload: Record<string, unknown> = linha !== null
    ? { linha }
    : { entrada: serializarEntrada(entry) };
  const gravou = await gravarNaOutbox(url, chave, eventId, payload, motivo);
  if (!gravou) {
    console.error(
      `[ai-usage][LOG-ESSENCIAL-PERDIDO] ${JSON.stringify({ event_id: eventId, motivo, ...payload })}`,
    );
  }
}

/** Resultado de uma passada de reprocessamento da outbox de logs. */
export interface ResultadoReprocessamento {
  /** Registros pendentes lidos da outbox. */
  lidos: number;
  /** Entregues agora ao `ai_usage_logs`. */
  gravados: number;
  /** A linha já existia (ON CONFLICT absorveu): baixa sem novo consumo. */
  jaExistiam: number;
  /** Seguem pendentes (falha transitória ou entrada irrecuperável). */
  pendentes: number;
  /** Motivo quando a própria passada falhou (env ausente, leitura quebrada). */
  falha: string | null;
}

async function atualizarOutbox(
  url: string,
  chave: string,
  id: string,
  campos: Record<string, unknown>,
): Promise<void> {
  try {
    const resposta = await fetch(
      `${url}/rest/v1/ai_usage_outbox?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { ...cabecalhosRest(chave), Prefer: "return=minimal" },
        body: JSON.stringify(campos),
      },
    );
    try { await resposta.text(); } catch { /* baixa falhou: fica pendente */ }
  } catch {
    // Baixa falhou: o registro segue pendente e a próxima passada o retoma.
  }
}

/**
 * Reprocessa a outbox de logs essenciais — a garantia de entrega.
 *
 * Lê os pendentes (`processed_at IS NULL`, mais antigos primeiro), reenvia a
 * linha pelo MESMO upsert por `event_id` e baixa o registro quando a entrega é
 * confirmada — inclusive quando a linha já existia (a restrição devolve `[]`:
 * é a prova de que reprocessar não duplica cobrança). Pendente com só a
 * `entrada` remonta a linha inteira (enriquecimento incluso) e recebe o
 * `event_id` que faltou. O que falhar segue na fila com `tentativas` +1.
 */
export async function reprocessarOutboxDeLog(limite = 50): Promise<ResultadoReprocessamento> {
  const resultado: ResultadoReprocessamento = {
    lidos: 0,
    gravados: 0,
    jaExistiam: 0,
    pendentes: 0,
    falha: null,
  };
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    resultado.falha = "env_ausente";
    return resultado;
  }

  let itens: Array<Record<string, unknown>>;
  try {
    const resposta = await fetch(
      `${supabaseUrl}/rest/v1/ai_usage_outbox?select=id,event_id,payload,tentativas` +
        `&processed_at=is.null&order=created_at.asc&limit=${Math.max(1, Math.floor(limite))}`,
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
    itens = parsed as Array<Record<string, unknown>>;
  } catch (e) {
    resultado.falha = `leitura:${e instanceof Error ? e.message : String(e)}`;
    return resultado;
  }

  resultado.lidos = itens.length;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  for (const item of itens) {
    const id = String(item.id ?? "");
    const payload = (item.payload ?? {}) as Record<string, unknown>;
    const tentativas = Number(item.tentativas ?? 0);

    let linha = (payload.linha ?? null) as Record<string, unknown> | null;
    if (linha === null && payload.entrada !== undefined && payload.entrada !== null) {
      try {
        // O evento que falhou antes de ter identidade ganha uma agora; o que
        // já tinha reencontra a MESMA identidade.
        const evento = normalizeCorrelationId(item.event_id) ?? crypto.randomUUID();
        linha = await montarLinhaDeConsumo(supabase, payload.entrada as AiUsageEntry, evento);
      } catch {
        linha = null;
      }
    }
    if (linha !== null) {
      // A linha da outbox sempre nasce com o event_id do registro.
      linha = { ...linha, event_id: normalizeCorrelationId(item.event_id) ?? linha.event_id ?? crypto.randomUUID() };
    }

    let entregue = false;
    if (linha !== null) {
      try {
        const resposta = await upsertLinhaDeLog(supabaseUrl, serviceRoleKey, linha);
        if (resposta.ok) {
          entregue = true;
          if (resposta.inserida) resultado.gravados += 1;
          else resultado.jaExistiam += 1;
        }
      } catch {
        // Transitório: segue pendente para a próxima passada.
      }
    }

    if (entregue) {
      await atualizarOutbox(supabaseUrl, serviceRoleKey, id, {
        processed_at: new Date().toISOString(),
      });
    } else {
      resultado.pendentes += 1;
      await atualizarOutbox(supabaseUrl, serviceRoleKey, id, { tentativas: tentativas + 1 });
    }
  }
  return resultado;
}

/**
 * Monta a linha de `ai_usage_logs` a partir da entrada — inclui o
 * enriquecimento (profile_id) e as normalizações de cada etapa.
 */
async function montarLinhaDeConsumo(
  supabase: SupabaseClient,
  entry: AiUsageEntry,
  eventId: string,
): Promise<Record<string, unknown>> {
  // Auto-resolve profile_id if not provided
  const profileId = entry.profileId || await resolveProfileId(supabase, entry.userId);

  return {
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
    // IA-TIMEOUT-001 — identidade única do EVENTO: é ela, não o conteúdo, que
    // o banco usa para absorver reentregas sem duplicar cobrança.
    event_id: eventId,
  };
}

/** Log AI usage to database (essencial: nunca lança, nunca perde em silêncio) */
export async function logAiUsage(entry: AiUsageEntry): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return;

  let eventId: string | null = null;
  let linha: Record<string, unknown> | null = null;
  try {
    // IA-TIMEOUT-001 — a identidade do evento nasce AQUI, uma vez, antes de
    // qualquer tentativa: todos os reenvios carregam o mesmo event_id e a
    // restrição UNIQUE do banco absorve as reentregas.
    eventId = normalizeCorrelationId(entry.eventId) ?? crypto.randomUUID();
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    linha = await montarLinhaDeConsumo(supabase, entry, eventId);

    if (await gravarLogEssencial(supabaseUrl, serviceRoleKey, linha) === "falhou") {
      await registrarFalhaDeLog(
        supabaseUrl,
        serviceRoleKey,
        eventId,
        linha,
        entry,
        "insert_exaurido",
      );
    }
  } catch (e) {
    // Nunca lança — mas nunca cala: a falha ANTES/DEPOIS do insert (geração
    // de id, enriquecimento, serialização) vira registro durável na outbox,
    // não um warn que ninguém reprocessa.
    const motivo = e instanceof Error ? e.message : String(e);
    await registrarFalhaDeLog(
      supabaseUrl,
      serviceRoleKey,
      eventId,
      linha,
      entry,
      `pre_pos_insert:${motivo}`,
    );
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
const STATUS_SEM_CHAMADA = new Set(["denied", "skipped", "rate_limited", "budget_denied"]);

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
    if (status === "error") totais.falhas += 1;
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
