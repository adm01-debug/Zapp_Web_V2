/**
 * Chamada de IA roteada pelo servidor (Bloco 04 / PR-3 — IA-032).
 *
 * Por que este módulo existe:
 *  - o helper de chamada antigo tinha o endereço do gateway (Lovable) HARDCODED
 *    no próprio código: trocar o provedor da finalidade no painel não mudava nada;
 *  - nenhum consumidor podia declarar POLÍTICA de servidor, capacidades nem
 *    extra_body sem contornar o gateway antigo.
 *
 * O que este módulo faz (sem exceção):
 *  1. carrega os provedores do banco canônico (`ai_providers`) com service role —
 *     nenhum endereço/segredo fixo em ambiente;
 *  2. resolve o provedor pela FINALIDADE (`resolveProvider`) e devolve `ok:false`
 *     com Response sintética para NO_PROVIDER/AMBIGUOUS_PROVIDER (503),
 *     PROVIDER_INACTIVE (409) e BAD_PURPOSE (400);
 *  3. exige capacidades declaradas quando `need` é informado (`assertCapabilities`,
 *     400 com o código) — sem `need` não inventa pedido;
 *  4. decide o modelo NO SERVIDOR (`resolveModel(provider, null)`): o modelo fixo
 *     dos consumidores antigos é descartado (IA-035);
 *  5. compõe a política do servidor como mensagem própria, sem mutar as mensagens
 *     do cliente (IA-037);
 *  6. filtra `extraBody` (`filterExtraBody`, IA-038) e o `config` do provedor pelos
 *     filtros do módulo de roteamento: model/messages/system/tools do config nunca
 *     sobrescrevem a decisão do servidor;
 *  7. despacha por `provider_type` reusando `_shared/ai-providers.ts`, sempre com
 *     `withRetry` e teto de tempo POR CAPACIDADE (IA-041): 30s para texto puro,
 *     mais para visão/áudio (ver `DEFAULT_TIMEOUT_MS_BY_CAPABILITY`);
 *  8. chama `logAiUsage` em TODOS os desfechos (sucesso, erro HTTP, exceção, erro de
 *     roteamento/capacidade): nenhuma chamada paga fica invisível;
 *  9. devolve `data` = JSON do provedor (`choices[0].message.content` continua
 *     funcionando nos consumidores) e `data:null` quando a resposta não é JSON;
 * 10. NÃO lança por falha de provedor — devolve `ok:false`. Só lança erro de
 *     programação (parâmetro obrigatório ausente/com tipo inválido).
 *
 * IA-033 (resolução por MODALIDADE): quando `need.modality` é não-texto, o provedor é
 * escolhido entre as linhas ATIVAS que DECLARAM todas as modalidades exigidas
 * (`declaredCapabilities`) — SEM exigir `is_default`, porque o DeepSeek segue dono do
 * texto. Nenhum candidato → NO_PROVIDER (falha fechada); mais de um → AMBIGUOUS_PROVIDER
 * (nunca sortear). `purpose` continua validada/usada e `logAiUsage` cobre todos os desfechos.
 *
 * Diferença esperada em relação aos módulos puros (`ai-routing`/`ai-capabilities`):
 * aqui usa-se `Deno.env`, `fetch` e o client Supabase com service role.
 *
 * IA-041 (prazos ponta a ponta + cancelamento propagado): o despacho SEMPRE manda um
 * teto de tempo, decidido por CAPACIDADE — texto (e toda finalidade, que só produz
 * texto) mantém os 30s históricos; visão/áudio, comprovadamente mais lentos, ganham
 * prazos maiores. Um `timeoutMs` explícito do chamador continua vencendo o padrão. O
 * estouro aciona o `AbortController` DENTRO do provedor (IA-040, via `options.timeoutMs`)
 * e volta do `catch` como `AbortError`/`TimeoutError`, classificado como `TIMEOUT` (504)
 * — distinguível de uma falha 502 qualquer, e auditado em `ai_usage_logs` como sempre.
 *
 * Limites do desenho congelado (não são bugs, são contrato):
 *  - `callLovableAI` não aceita `config`: para `lovable_ai` só viajam os campos que o
 *    adaptador monta (model/messages/tools/tool_choice), então `temperature` e
 *    `extraBody` são descartados nesse ramo — "o que o filtro do adaptador permitir";
 *  - `callCustomWebhook` recebe o MESMO `options.timeoutMs` por capacidade dos demais
 *    ramos (interface congelada `options?: { timeoutMs?: number }`), fechando o teto
 *    do ramo webhook;
 *  - não há fallback aqui: `status` nunca vale 'fallback' e `fallbackUsed` é sempre
 *    `false` (a troca explícita de fornecedor é do `ai-proxy`, IA-039).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import {
  AiRoutingError,
  AI_PURPOSES,
  composeMessages,
  filterConfigBody,
  filterExtraBody,
  filterHeaders,
  resolveModel,
  resolveProvider,
  type AiProviderRow,
  type AiPurpose,
  type AiRoutingErrorCode,
} from "./ai-routing.ts";
import {
  AiCapabilityError,
  assertCapabilities,
  declaredCapabilities,
  type AiCapabilityErrorCode,
  type AiCapabilityNeed,
  type AiModality,
} from "./ai-capabilities.ts";
import {
  callCustomWebhook,
  callLovableAI,
  callOpenAICompatible,
  withRetry,
} from "./ai-providers.ts";
import { extractTokenUsage, logAiUsage } from "./ai-usage.ts";
import { releaseBudget, reserveBudget, settleBudget } from "./ai-budget.ts";

/**
 * Teto de tempo padrão do TEXTO PURO (mesmo valor do gateway antigo — IA-032).
 * É o valor que os consumidores de texto sempre tiveram: NÃO pode regredir.
 */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Prazo padrão (ms) por CAPACIDADE (IA-041).
 *
 * A regra é não regredir: `text` — e TODAS as finalidades, que só produzem texto —
 * mantêm os 30s históricos. Só as capacidades comprovadamente MAIS LENTAS que texto
 * ganham prazo maior:
 *  - `vision`: o corpo carrega imagem (base64 grande) e o modelo multimodal leva mais
 *    para responder; 60s é o dobro com folga, sem pendurar a requisição;
 *  - `audio_stt`/`audio_tts`: áudio é ordens de grandeza maior que texto e a
 *    transcrição/síntese escala com a duração — 120s;
 *  - `audio_sts`: reconhecimento + síntese na MESMA chamada, então precisa de mais
 *    que cada etapa isolada — 150s.
 *
 * A chave é o tipo REAL de `_shared/ai-capabilities.ts` (`AiModality`) e o de
 * `ai-routing.ts` (`AiPurpose`): assim o mapa é obrigado a cobrir toda capacidade
 * existente (chave nova sem valor vira erro de compilação, não uma chamada sem teto).
 */
