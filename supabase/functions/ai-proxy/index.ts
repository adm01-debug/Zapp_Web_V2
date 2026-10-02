/**
 * AI Proxy Edge Function
 * Roteia chamadas de IA pelo provedor configurado no painel e só troca de fornecedor
 * com autorização EXPLÍCITA no config (nunca por destino fixo em env).
 *
 * Bloco 04 (IA-031/034/035/037/038): roteamento determinístico via _shared/ai-routing.ts
 * (sem `limit(1)` sem ORDER BY e sem inventar provedor), modelo decidido pelo SERVIDOR,
 * política de sistema sem sobrescrever mensagem do cliente e config do provedor lida
 * apenas pelos filtros do módulo de roteamento.
 *
 * Bloco 04 / PR-2 (IA-036/039/040):
 *  - IA-036: `assertCapabilities` roda ANTES do dispatch com o pedido derivado do corpo
 *    (vision/tools/json/streaming); pedido não coberto → 400 com o `code` da capacidade.
 *  - IA-039: fallback só com `config.allow_fallback === true` E destino existente/ativo
 *    em `config.fallback_provider_id`, diferente da origem. O OpenRouter fixo por env
 *    deixou de ser destino; motivo e destino efetivos vão para o metadata da auditoria.
 *  - IA-040: campo `test` — destino fixo por `provider_id`, fallback desligado, modelo
 *    efetivo de `resolveModel`, timeout por chamada e classificação própria da falha.
 */
import { handleCors, errorResponse, jsonResponse, Logger, requireEnv, requireAuth, checkRateLimit, getClientIP } from "../_shared/validation.ts";
import { z, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { logAiUsageDetached, extractTokenUsage, extractUserIdFromRequest } from "../_shared/ai-usage.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";
import { callLovableAI, callOpenAICompatible, callCustomWebhook, withRetry } from "../_shared/ai-providers.ts";
import {
  AiRoutingError,
  resolveProvider,
  resolveModel,
  composeMessages,
  filterConfigBody,
  filterHeaders,
  filterExtraBody,
  type AiProviderRow,
} from "../_shared/ai-routing.ts";
import {
  AiCapabilityError,
  assertCapabilities,
  type AiCapabilityNeed,
  type AiFeature,
  type AiModality,
} from "../_shared/ai-capabilities.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";

const AiProxySchema = z.object({
  messages: z.array(z.object({
    role: z.string().max(50),
    // IA-036: partes não-textuais (vision) precisam CHEGAR aqui para serem recusadas
    // com código (`UNSUPPORTED_MODALITY`) em vez de virarem 400 genérico de schema.
    content: z.union([z.string().max(50000), z.array(z.any())]),
  })).min(1).max(100),
  model: z.string().max(100).optional(),
  use_for: z.enum(['copilot', 'analysis', 'summary', 'tagging', 'auto_reply']).default('copilot'),
  provider_id: z.string().uuid().optional(),
  tools: z.any().optional(),
  tool_choice: z.any().optional(),
  stream: z.boolean().optional().default(false),
  // IA-036: JSON estruturado exige a feature `json` declarada pelo provedor.
  response_format: z.any().optional(),
  // IA-040: diagnóstico de UM provedor (destino fixo, sem fallback).
  test: z.boolean().optional().default(false),
  // IA-048: identidade da requisição, ecoada no corpo (só eco — sem efeito novo).
  requestId: z.string().uuid("requestId must be a valid UUID").optional(),
});

/** Teto de tempo por chamada no modo teste (IA-040). */
const TEST_TIMEOUT_MS = 15_000;

/** Mensagem no formato aceito pelos helpers de chamada (`_shared/ai-providers.ts`). */
type ProxyMessage = { role: string; content: unknown };

/** Códigos do diagnóstico de teste (IA-040) — taxonomia fechada do desenho. */
type TestCode = 'ROUTING' | 'CAPABILITY' | 'MISSING_KEY' | 'QUOTA' | 'CONTRACT' | 'NETWORK';

/**
 * Motivo auditável do fallback (IA-039): as mesmas classes, menos as que nunca
 * chegam ao dispatch — roteamento e capacidade falham ANTES de qualquer chamada.
 */
type FailureClass = Exclude<TestCode, 'ROUTING' | 'CAPABILITY'>;

/**
 * A configuração do provedor impede a chamada — sempre ANTES de qualquer fetch
 * (endpoint/segredo ausente ou tipo sem caminho de chamada). O modo teste (IA-040)
 * classifica como MISSING_KEY sem tocar a rede.
 */
class ProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderConfigError';
  }
}

