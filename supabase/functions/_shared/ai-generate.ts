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
 *     `withRetry` e teto de tempo (30s por padrão);
 *  8. chama `logAiUsage` em TODOS os desfechos (sucesso, erro HTTP, exceção, erro de
 *     roteamento/capacidade): nenhuma chamada paga fica invisível;
 *  9. devolve `data` = JSON do provedor (`choices[0].message.content` continua
 *     funcionando nos consumidores) e `data:null` quando a resposta não é JSON;
 * 10. NÃO lança por falha de provedor — devolve `ok:false`. Só lança erro de
 *     programação (parâmetro obrigatório ausente/com tipo inválido).
 *
 * Diferença esperada em relação aos módulos puros (`ai-routing`/`ai-capabilities`):
 * aqui usa-se `Deno.env`, `fetch` e o client Supabase com service role.
 *
 * Limites do desenho congelado (não são bugs, são contrato):
 *  - `callLovableAI` não aceita `config`: para `lovable_ai` só viajam os campos que o
 *    adaptador monta (model/messages/tools/tool_choice), então `temperature` e
 *    `extraBody` são descartados nesse ramo — "o que o filtro do adaptador permitir";
 *  - `callCustomWebhook` não aceita `options`: o ramo webhook não tem teto próprio;
 *  - não há fallback aqui: `status` nunca vale 'fallback' e `fallbackUsed` é sempre
 *    `false` (a troca explícita de fornecedor é do `ai-proxy`, IA-039).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import {
  AiRoutingError,
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
  type AiCapabilityErrorCode,
  type AiCapabilityNeed,
} from "./ai-capabilities.ts";
import {
  callCustomWebhook,
  callLovableAI,
  callOpenAICompatible,
  withRetry,
} from "./ai-providers.ts";
import { extractTokenUsage, logAiUsage } from "./ai-usage.ts";

/** Teto de tempo padrão por chamada (mesmo valor do gateway antigo). */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Tentativas extras do `withRetry` e base do backoff (igual ao ai-proxy). */
const RETRY_MAX = 2;
const RETRY_BASE_DELAY_MS = 500;

/** Parâmetros da chamada roteada. */
export interface GenerateParams {
  /** Finalidade (roteamento central). */
  purpose: AiPurpose;
  /** `ai_usage_logs.function_name`. */
  functionName: string;
  userId?: string | null;
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
  errorCode?: AiRoutingErrorCode | AiCapabilityErrorCode | null;
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
  messages: Array<{ role: string; content: string }>;
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
      // `callCustomWebhook` não recebe `options`: sem teto próprio neste ramo.
      return () => callCustomWebhook({ endpoint, apiKey, messages: args.messages, config });
    }
    case "custom_agent":
      // Tipo sem caminho de chamada neste módulo: falha explícita, nunca um chute.
      throw new ProviderConfigError(`Tipo de provedor sem caminho de chamada: custom_agent (${label}).`);
    default:
      throw new ProviderConfigError(`Tipo de provedor nao suportado: ${provider.provider_type} (${label}).`);
  }
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

  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('generateWithRouting: "timeoutMs" deve ser um numero finito e positivo.');
  }

  // (6) temperature só viaja quando é número finito; inválida não vira pedido.
  const temperature = typeof params.temperature === "number" && Number.isFinite(params.temperature)
    ? params.temperature
    : null;

  const userId = params.userId ?? null;

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
    errorCode: AiRoutingErrorCode | AiCapabilityErrorCode | null,
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

  let provider: AiProviderRow;
  let routing: ReturnType<typeof resolveModel>;
  try {
    provider = resolveProvider(rows, purpose);
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
      messages: composeMessages(system, messages as Array<{ role: string; content: string }>),
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

  let response: Response;
  try {
    response = await withRetry(callFn, RETRY_MAX, RETRY_BASE_DELAY_MS);
  } catch (err) {
    // Exceção/aborto (rede, timeout): desfecho auditado, sem lançar para o chamador.
    const message = errorText(err);
    await logUsage({
      model,
      status: "error",
      errorMessage: message,
      providerId,
      providerName,
      modelSubstituted,
    });
    return finish(
      false,
      failureResponse(502, null, `Falha na chamada do provedor: ${message}`),
      null,
      providerId,
      providerName,
      model,
      null,
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