const DEFAULT_TIMEOUT_MS_BY_CAPABILITY: Record<AiModality | AiPurpose, number> = {
  text: DEFAULT_TIMEOUT_MS,
  vision: 60_000,
  audio_stt: 120_000,
  audio_tts: 120_000,
  audio_sts: 150_000,
  // Finalidades são texto puro: mantêm o valor antigo (ninguém ganhou prazo maior
  // sem justificativa de capacidade).
  copilot: DEFAULT_TIMEOUT_MS,
  analysis: DEFAULT_TIMEOUT_MS,
  summary: DEFAULT_TIMEOUT_MS,
  tagging: DEFAULT_TIMEOUT_MS,
  auto_reply: DEFAULT_TIMEOUT_MS,
};

/**
 * Prazo padrão da chamada: a MODALIDADE manda quando declarada (`need.modality`),
 * porque é ela que muda a latência real; sem ela, a FINALIDADE decide. Chave
 * desconhecida em runtime (modalidade/finalidade fora do enum) cai no
 * `DEFAULT_TIMEOUT_MS` — falha fechada no valor histórico, nunca uma chamada sem teto.
 */
function resolveDefaultTimeoutMs(purpose: unknown, modality: unknown): number {
  let key = "";
  if (typeof modality === "string" && modality !== "") {
    key = modality;
  } else if (typeof purpose === "string") {
    key = purpose;
  }
  const value = (DEFAULT_TIMEOUT_MS_BY_CAPABILITY as Record<string, number>)[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_TIMEOUT_MS;
}

/**
 * Código estável do estouro de prazo (IA-041). Não vem de `ai-routing`/
 * `ai-capabilities` (que tratam de configuração/pedido): é o desfecho do
 * cancelamento propagado pelo provedor e precisa ser distinguível de um 502 de
 * rede qualquer.
 */
export const AI_TIMEOUT_ERROR_CODE = "TIMEOUT";

/**
 * Código estável do bloqueio por ORÇAMENTO esgotado (IA-044). A decisão de gasto é
 * do servidor: quando a reserva atômica NEGA (`allowed:false`), o provedor não é
 * chamado e o desfecho sai como HTTP 429 com ESTE código — falha FECHADA, ao
 * contrário da falha aberta do `reserveBudget` em erro de infraestrutura.
 */
export const AI_BUDGET_ERROR_CODE = "BUDGET_EXCEEDED";

/** Todo código de erro que um desfecho do despacho pode carregar. */
export type AiGenerateErrorCode =
  | AiRoutingErrorCode
  | AiCapabilityErrorCode
  | typeof AI_TIMEOUT_ERROR_CODE
  | typeof AI_BUDGET_ERROR_CODE;

/** Tentativas extras do `withRetry` e base do backoff (igual ao ai-proxy). */
const RETRY_MAX = 2;
const RETRY_BASE_DELAY_MS = 500;

/**
 * Teto padrão de orçamento de IA em tokens (IA-044). É o `limitTokens` da reserva
 * quando o chamador não informa `params.budgetTokens`. `<= 0` (no override) desliga
 * a reserva e a IA segue — orçamento degenerado não é bloqueio.
 */
export const DEFAULT_AI_BUDGET_TOKENS = 200_000;

/**
 * Estimativa de consumo em tokens, usada APENAS para dimensionar a RESERVA de
 * orçamento (IA-044): `ceil(len(JSON.stringify(messages)) / 4)` da ENTRADA mais
 * `maxTokens ?? 1024` da SAÍDA, com piso 1.
 *
 * ESTIMATIVA NUNCA É FATURAMENTO. Nada do que sai daqui é cobrado ou gravado como
 * uso: quem grava o uso REAL é `settleBudget`, com `inputTokens + outputTokens`
 * efetivamente medidos na resposta do provedor. Estimar a mais só reduz a folga da
 * reserva; estimar a menos não subfatura, porque o `settle` corrige depois.
 *
 * Pura e determinística (não lê relógio nem ambiente) — por isso é testável direto.
 */
export function estimateAiTokens(messages: unknown, maxTokens: number | null | undefined): number {
  let serialized = "";
  try {
    serialized = JSON.stringify(messages) ?? "";
  } catch {
    // Circular/exótico não pode derrubar o despacho: sem medida da entrada, fica a saída.
    serialized = "";
  }
  const inputTokens = Math.ceil(serialized.length / 4);
  const bruto = typeof maxTokens === "number" && Number.isFinite(maxTokens) ? maxTokens : 1024;
  const outputTokens = Math.ceil(bruto);
  return Math.max(1, inputTokens + outputTokens);
}

/** Serialização canônica (chaves de objeto ordenadas) para hash estável. Nunca lança. */
function serializeCanonico(value: unknown): string {
  try {
    return JSON.stringify(canonicalize(value)) ?? "";
  } catch {
    return "";
  }
}

/**
 * Comparador de ordem de code-unit UTF-16 — exatamente o que `.sort()` sem
 * argumento faz.
 *
 * NAO troque por `localeCompare`: a ordem daqui alimenta a forma canonica que
 * vira hash, e `localeCompare` depende do locale do runtime (muda a posicao de
 * pontuacao e caixa — `a_b` vs `ab`), o que faria o mesmo payload gerar hash
 * diferente em ambientes diferentes.
 */
const compararCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Cópia com as chaves de todo objeto ordenadas — mesma informação, forma estável. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort(compararCodeUnit)) {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** FNV-1a 32 bits em hex minúsculo de 8 dígitos — estável entre execuções. */
function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Chave de IDEMPOTÊNCIA determinística da solicitação (IA-044). A MESMA entrada
 * (`functionName`, dono, modelo, mensagens e limite de saída) produz SEMPRE a mesma
 * chave — é isto que faz "mesma solicitação ⇒ mesma reserva": um retry devolve a
 * reserva já existente (`ai_budget_reserve` é idempotente pela chave) em vez de
 * dobrar o consumo.
 *
 * Formato congelado: `<functionName>:<userId|anon>:<model>:<hash>`, onde o `hash` é
 * FNV-1a de 32 bits sobre a serialização CANÔNICA do pedido (`messages` +
 * `maxTokens`), então dois pedidos iguais com chaves em ordem diferente caem na
 * mesma reserva. `params.idempotencyKey` explícito vence esta derivação.
 */
export function deriveAiIdempotencyKey(
  functionName: string,
  userId: string | null,
  model: string,
  messages: unknown,
  maxTokens: unknown,
): string {
  const payload = serializeCanonico({ messages: messages ?? null, maxTokens: maxTokens ?? null });
  const hash = fnv1aHex(payload);
  const dono = userId ?? "anon";
  return `${functionName}:${dono}:${model}:${hash}`;
}

/** Parâmetros da chamada roteada. */
export interface GenerateParams {
  /** Finalidade (roteamento central). */
  purpose: AiPurpose;
  /** `ai_usage_logs.function_name`. */
  functionName: string;
  userId?: string | null;
  /**
   * IA-051 — correlação da execução.
   *
   * `requestId` é o id opaco que o cliente manda no header
   * `x-ai-request-id` (a identidade criada pelo IA-048 no clique); `jobId` e
   * `attempt` vêm do worker, quando a execução nasce na fila. Todos
   * opcionais de propósito: ausência vira NULL no log — nunca um id
   * inventado no servidor, que não teria como ser correlacionado com nada.
   */
  requestId?: string | null;
  jobId?: string | null;
  attempt?: number | null;
  /** Mensagens do CLIENTE (sem system). */
  messages: unknown[];
  /** Política do SERVIDOR (IA-037, composeMessages). */
  system?: string | null;
  /** Modalidade/limites exigidos (IA-036). */
  need?: AiCapabilityNeed | null;
  temperature?: number;
  /** Ferramentas (ex.: pipeline de conversa); `toolChoice` anda junto. */
  tools?: unknown[] | null;
  toolChoice?: unknown;
  /** Corpo extra filtrado por `RESERVED_BODY_KEYS` (IA-038). */
  extraBody?: Record<string, unknown> | null;
  timeoutMs?: number;
  /**
   * Chave de idempotência da RESERVA de orçamento (IA-044). Quando ausente, a chave
   * é DERIVADA da própria solicitação (`deriveAiIdempotencyKey`), de modo que a
   * mesma solicitação caia sempre na mesma reserva.
   */
  idempotencyKey?: string;
  /**
   * Override do teto de orçamento em tokens (IA-044). Ausente cai em
   * `DEFAULT_AI_BUDGET_TOKENS`. `<= 0` DESLIGA a reserva e a IA segue.
   */
  budgetTokens?: number;
}

/** Desfecho da chamada, com a mesma forma que o consumidor antigo já tratava. */
export interface GenerateResult {
  ok: boolean;
  /** Forma compatível com o consumidor antigo (`!response.ok || !data`). */
  response: Response;
  /** JSON do provedor (`choices[0].message.content`) ou null quando não é JSON. */
  data: Record<string, unknown> | null;
  providerId: string | null;
  providerName: string | null;
  model: string | null;
  durationMs: number;
  status: string;
  errorCode?: AiGenerateErrorCode | null;
  fallbackUsed?: boolean;
}

/**
 * A configuração do provedor impede a chamada (endpoint/segredo ausente ou tipo sem
 * caminho de chamada). É falha de CONFIGURAÇÃO: sai como `ok:false` (nunca lança),
 * porque o chamador não tem como corrigir isso no código dele.
 */
class ProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigError";
  }
}