/** Segredo do provedor ou falha de configuração (nunca chamar o provedor sem chave). */
function requireProviderSecret(secretName: string | null): string {
  if (!secretName) {
    throw new ProviderConfigError("api_key_secret_name nao configurado para este provedor.");
  }
  const value = Deno.env.get(secretName);
  if (!value) {
    throw new ProviderConfigError(`Segredo ${secretName} nao encontrado nos secrets (Deno.env).`);
  }
  return value;
}

/** Campo "presente" no corpo (null/undefined = ausente, não é pedido). */
function present(value: unknown): boolean {
  return value !== undefined && value !== null;
}

/** Normaliza a config vinda do banco (nunca confia no formato). */
function asPlainConfig(config: unknown): Record<string, unknown> {
  return (config && typeof config === 'object' && !Array.isArray(config))
    ? config as Record<string, unknown>
    : {};
}

/**
 * IA-039 — config reduzida às CHAVES PRÓPRIAS: herança de protótipo (ex.: config
 * literal com `__proto__`) não autoriza fallback nem aponta destino. `Object.entries`
 * só devolve chaves próprias enumeráveis e `Object.fromEntries` as recria como
 * propriedade própria (inclusive `__proto__`, via CreateDataProperty) — então
 * `allow_fallback`/`fallback_provider_id` só são lidos como chave própria.
 */
function ownConfig(config: unknown): Record<string, unknown> {
  return Object.fromEntries(Object.entries(asPlainConfig(config)));
}

/**
 * Config para chamadas de chat (openai_compatible/google_gemini): corpo apenas com a
 * allowlist do módulo e cabeçalhos apenas com os nomes permitidos. Nenhum espalhamento
 * de config cru — `headers`/`extra_body` do painel nunca vão direto.
 *
 * IA-036: o `response_format` do cliente (quando presente) só entra no corpo porque a
 * capacidade `json` já foi exigida — sem isso o parâmetro sumia em silêncio.
 */
function chatProviderConfig(config: unknown, responseFormat?: unknown): Record<string, unknown> {
  const raw = asPlainConfig(config);
  const body = filterConfigBody(raw);
  if (present(responseFormat)) body['response_format'] = responseFormat;
  return {
    ...body,
    headers: filterHeaders(raw['headers']),
  };
}

/**
 * Config para webhook/agente: preserva as chaves específicas do provedor (ex.: auth_scheme
 * e parâmetros próprios) mas tira as reservadas; `extra_body` e cabeçalhos passam pelos filtros.
 */
function webhookProviderConfig(config: unknown): Record<string, unknown> {
  const raw = asPlainConfig(config);
  return {
    ...filterExtraBody(raw),
    headers: filterHeaders(raw['headers']),
    extra_body: filterExtraBody(raw['extra_body']),
  };
}

/**
 * IA-036 — modalidade exigida por uma PARTE não-textual do conteúdo (null = texto).
 *  - áudio (`input_audio`, `audio_url`, `{"type":"audio..."}`) → `audio_stt`, que é o
 *    caso de ENTRADA de áudio (transcrição); `audio_tts`/`audio_sts` não são pedidos aqui;
 *  - imagem (`image_url`, `{"type":"image..."}`) → `vision`;
 *  - parte não-textual sem tipo reconhecido → `vision` (comportamento anterior): o
 *    provedor que não declarar a modalidade recusa, nada é aceito em silêncio.
 */
function partModality(part: unknown): AiModality | null {
  if (part === null || typeof part !== 'object') return null;
  const record = part as Record<string, unknown>;
  if (present(record['input_audio']) || present(record['audio_url'])) return 'audio_stt';
  if (present(record['image_url'])) return 'vision';
  const type = record['type'];
  if (typeof type !== 'string' || type === 'text') return null;
  if (type.includes('audio')) return 'audio_stt';
  if (type.includes('image')) return 'vision';
  return 'vision';
}