/** Mensagem de erro legível (nunca "undefined"). */
function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Nome do erro sem lançar (`Error` e `DOMException` do fetch abortado). */
function errorName(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const name = (err as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }
  return "";
}

/**
 * O estouro do prazo aborta o `AbortController` do provedor (IA-040) e chega aqui
 * como `AbortError` (ou `TimeoutError`, de algumas implementações de fetch). Para o
 * chamador é a MESMA causa: o prazo estourou. Nunca confundir com um erro de rede
 * genérico — por isso a classificação é por `name`, não pela mensagem.
 */
function isAbortOrTimeoutError(err: unknown): boolean {
  const name = errorName(err);
  return name === "AbortError" || name === "TimeoutError";
}

/** Objeto simples (sem array/null) — base dos filtros. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Config do provedor normalizada (nunca confia no formato vindo do banco). */
function asPlainObject(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

/** Rótulo do provedor para mensagens (nunca lança com linha incompleta). */
function providerLabel(provider: AiProviderRow): string {
  const id = typeof provider?.id === "string" && provider.id !== "" ? provider.id : "?";
  const name = typeof provider?.name === "string" && provider.name !== "" ? provider.name : "?";
  return `${name} (${id})`;
}

/** Status HTTP do erro de roteamento — mesma decisão do ai-proxy. */
function routingStatus(code: AiRoutingErrorCode): number {
  if (code === "PROVIDER_INACTIVE") return 409;
  if (code === "BAD_PURPOSE") return 400;
  // NO_PROVIDER/AMBIGUOUS_PROVIDER: configuração quebrada, não "pedido ruim".
  return 503;
}

/**
 * Response sintética de falha. NÃO usa `errorResponse` de `validation.ts`: em 5xx ele
 * troca o corpo por "Internal server error" e o consumidor perderia o código.
 * `ok` é false, então o tratamento `!response.ok || !data` do consumidor continua valendo.
 */
function failureResponse(status: number, code: string | null, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Parâmetro obrigatório de texto (ausente/vazio é bug de quem chamou). */
function requireText(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`generateWithRouting: "${name}" e obrigatorio e nao pode ser vazio.`);
  }
  return value;
}

/**
 * Carrega `ai_providers` com a service role. Nunca lança: ausência de env ou falha de
 * banco devolve lista vazia e o motivo (que vira NO_PROVIDER no roteamento — nunca um
 * provedor inventado nem um gateway fixo).
 */
async function loadProviders(): Promise<{ rows: AiProviderRow[]; loadError: string | null }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return { rows: [], loadError: "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes." };
  }
  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await supabase.from("ai_providers").select("*");
    if (error) return { rows: [], loadError: error.message };
    return { rows: (data ?? []) as unknown as AiProviderRow[], loadError: null };
  } catch (err) {
    return { rows: [], loadError: errorText(err) };
  }
}

/** Segredo do provedor ou falha de configuração (nunca chamar sem chave). */
function requireSecret(secretName: string | null, label: string): string {
  if (!secretName) {
    throw new ProviderConfigError(`api_key_secret_name nao configurado para o provedor ${label}.`);
  }
  const value = Deno.env.get(secretName);
  if (!value) {
    throw new ProviderConfigError(`Segredo ${secretName} nao encontrado nos secrets (Deno.env) para o provedor ${label}.`);
  }
  return value;
}

/** Argumentos já resolvidos para montar o dispatch. */
interface DispatchArgs {
  provider: AiProviderRow;
  model: string | null;
  messages: Array<{ role: string; content: unknown }>;
  tools: unknown[] | null;
  toolChoice: unknown;
  extraBody: Record<string, unknown> | null;
  temperature: number | null;
  timeoutMs: number;
}