/**
 * IA-036 — modalidade não-texto pedida pelo corpo (`undefined` = só texto).
 * Imagem → `vision`; áudio → `audio_stt`; ambos são partes não-texto.
 *
 * Escolha com os DOIS presentes: prevalece `audio_stt`. O pedido carrega UMA modalidade,
 * e áudio é a mais específica/restritiva das duas (é a que menos provedores declaram e
 * está no aceite literal do IA-036) — pedir `vision` aqui perderia o requisito de áudio,
 * que é exatamente o defeito corrigido. Imagem presente junto de áudio volta a ser
 * exigida quando o áudio não estiver no payload.
 */
function nonTextModality(messages: Array<{ content: unknown }>): AiModality | undefined {
  let sawVision = false;
  for (const message of messages) {
    const content = message?.content;
    if (typeof content === 'string' || content === null || content === undefined) continue;
    if (Array.isArray(content)) {
      for (const part of content as unknown[]) {
        const modality = partModality(part);
        if (modality === 'audio_stt') return 'audio_stt';
        if (modality === 'vision') sawVision = true;
      }
    } else if (present(content)) {
      // Conteúdo não-texto fora do formato de partes: mesmo gatilho de antes (vision).
      sawVision = true;
    }
  }
  return sawVision ? 'vision' : undefined;
}

/**
 * IA-036 — pedido de capacidade derivado do CORPO (nunca adivinhado): conteúdo de imagem →
 * vision, de áudio → audio_stt; tools/tool_choice → feature tools; response_format → feature
 * json; stream → feature streaming.
 */
function capabilityNeedFromBody(body: {
  messages: Array<{ content: unknown }>;
  tools: unknown;
  tool_choice: unknown;
  stream: boolean;
  response_format: unknown;
}): AiCapabilityNeed {
  const features: AiFeature[] = [];
  if (present(body.tools) || present(body.tool_choice)) features.push('tools');
  if (present(body.response_format)) features.push('json');
  if (body.stream) features.push('streaming');

  return {
    modality: nonTextModality(body.messages),
    features,
  };
}

/** Mensagem de erro legível (nunca "undefined"). */
function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Corpo da resposta em texto; corpo já consumido não derruba a classificação. */
async function bodyText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

/** Texto da primeira escolha — só para o `detail` do diagnóstico (IA-040). */
function firstMessageContent(data: Record<string, unknown>): string {
  const choices = Array.isArray(data['choices']) ? (data['choices'] as unknown[]) : [];
  const first = choices[0] as { message?: { content?: unknown } } | undefined;
  const content = first?.message?.content;
  return typeof content === 'string' ? content : 'ok';
}

/** Modelo que o caminho de fallback realmente usou (auditoria não mente). */
type FallbackDestination = { id: string; name: string };

/** Status HTTP do erro de roteamento — mesma decisão nos dois caminhos. */
function routingStatus(err: AiRoutingError): number {
  // NO_PROVIDER/AMBIGUOUS_PROVIDER caem no default 503; só estes dois saem da regra.
  const status = err.code === 'PROVIDER_INACTIVE' ? 409 : err.code === 'BAD_PURPOSE' ? 400 : 503;
  return status;
}

/**
 * Resposta explícita de roteamento. NÃO usa errorResponse: em 5xx ele troca o corpo por
 * "Internal server error" e o cliente ficaria sem o código (NO_PROVIDER/AMBIGUOUS_PROVIDER).
 * Estes casos nunca caem no fallback.
 */
function routingErrorResponse(err: AiRoutingError, req: Request): Response {
  // A mensagem do módulo já lista os ids conflitantes no AMBIGUOUS_PROVIDER.
  return jsonResponse({ error: { code: err.code, message: err.message } }, routingStatus(err), req);
}

/** Opções de dispatch que não vêm do cliente (IA-036 e IA-040). */
interface DispatchOptions {
  /** `response_format` pedido pelo cliente: só chega a quem declara a feature `json`. */
  responseFormat?: unknown;
  /** Teto de tempo por chamada (modo teste). Ausente = comportamento atual do helper. */
  timeoutMs?: number;
}