/**
 * Monta o thunk de chamada para o `provider_type` resolvido. Lança `ProviderConfigError`
 * (falha de configuração) ANTES de qualquer fetch; nada de chute de endereço ou segredo.
 */
function buildDispatch(args: DispatchArgs): () => Promise<Response> {
  const provider = args.provider;
  const label = providerLabel(provider);
  const tools = args.tools ?? undefined;
  const toolChoice = args.toolChoice ?? undefined;

  switch (provider.provider_type) {
    case "lovable_ai": {
      const apiKey = requireSecret("LOVABLE_API_KEY", label);
      // Só o que o adaptador monta: ele não aceita `config`, então temperature/extraBody
      // não têm por onde viajar neste ramo.
      return () =>
        callLovableAI({
          messages: args.messages,
          apiKey,
          model: args.model ?? undefined,
          tools,
          toolChoice,
          options: { timeoutMs: args.timeoutMs },
        });
    }
    case "openai_compatible":
    case "google_gemini": {
      if (!provider.api_endpoint) {
        throw new ProviderConfigError(`Endpoint da API nao configurado para o provedor ${label}.`);
      }
      const apiKey = requireSecret(provider.api_key_secret_name, label);
      const raw = asPlainObject(provider.config);
      // Ordem: allowlist do config do provedor, depois o extraBody do chamador filtrado;
      // `headers` e `temperature` explícitos vencem (config não pode sobrescrever).
      const config: Record<string, unknown> = {
        ...filterConfigBody(raw),
        ...filterExtraBody(args.extraBody),
        headers: filterHeaders(raw["headers"]),
      };
      if (args.temperature !== null) config["temperature"] = args.temperature;
      const endpoint = provider.api_endpoint;
      return () =>
        callOpenAICompatible({
          endpoint,
          apiKey,
          messages: args.messages,
          model: args.model ?? undefined,
          tools,
          toolChoice,
          config,
          options: { timeoutMs: args.timeoutMs },
        });
    }
    case "custom_webhook": {
      if (!provider.api_endpoint) {
        throw new ProviderConfigError(`Endpoint nao configurado para o provedor ${label}.`);
      }
      const endpoint = provider.api_endpoint;
      const secretName = provider.api_key_secret_name;
      const apiKey = secretName ? Deno.env.get(secretName) ?? undefined : undefined;
      const raw = asPlainObject(provider.config);
      const config: Record<string, unknown> = {
        ...filterExtraBody(raw),
        headers: filterHeaders(raw["headers"]),
        extra_body: {
          ...filterExtraBody(raw["extra_body"]),
          ...filterExtraBody(args.extraBody),
        },
      };
      // IA-041: o webhook recebe o MESMO prazo por capacidade dos demais ramos
      // (interface congelada `options?: { timeoutMs?: number }`), fechando o teto
      // que antes não existia neste ramo.
      return () => callCustomWebhook({ endpoint, apiKey, messages: args.messages, config, options: { timeoutMs: args.timeoutMs } });
    }
    case "custom_agent":
      // Tipo sem caminho de chamada neste módulo: falha explícita, nunca um chute.
      throw new ProviderConfigError(`Tipo de provedor sem caminho de chamada: custom_agent (${label}).`);
    default:
      throw new ProviderConfigError(`Tipo de provedor nao suportado: ${provider.provider_type} (${label}).`);
  }
}