/** Só manda `options` ao helper quando há teto: sem ele a chamada é a de hoje. */
function timeoutOptions(options: DispatchOptions): { timeoutMs: number } | undefined {
  const timeoutMs = options.timeoutMs;
  return typeof timeoutMs === 'number' && timeoutMs > 0 ? { timeoutMs } : undefined;
}

/**
 * Despacha para o provedor já resolvido. O modelo é SEMPRE o decidido pelo servidor
 * (`resolveModel`), em todos os ramos — inclusive lovable_ai (IA-035).
 *
 * Toda falha de configuração sai daqui como `ProviderConfigError` (antes do fetch), o que
 * dá ao modo teste a classe MISSING_KEY sem depender do texto da mensagem (IA-040).
 */
function dispatchProvider(
  provider: AiProviderRow,
  model: string | null,
  messages: ProxyMessage[],
  tools: unknown,
  toolChoice: unknown,
  stream: boolean,
  options: DispatchOptions = {},
): () => Promise<Response> {
  switch (provider.provider_type) {
    case 'lovable_ai': {
      const apiKey = requireProviderSecret('LOVABLE_API_KEY');
      return () => callLovableAI({ messages, apiKey, model: model ?? undefined, tools, toolChoice, stream, options: timeoutOptions(options) });
    }
    case 'openai_compatible':
    case 'google_gemini': {
      if (!provider.api_endpoint) throw new ProviderConfigError("Endpoint da API nao configurado para este provedor.");
      const apiKey = requireProviderSecret(provider.api_key_secret_name);
      const config = chatProviderConfig(provider.config, options.responseFormat);
      return () => callOpenAICompatible({
        endpoint: provider.api_endpoint!, apiKey, messages,
        model: model ?? undefined, tools, toolChoice, stream, config,
        options: timeoutOptions(options),
      });
    }
    case 'custom_webhook':
    case 'custom_agent': {
      if (!provider.api_endpoint) throw new ProviderConfigError("Endpoint nao configurado para este agente/webhook.");
      const secretName = provider.api_key_secret_name;
      const apiKey = secretName ? Deno.env.get(secretName) ?? undefined : undefined;
      // `callCustomWebhook` não recebe `options` (desenho congelado): sem teto próprio aqui.
      const config = webhookProviderConfig(provider.config);
      return () => callCustomWebhook({ endpoint: provider.api_endpoint!, apiKey, messages, config });
    }
    default:
      // Tipo desconhecido não tem caminho de chamada. Antes caía no OpenRouter fixo por
      // env — que deixou de existir (IA-039): agora é falha explícita de configuração.
      throw new ProviderConfigError(`Tipo de provedor nao suportado: ${provider.provider_type}.`);
  }
}

/**
 * IA-040 — modo teste: diagnostica UM provedor (destino fixo por `provider_id`).
 *
 * Regras duras:
 *  - NUNCA troca de serviço (sem fallback): a falha é do provedor testado;
 *  - usa o modelo EFETIVO de `resolveModel` e o devolve no corpo;
 *  - chave/endpoint ausentes falham ANTES de qualquer fetch (MISSING_KEY);
 *  - classifica a falha com status coerente e devolve no sucesso o `provider_id` testado.
 * Sem retry: o diagnóstico mede UMA tentativa real (latency_ms honesto).
 */