/**
 * Escolhe o provedor por MODALIDADE DECLARADA (IA-033 — visão/áudio).
 *
 * Vive AQUI (e não em `ai-routing.ts`) porque depende de `declaredCapabilities`
 * de `./ai-capabilities.ts` — manter o módulo puro de roteamento livre dessa
 * dependência (o desenho congelado). Sem `providerId` e SEM exigir `is_default`:
 * a modalidade é o critério, não o padrão de texto (o DeepSeek segue dono do
 * texto). Falha FECHADA: nenhum candidato → NO_PROVIDER; mais de um → o
 * AMBIGUOUS_PROVIDER de sempre (nunca sortear a ordem do banco).
 */
function resolveProviderByModalities(
  rows: AiProviderRow[],
  requiredModalities: readonly AiModality[],
): AiProviderRow {
  const list: AiProviderRow[] = Array.isArray(rows) ? rows : [];
  const lista = requiredModalities.join(', ');

  const candidates = list.filter(
    (row) =>
      row?.is_active === true &&
      requiredModalities.every((modality) =>
        declaredCapabilities(row).modalities.includes(modality),
      ),
  );

  if (candidates.length === 0) {
    throw new AiRoutingError(
      'NO_PROVIDER',
      `Nenhum provedor ativo declara as modalidades exigidas: ${lista}.`,
    );
  }
  if (candidates.length > 1) {
    // Ordena só para a mensagem: a decisão não pode depender da ordem do banco.
    const ids = candidates.map((row) => row.id).sort((a, b) => a.localeCompare(b)).join(', ');
    throw new AiRoutingError(
      'AMBIGUOUS_PROVIDER',
      `Mais de um provedor ativo declara as modalidades exigidas (${lista}): ${ids}. Desative/remova o provedor duplicado.`,
    );
  }
  return candidates[0];
}

/**
 * Chama a IA pelo provedor resolvido para a finalidade.
 *
 * Lança SOMENTE erro de programação (parâmetro obrigatório ausente/ inválido). Falha de
 * provedor, HTTP, rede, capacidade ou configuração vira `{ ok: false, errorCode }` com
 * `Response` sintética — o consumidor trata com o mesmo `!response.ok || !data` de antes.
 */