async function runProviderTest(params: {
  req: Request;
  log: Logger;
  provider: AiProviderRow;
  model: string | null;
  messages: ProxyMessage[];
  tools: unknown;
  toolChoice: unknown;
  stream: boolean;
  responseFormat: unknown;
  need: AiCapabilityNeed;
}): Promise<Response> {
  const startTime = Date.now();
  const { req, log, provider, model } = params;

  /** Falha do diagnóstico: sempre com o provedor testado identificado no corpo. */
  const fail = (code: TestCode, status: number, detail: string): Response => {
    log.warn('Provider test failed', { code, provider: provider.name, status, detail });
    return jsonResponse({
      ok: false,
      code,
      provider_id: provider.id,
      provider_name: provider.name,
      model_used: model,
      latency_ms: Date.now() - startTime,
      detail,
    }, status, req);
  };

  // IA-036: capacidade declarada recusada AQUI (sem dispatch) e na taxonomia do teste.
  try {
    assertCapabilities(provider, params.need);
  } catch (capErr) {
    if (capErr instanceof AiCapabilityError) return fail('CAPABILITY', 400, capErr.message);
    throw capErr;
  }

  // Endpoint/segredo ausentes são falha de configuração: nada de fetch com chave vazia.
  let callFn: () => Promise<Response>;
  try {
    callFn = dispatchProvider(provider, model, params.messages, params.tools, params.toolChoice, params.stream, {
      responseFormat: params.responseFormat,
      timeoutMs: TEST_TIMEOUT_MS,
    });
  } catch (configErr) {
    if (configErr instanceof ProviderConfigError) {
      const alvo = provider.api_key_secret_name ?? provider.api_endpoint ?? provider.name;
      return fail('MISSING_KEY', 404, `${alvo}: ${errorText(configErr)}`);
    }
    throw configErr;
  }

  let response: Response;
  try {
    response = await callFn();
  } catch (netErr) {
    // fetch lançou/abortou — o estouro do AbortController cai aqui.
    return fail('NETWORK', 502, errorText(netErr));
  }

  const body = await bodyText(response);

  if (!response.ok) {
    const detail = `HTTP ${response.status}: ${body.slice(0, 300)}`;
    if (response.status === 429 || response.status === 402) return fail('QUOTA', 429, detail);
    if (response.status >= 500) return fail('NETWORK', 502, detail);
    return fail('CONTRACT', 400, detail);
  }

  if (params.stream) {
    // Streaming não traz JSON de uso: a validação é o evento ter chegado.
    if (body.trim() === '') return fail('CONTRACT', 400, 'Resposta vazia do provedor.');
    log.done(200, { provider: provider.name, test: true, streaming: true });
    return jsonResponse({
      ok: true,
      code: null,
      provider_id: provider.id,
      provider_name: provider.name,
      model_used: model,
      latency_ms: Date.now() - startTime,
      detail: 'streaming: eventos recebidos',
    }, 200, req);
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return fail('CONTRACT', 400, 'Resposta do provedor nao e JSON valido.');
  }
  if (!Array.isArray(data['choices']) || data['choices'].length === 0) {
    return fail('CONTRACT', 400, 'Resposta do provedor fora da forma esperada (sem choices).');
  }

  const { inputTokens, outputTokens } = extractTokenUsage(data);
  log.done(200, { provider: provider.name, test: true, tokens: inputTokens + outputTokens });
  // O corpo do sucesso carrega o provedor TESTADO — nunca o de outro serviço.
  return jsonResponse({
    ok: true,
    code: null,
    provider_id: provider.id,
    provider_name: provider.name,
    model_used: model,
    latency_ms: Date.now() - startTime,
    detail: firstMessageContent(data).slice(0, 200),
    input_tokens: inputTokens,
    output_tokens: outputTokens,
  }, 200, req);
}

/** Falha ao montar/executar o dispatch, na taxonomia do modo teste (IA-039). */
function classifyDispatchError(err: unknown): FailureClass {
  return err instanceof ProviderConfigError ? 'MISSING_KEY' : 'NETWORK';
}

/** Falha devolvida pelo provedor por HTTP, na mesma taxonomia (IA-040). */
function classifyHttpFailure(status: number): FailureClass {
  if (status === 429 || status === 402) return 'QUOTA';
  // 5xx: o provedor não entregou resposta utilizável (a taxonomia não tem balde próprio).
  if (status >= 500) return 'NETWORK';
  return 'CONTRACT';
}

/**
 * IA-040 — o corpo pede o MODO TESTE (`test === true`)?
 *
 * `enforceAiGuards` roda ANTES do parse do corpo (ordem preservada para o caminho normal),
 * então o corpo é espiado por CLONE só para saber se é teste — a requisição original segue
 * intacta para o parse. Corpo ausente/ilegível/inválido ⇒ `false` (fluxo comum, com guardas).
 */
async function isTestRequest(req: Request): Promise<boolean> {
  try {
    const raw = (await req.clone().json()) as Record<string, unknown> | null;
    return raw !== null && typeof raw === 'object' && raw['test'] === true;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const authCheck = await requireAuth(req);
  if (authCheck instanceof Response) return authCheck;
  const __uid = (authCheck as { userId: string }).userId;
  // IA-040: em modo teste a cota do usuário NÃO pode influenciar o resultado — o teste é
  // diagnóstico e não consome credito; se `enforceAiGuards` rodasse aqui, uma cota diária
  // estourada devolveria 429 e o painel mostraria 'Falha no teste (CONTRACT)' em vez do
  // diagnóstico real do provedor. Rate-limit por IP, auth e CORS seguem valendo, e para
  // requisições comuns o guard roda exatamente como antes (mesma ordem/status).
  if (!(await isTestRequest(req))) {
    const __guard = await enforceAiGuards({ functionName: "ai-proxy", userId: __uid, req });
    if (__guard) return __guard;
  }

  const log = new Logger("ai-proxy");
  const userId = extractUserIdFromRequest(req);

  try {
    const ip = getClientIP(req);
    const { allowed } = checkRateLimit("proxy:" + ip, 30, 60_000);
    if (!allowed) return errorResponse("Limite de requisicoes excedido. Tente novamente em 1 minuto.", 429, req);

    const parsed = parseBody(AiProxySchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { messages, model: clientModel, use_for, provider_id, tools, tool_choice, stream, response_format, test, requestId } = parsed.data;
    // O schema já aplica o default 'copilot'; o `?? ` só fecha o tipo (parseBody infere a entrada).
    const purpose = use_for ?? 'copilot';
    const isTest = test === true;
    const streamRequested = stream ?? false;
    // O conteúdo pode vir em partes (vision); a checagem de capacidade recusa a
    // modalidade quando o provedor não a declara, então o formato dos helpers vale aqui.
    const chatMessages = messages as ProxyMessage[];

    // IA-040: destino fixo. Sem `provider_id` não há provedor a diagnosticar.
    if (isTest && !provider_id) {
      return jsonResponse({
        ok: false,
        code: 'PROVIDER_REQUIRED',
        provider_id: null,
        provider_name: null,
        model_used: null,
        latency_ms: 0,
        detail: 'Informe provider_id para testar um provedor.',
      }, 400, req);
    }

    // IA-036: o pedido de capacidade é derivado do corpo, nunca adivinhado.
    const need = capabilityNeedFromBody({
      messages: chatMessages,
      tools,
      tool_choice,
      stream: streamRequested,
      response_format,
    });

    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Roteamento determinístico: 0 padrão -> NO_PROVIDER, 2+ -> AMBIGUOUS_PROVIDER (nunca escolhe um).
    let provider: AiProviderRow;
    let routing: ReturnType<typeof resolveModel>;
    try {
      const base = supabase.from('ai_providers').select('*');
      const filtered = provider_id
        // sem filtro de is_active: o módulo distingue INATIVO (409) de inexistente (503)
        ? base.eq('id', provider_id)
        : base.eq('is_active', true).contains('use_for', [purpose]).eq('is_default', true).order('id');
      const { data } = await filtered;
      provider = resolveProvider((data ?? []) as unknown as AiProviderRow[], purpose, provider_id ?? null);
      routing = resolveModel(provider, clientModel ?? null);
    } catch (routingErr) {
      if (routingErr instanceof AiRoutingError) {
        log.warn("Routing recusado", { code: routingErr.code, use_for: purpose, provider_id });
        // IA-040: no modo teste o roteamento também é diagnóstico (código + status coerentes).
        if (isTest) {
          return jsonResponse({
            ok: false,
            code: 'ROUTING',
            provider_id: provider_id ?? null,
            provider_name: null,
            model_used: null,
            latency_ms: 0,
            detail: routingErr.message,
          }, routingStatus(routingErr), req);
        }
        return routingErrorResponse(routingErr, req);
      }
      throw routingErr;
    }

    const providerType = provider.provider_type;
    const providerName = provider.name;

    // IA-040: modo teste sai ANTES do fallback e sem gravar ai_usage_logs — diagnóstico
    // não consome a cota diária do usuário (que mudaria o resultado do próprio teste).
    if (isTest) {
      return await runProviderTest({
        req, log, provider, model: routing.model, messages: chatMessages,
        tools, toolChoice: tool_choice, stream: streamRequested,
        responseFormat: response_format, need,
      });
    }

    log.info("Routing AI call", { provider: providerName, type: providerType, use_for, model: routing.model });

    // IA-036: capacidade declarada ANTES do dispatch — o cliente recebe o `code` da
    // capacidade (mesmo formato do erro de roteamento), não um 5xx opaco.
    try {
      assertCapabilities(provider, need);
    } catch (capErr) {
      if (capErr instanceof AiCapabilityError) {
        log.warn("Capacidade nao declarada pelo provedor", { code: capErr.code, provider: providerName, use_for: purpose });
        return jsonResponse({ error: { code: capErr.code, message: capErr.message } }, 400, req);
      }
      throw capErr;
    }

    // Política do servidor vira mensagem própria; nenhuma mensagem do cliente é removida/reescrita (IA-037).
    const finalMessages = composeMessages(provider.system_prompt, chatMessages);

    // Auditoria da substituição administrativa de modelo (IA-035).
    const modelMetadata = {
      model_requested: routing.modelRequested,
      model_used: routing.model,
      model_substituted: routing.modelSubstituted,
    };

    // IA-039: fallback EXPLÍCITO. `allow_fallback === true` é CONDIÇÃO NECESSÁRIA (padrão
    // = negado) e o destino só vem de `config.fallback_provider_id` — o OpenRouter fixo por
    // env deixou de ser destino. Em modo teste (destino fixo) nunca há troca.
    // IA-039: autorização e destino valem apenas como CHAVE PRÓPRIA do config — herança de
    // protótipo (ex.: config literal com `__proto__`) não autoriza troca de fornecedor.
    const originConfig = ownConfig(provider.config);
    const fallbackAllowed = !isTest && originConfig.allow_fallback === true;
    const rawFallbackId = originConfig.fallback_provider_id;
    const fallbackProviderId = typeof rawFallbackId === 'string' && rawFallbackId.trim() !== ''
      ? rawFallbackId
      : null;

    /**
     * Destino do fallback: precisa existir em `ai_providers`, estar ativo e ser DIFERENTE
     * da origem. Sem autorização (ou sem destino válido) não há troca de fornecedor.
     */
    const loadFallbackTarget = async (): Promise<AiProviderRow | null> => {
      if (!fallbackAllowed || fallbackProviderId === null) return null;
      const { data } = await supabase.from('ai_providers').select('*').eq('id', fallbackProviderId);
      const rows = (data ?? []) as unknown as AiProviderRow[];
      const target = rows.find((row) => row?.id === fallbackProviderId) ?? null;
      if (target === null) return null;
      // Mesma linha da origem e provedor desligado não são destinos aceitáveis.
      if (target.id !== provider.id && target.is_active === true) return target;
      return null;
    };

    /** IA-039: o destino também precisa COBRIR o pedido (formato/capacidade) — nada de troca cega. */
    const coveredFallbackTarget = async (): Promise<AiProviderRow | null> => {
      const target = await loadFallbackTarget();
      if (target === null) return null;
      try {
        assertCapabilities(target, need);
        return target;
      } catch (capErr) {
        if (capErr instanceof AiCapabilityError) {
          log.warn("Fallback recusado: destino nao declara capacidade", { code: capErr.code, provider: target.name });
          return null;
        }
        throw capErr;
      }
    };

    const startTime = Date.now();
    let response: Response;
    let usedFallback = false;
    let modelUsed = routing.model;
    let fallbackReason: FailureClass | null = null;
    let fallbackTo: FallbackDestination | null = null;

    try {
      const callFn = dispatchProvider(provider, modelUsed, finalMessages, tools, tool_choice, streamRequested, { responseFormat: response_format });
      response = await withRetry(callFn, 2, 500);
    } catch (dispatchErr) {
      fallbackReason = classifyDispatchError(dispatchErr);
      const target = await coveredFallbackTarget();
      // Sem autorização/destino válido o erro REAL sobe (nenhuma troca silenciosa).
      if (target === null) throw dispatchErr;
      log.warn("Dispatch falhou, usando o fallback configurado", {
        provider: providerName, fallback_to: target.name, reason: fallbackReason, error: errorText(dispatchErr),
      });
      fallbackTo = { id: target.id, name: target.name };
      modelUsed = resolveModel(target, clientModel ?? null).model;
      response = await withRetry(
        dispatchProvider(target, modelUsed, composeMessages(target.system_prompt, chatMessages), tools, tool_choice, streamRequested, { responseFormat: response_format }),
        2,
        500,
      );
      usedFallback = true;
    }

    const durationMs = Date.now() - startTime;

    if (!response.ok && !usedFallback) {
      const errText = await bodyText(response);
      log.warn("Provider returned error", {
        status: response.status, provider: providerName, error: errText.slice(0, 200),
      });

      if (response.status === 429) return errorResponse("Limite de requisicoes excedido. Tente novamente.", 429, req);
      if (response.status === 402) return errorResponse("Creditos insuficientes. Adicione creditos.", 402, req);

      fallbackReason = classifyHttpFailure(response.status);
      const target = await coveredFallbackTarget();
      if (target !== null) {
        log.warn("Falha do provedor, usando o fallback configurado", {
          provider: providerName, status: response.status, fallback_to: target.name, reason: fallbackReason,
        });
        fallbackTo = { id: target.id, name: target.name };
        modelUsed = resolveModel(target, clientModel ?? null).model;
        response = await withRetry(
          dispatchProvider(target, modelUsed, composeMessages(target.system_prompt, chatMessages), tools, tool_choice, streamRequested, { responseFormat: response_format }),
          2,
          500,
        );
        usedFallback = true;
      }
      // Sem destino válido a resposta original segue para o erro abaixo: o cliente vê a
      // falha do provedor de origem, não um 200 de outro fornecedor.
    }

    // IA-039: motivo e destino SEMPRE explícitos na auditoria (null quando não houve troca).
    const fallbackMetadata = {
      fallback_allowed: fallbackAllowed,
      fallback_reason: fallbackReason,
      fallback_to: fallbackTo ?? null,
      fallback_used: usedFallback,
    };

    if (!response.ok) {
      const errText = await bodyText(response);
      log.error("Final provider error", { status: response.status, error: errText.slice(0, 200) });
      await logAiUsageDetached({
        functionName: 'ai-proxy', userId,
        model: modelUsed,
        durationMs, status: 'error',
        errorMessage: "HTTP " + response.status,
        metadata: {
          ...modelMetadata, model_used: modelUsed, model_resolved: routing.model,
          provider_id: provider.id, provider_type: providerType, ...fallbackMetadata,
        },
      });
      return errorResponse("Erro do provedor: " + response.status, 502, req);
    }

    if (streamRequested) {
      log.done(200, { provider: usedFallback && fallbackTo !== null ? fallbackTo.name : providerName, streaming: true });
      return new Response(response.body, {
        headers: { ...Object.fromEntries(response.headers), 'Content-Type': 'text/event-stream' },
      });
    }

    const data = await response.json();
    const { inputTokens, outputTokens, model } = extractTokenUsage(data);

    await logAiUsageDetached({
      functionName: 'ai-proxy', userId,
      model: model || modelUsed || null,
      inputTokens, outputTokens, durationMs,
      status: usedFallback ? 'fallback' : 'success',
      metadata: {
        ...modelMetadata, model_used: modelUsed, model_resolved: routing.model,
        provider_id: provider.id, provider_type: providerType, use_for: purpose,
        ...fallbackMetadata,
      },
    });

    log.done(200, { provider: usedFallback && fallbackTo !== null ? fallbackTo.name : providerName, tokens: inputTokens + outputTokens });
    // IA-048: ecoa o identificador da requisição no corpo (só eco — sem efeito novo),
    // para o cliente descartar uma resposta que já não pertence ao contexto atual.
    const proxyBody = requestId && data && typeof data === 'object' && !Array.isArray(data)
      ? { ...(data as Record<string, unknown>), requestId }
      : data;
    return jsonResponse(proxyBody, 200, req);

  } catch (error) {
    log.error("Proxy error", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(error instanceof Error ? error.message : 'Unknown error', 500, req);
  }
});