export async function generateWithRouting(params: GenerateParams): Promise<GenerateResult> {
  const startedAt = Date.now();

  // --- (10) validação: só isto lança ------------------------------------------
  const functionName = requireText(params?.functionName, "functionName");
  // Não-string é erro de programação; string desconhecida segue para `resolveProvider`,
  // que devolve BAD_PURPOSE como `ok:false` (400) — nunca um lançamento para o chamador.
  const purpose = requireText(params?.purpose, "purpose") as AiPurpose;

  const messages = params?.messages;
  if (!Array.isArray(messages)) {
    throw new TypeError('generateWithRouting: "messages" e obrigatorio e deve ser um array.');
  }

  const system = params.system ?? null;
  if (system !== null && typeof system !== "string") {
    throw new TypeError('generateWithRouting: "system" deve ser string ou null.');
  }

  const need = params.need ?? null;
  if (need !== null && !isPlainObject(need)) {
    throw new TypeError('generateWithRouting: "need" deve ser um objeto ou null.');
  }

  const tools = params.tools ?? null;
  if (tools !== null && !Array.isArray(tools)) {
    throw new TypeError('generateWithRouting: "tools" deve ser um array ou null.');
  }

  const extraBody = params.extraBody ?? null;
  if (extraBody !== null && !isPlainObject(extraBody)) {
    throw new TypeError('generateWithRouting: "extraBody" deve ser um objeto ou null.');
  }

  const timeoutMs = params.timeoutMs ?? resolveDefaultTimeoutMs(purpose, need?.modality);
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('generateWithRouting: "timeoutMs" deve ser um numero finito e positivo.');
  }

  // (6) temperature só viaja quando é número finito; inválida não vira pedido.
  const temperature = typeof params.temperature === "number" && Number.isFinite(params.temperature)
    ? params.temperature
    : null;

  const userId = params.userId ?? null;

  // IA-051 — correlação. Aqui só repassamos: quem normaliza é o logger, que
  // descarta qualquer coisa que não seja uuid (ver `normalizeCorrelationId`).
  const requestId = params.requestId ?? null;
  const jobId = params.jobId ?? null;
  const attempt = params.attempt ?? null;

  // --- (8) auditoria: SEMPRE, em todos os desfechos ---------------------------
  const logUsage = (entry: {
    model: string | null;
    status: string;
    errorMessage?: string | null;
    inputTokens?: number;
    outputTokens?: number;
    providerId: string | null;
    providerName: string | null;
    modelSubstituted: boolean;
  }): Promise<void> =>
    logAiUsage({
      functionName,
      userId,
      requestId,
      jobId,
      attempt,
      model: entry.model,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      durationMs: Date.now() - startedAt,
      status: entry.status,
      errorMessage: entry.errorMessage ?? null,
      metadata: {
        purpose,
        provider_id: entry.providerId,
        provider_name: entry.providerName,
        model_substituted: entry.modelSubstituted,
      },
    });

  const finish = (
    ok: boolean,
    response: Response,
    data: Record<string, unknown> | null,
    providerId: string | null,
    providerName: string | null,
    model: string | null,
    errorCode: AiGenerateErrorCode | null,
  ): GenerateResult => ({
    ok,
    response,
    data,
    providerId,
    providerName,
    model,
    durationMs: Date.now() - startedAt,
    status: ok ? "success" : "error",
    errorCode,
    fallbackUsed: false,
  });

  // --- (1)(2) provedores do banco + roteamento determinístico -----------------
  const { rows } = await loadProviders();

  // IA-033: a modalidade exigida (quando há) RESTRINGE o conjunto de provedores.
  // Texto puro cai no caminho de sempre (`resolveProvider` + is_default = DeepSeek);
  // qualquer modalidade não-texto (visão/áudio) resolve por capacidade declarada.
  const requestedModality: AiModality | undefined = params.need?.modality;
  const requiredModalities: AiModality[] = requestedModality ? [requestedModality] : [];
  const usesNonTextModality = requiredModalities.some((modality) => modality !== 'text');

  let provider: AiProviderRow;
  let routing: ReturnType<typeof resolveModel>;
  try {
    if (usesNonTextModality) {
      // O caminho por modalidade não passa por `resolveProvider`, então a
      // finalidade é validada aqui — `purpose` continua obrigatória e válida.
      if (!(AI_PURPOSES as readonly string[]).includes(purpose)) {
        throw new AiRoutingError(
          'BAD_PURPOSE',
          `Finalidade de IA inválida: ${String(purpose)}.`,
        );
      }
      provider = resolveProviderByModalities(rows, requiredModalities);
    } else {
      provider = resolveProvider(rows, purpose);
    }
    // (4) modelo sempre decidido pelo servidor: o `model` do cliente não existe aqui.
    routing = resolveModel(provider, null);
  } catch (err) {
    if (err instanceof AiRoutingError) {
      await logUsage({
        model: null,
        status: "error",
        errorMessage: err.message,
        providerId: null,
        providerName: null,
        modelSubstituted: false,
      });
      return finish(
        false,
        failureResponse(routingStatus(err.code), err.code, err.message),
        null,
        null,
        null,
        null,
        err.code,
      );
    }
    throw err;
  }

  const providerId = provider.id ?? null;
  const providerName = provider.name ?? null;
  const model = routing.model;
  const modelSubstituted = routing.modelSubstituted;

  // --- (3) capacidades: só quando o chamador declarou a necessidade -----------
  if (need !== null) {
    try {
      assertCapabilities(provider, need);
    } catch (err) {
      if (err instanceof AiCapabilityError) {
        await logUsage({
          model,
          status: "error",
          errorMessage: err.message,
          providerId,
          providerName,
          modelSubstituted,
        });
        return finish(false, failureResponse(400, err.code, err.message), null, providerId, providerName, model, err.code);
      }
      throw err;
    }
  }

  // --- (5)(6)(7) mensagens compostas + dispatch por tipo ----------------------
  let callFn: () => Promise<Response>;
  try {
    callFn = buildDispatch({
      provider,
      model,
      // A política do servidor vai na posição 0; as mensagens do cliente não são mutadas.
      messages: composeMessages(system, messages as Array<{ role: string; content: unknown }>),
      tools,
      toolChoice: params.toolChoice,
      extraBody,
      temperature,
      timeoutMs,
    });
  } catch (err) {
    if (err instanceof ProviderConfigError) {
      await logUsage({
        model,
        status: "error",
        errorMessage: err.message,
        providerId,
        providerName,
        modelSubstituted,
      });
      return finish(false, failureResponse(500, null, err.message), null, providerId, providerName, model, null);
    }
    throw err;
  }

  // --- IA-044: RESERVA de orçamento ANTES de tocar o provedor -----------------
  // `params.budgetTokens <= 0` (ausente cai no teto padrão) DESLIGA a política: segue
  // sem reserva. A chave explícita vence a derivada, que existe para que a MESMA
  // solicitação caia sempre na MESMA reserva (retry não dobra consumo).
  const budgetTokens = params.budgetTokens ?? DEFAULT_AI_BUDGET_TOKENS;
  const maxOutputTokens = params.need?.outputTokens ?? null;
  const reserva: { id: string | null; allowed: boolean; usedTokens: number; limitTokens: number } =
    budgetTokens > 0
      ? await reserveBudget({
          idempotencyKey:
            params.idempotencyKey ??
            deriveAiIdempotencyKey(functionName, userId, model ?? "", messages, maxOutputTokens),
          userId,
          functionName,
          estimatedTokens: estimateAiTokens(messages, maxOutputTokens),
          limitTokens: budgetTokens,
          // A reserva tem de sobreviver à chamada INTEIRA: o TTL cobre todas as
          // tentativas dentro do prazo da capacidade (2x de folga sobre `timeoutMs`).
          ttlMs: 2 * timeoutMs,
        })
      : { id: null, allowed: true, usedTokens: 0, limitTokens: budgetTokens };

  // Falha FECHADA de verdade (`allowed:false` é negação da RPC, não infraestrutura):
  // o teto estourou e o provedor NÃO é chamado. Distinta da falha ABERTA de rede/db,
  // em que `reserveBudget` devolve `allowed:true` e o despacho segue normalmente.
  if (reserva.allowed === false) {
    const motivo = `Orcamento de IA esgotado para ${functionName} (${reserva.usedTokens}/${reserva.limitTokens} tokens).`;
    await logUsage({
      model,
      status: "error",
      errorMessage: motivo,
      providerId,
      providerName,
      modelSubstituted,
    });
    return finish(
      false,
      failureResponse(
        429,
        AI_BUDGET_ERROR_CODE,
        `${motivo} Tente novamente apos o orcamento liberar.`,
      ),
      null,
      providerId,
      providerName,
      model,
      AI_BUDGET_ERROR_CODE,
    );
  }

  let response: Response;
  try {
    // IA-041: `budgetMs` é o prazo TOTAL da capacidade, somando todas as tentativas —
    // sem ele, um estouro de 60s (visão) poderia virar 3 estouros em fila.
    response = await withRetry(callFn, RETRY_MAX, RETRY_BASE_DELAY_MS, { budgetMs: timeoutMs });
  } catch (err) {
    // Exceção/aborto (rede, timeout): desfecho auditado, sem lançar para o chamador.
    const message = errorText(err);
    // IA-041: o estouro do prazo abortou o AbortController do provedor. Voltar como
    // 504/TIMEOUT torna o cancelamento distinguível de um 502 de rede qualquer.
    const timedOut = isAbortOrTimeoutError(err);
    await logUsage({
      model,
      status: "error",
      errorMessage: timedOut ? `Timeout apos ${timeoutMs}ms: ${message}` : message,
      providerId,
      providerName,
      modelSubstituted,
    });
    // IA-044: a execução morreu antes de gastar → a reserva volta ao orçamento.
    if (reserva.id) await releaseBudget(reserva.id, timedOut ? "timeout" : "provider_error");
    return finish(
      false,
      failureResponse(
        timedOut ? 504 : 502,
        timedOut ? AI_TIMEOUT_ERROR_CODE : null,
        timedOut
          ? `Tempo esgotado na chamada do provedor apos ${timeoutMs}ms: ${message}`
          : `Falha na chamada do provedor: ${message}`,
      ),
      null,
      providerId,
      providerName,
      model,
      timedOut ? AI_TIMEOUT_ERROR_CODE : null,
    );
  }

  // (9) erro HTTP: a resposta REAL volta para o consumidor (429/402 continuam tratáveis).
  if (!response.ok) {
    await logUsage({
      model,
      status: "error",
      errorMessage: `HTTP ${response.status}`,
      providerId,
      providerName,
      modelSubstituted,
    });
    // IA-044: o provedor recusou → nenhum uso foi medido; a reserva volta ao orçamento.
    if (reserva.id) await releaseBudget(reserva.id, `http_${response.status}`);
    return finish(false, response, null, providerId, providerName, model, null);
  }

  // (9) resposta não-JSON → data null (o consumidor decide o fallback dele, como hoje).
  let data: Record<string, unknown> | null = null;
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    data = null;
  }

  const usage = data !== null
    ? extractTokenUsage(data)
    : { inputTokens: 0, outputTokens: 0, model: null };

  // IA-044: liquida a reserva com o uso REAL medido (input+output da resposta) —
  // NUNCA com a estimativa da reserva, que só dimensionou a folga.
  if (reserva.id) {
    const medido = usage.inputTokens + usage.outputTokens;
    await settleBudget(reserva.id, Number.isFinite(medido) ? medido : 0);
  }

  await logUsage({
    model: usage.model || model,
    status: data !== null ? "success" : "error",
    errorMessage: data !== null ? null : "Resposta do provedor nao e JSON valido.",
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    providerId,
    providerName,
    modelSubstituted,
  });

  return finish(data !== null, response, data, providerId, providerName, model, null);
}
