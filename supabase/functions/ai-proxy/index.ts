/**
 * AI Proxy Edge Function
 * Routes AI calls through admin-configured provider with automatic fallback to OpenRouter.
 *
 * Bloco 04 (IA-031/034/035/037/038): roteamento determinístico via _shared/ai-routing.ts
 * (sem `limit(1)` sem ORDER BY e sem inventar provedor), modelo decidido pelo SERVIDOR,
 * política de sistema sem sobrescrever mensagem do cliente e config do provedor lida
 * apenas pelos filtros do módulo de roteamento.
 */
import { handleCors, errorResponse, jsonResponse, Logger, requireEnv, requireAuth, checkRateLimit, getClientIP } from "../_shared/validation.ts";
import { z, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { logAiUsage, extractTokenUsage, extractUserIdFromRequest } from "../_shared/ai-usage.ts";
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
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";

const AiProxySchema = z.object({
  messages: z.array(z.object({
    role: z.string().max(50),
    content: z.string().max(50000),
  })).min(1).max(100),
  model: z.string().max(100).optional(),
  use_for: z.enum(['copilot', 'analysis', 'summary', 'tagging', 'auto_reply']).default('copilot'),
  provider_id: z.string().uuid().optional(),
  tools: z.any().optional(),
  tool_choice: z.any().optional(),
  stream: z.boolean().optional().default(false),
});

const OR_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const OR_CONFIG = { headers: { "HTTP-Referer": "https://zappweb.com.br", "X-Title": "ZappWeb" } };

function callOpenRouter(
  messages: Array<{ role: string; content: string }>,
  tools: unknown,
  toolChoice: unknown,
  stream: boolean,
): () => Promise<Response> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY") ?? "";
  if (!apiKey) throw new Error("OPENROUTER_API_KEY nao configurado para fallback.");
  return () => callOpenAICompatible({ endpoint: OR_ENDPOINT, apiKey, messages, tools, toolChoice, stream, config: OR_CONFIG });
}

/**
 * Resposta explícita de roteamento. NÃO usa errorResponse: em 5xx ele troca o corpo por
 * "Internal server error" e o cliente ficaria sem o código (NO_PROVIDER/AMBIGUOUS_PROVIDER).
 * Estes casos nunca caem no fallback legado.
 */
function routingErrorResponse(err: AiRoutingError, req: Request): Response {
  const status = err.code === 'PROVIDER_INACTIVE' ? 409 : err.code === 'BAD_PURPOSE' ? 400 : 503;
  // A mensagem do módulo já lista os ids conflitantes no AMBIGUOUS_PROVIDER.
  return jsonResponse({ error: { code: err.code, message: err.message } }, status, req);
}

/**
 * Modelo que o caminho de fallback realmente usa: `callOpenRouter` chama o helper
 * sem modelo e ele aplica este default. Fica nomeado para a auditoria não mentir
 * (antes gravávamos o modelo do provedor resolvido, que não foi quem respondeu).
 */
const FALLBACK_MODEL = 'gpt-4o';

/** Normaliza a config vinda do banco (nunca confia no formato). */
function asPlainConfig(config: unknown): Record<string, unknown> {
  return (config && typeof config === 'object' && !Array.isArray(config))
    ? config as Record<string, unknown>
    : {};
}

/**
 * Config para chamadas de chat (openai_compatible/google_gemini): corpo apenas com a
 * allowlist do módulo e cabeçalhos apenas com os nomes permitidos. Nenhum espalhamento
 * de config cru — `headers`/`extra_body` do painel nunca vão direto.
 */
function chatProviderConfig(config: unknown): Record<string, unknown> {
  const raw = asPlainConfig(config);
  return {
    ...filterConfigBody(raw),
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
 * Despacha para o provedor já resolvido. O modelo é SEMPRE o decidido pelo servidor
 * (`resolveModel`), em todos os ramos — inclusive lovable_ai (IA-035).
 */
function dispatchProvider(
  provider: AiProviderRow,
  model: string | null,
  messages: Array<{ role: string; content: string }>,
  tools: unknown,
  toolChoice: unknown,
  stream: boolean,
): () => Promise<Response> {
  switch (provider.provider_type) {
    case 'lovable_ai': {
      const apiKey = requireEnv("LOVABLE_API_KEY");
      return () => callLovableAI({ messages, apiKey, model: model ?? undefined, tools, toolChoice, stream });
    }
    case 'openai_compatible':
    case 'google_gemini': {
      if (!provider.api_endpoint) throw new Error("Endpoint da API nao configurado para este provedor.");
      const secretName = provider.api_key_secret_name;
      const apiKey = secretName ? Deno.env.get(secretName) : null;
      if (!apiKey) throw new Error("Chave de API do provedor nao encontrada nos secrets (ver api_key_secret_name do provedor).");
      const config = chatProviderConfig(provider.config);
      return () => callOpenAICompatible({
        endpoint: provider.api_endpoint!, apiKey, messages,
        model: model ?? undefined, tools, toolChoice, stream, config,
      });
    }
    case 'custom_webhook':
    case 'custom_agent': {
      if (!provider.api_endpoint) throw new Error("Endpoint nao configurado para este agente/webhook.");
      const secretName = provider.api_key_secret_name;
      const apiKey = secretName ? Deno.env.get(secretName) : undefined;
      const config = webhookProviderConfig(provider.config);
      return () => callCustomWebhook({ endpoint: provider.api_endpoint!, apiKey, messages, config });
    }
    default: {
      // Tipo desconhecido: comportamento legado (OpenRouter).
      return callOpenRouter(messages, tools, toolChoice, stream);
    }
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const authCheck = await requireAuth(req);
  if (authCheck instanceof Response) return authCheck;
  const __uid = (authCheck as { userId: string }).userId;
  const __guard = await enforceAiGuards({ functionName: "ai-proxy", userId: __uid, req });
  if (__guard) return __guard;

  const log = new Logger("ai-proxy");
  const userId = extractUserIdFromRequest(req);

  try {
    const ip = getClientIP(req);
    const { allowed } = checkRateLimit("proxy:" + ip, 30, 60_000);
    if (!allowed) return errorResponse("Limite de requisicoes excedido. Tente novamente em 1 minuto.", 429, req);

    const parsed = parseBody(AiProxySchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { messages, model: clientModel, use_for, provider_id, tools, tool_choice, stream } = parsed.data;
    // O schema já aplica o default 'copilot'; o `?? ` só fecha o tipo (parseBody infere a entrada).
    const purpose = use_for ?? 'copilot';

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
        return routingErrorResponse(routingErr, req);
      }
      throw routingErr;
    }

    const providerType = provider.provider_type;
    const providerName = provider.name;

    log.info("Routing AI call", { provider: providerName, type: providerType, use_for, model: routing.model });

    // Política do servidor vira mensagem própria; nenhuma mensagem do cliente é removida/reescrita (IA-037).
    const finalMessages = composeMessages(provider.system_prompt, messages);

    // Auditoria da substituição administrativa de modelo (IA-035).
    const modelMetadata = {
      model_requested: routing.modelRequested,
      model_used: routing.model,
      model_substituted: routing.modelSubstituted,
    };

    const startTime = Date.now();
    let response: Response;
    let usedFallback = false;

    try {
      const callFn = dispatchProvider(provider, routing.model, finalMessages, tools, tool_choice, stream ?? false);
      response = await withRetry(callFn, 2, 500);
    } catch (dispatchErr) {
      const isOpenRouter = provider.api_key_secret_name === 'OPENROUTER_API_KEY';
      if (!isOpenRouter) {
        log.warn("Provider dispatch failed, falling back to OpenRouter", {
          provider: providerName,
          error: dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr),
        });
        response = await callOpenRouter(finalMessages, tools, tool_choice, stream ?? false)();
        usedFallback = true;
      } else {
        throw dispatchErr;
      }
    }

    const durationMs = Date.now() - startTime;

    if (!response.ok && !usedFallback) {
      const errText = await response.text();
      log.warn("Provider returned error, falling back to OpenRouter", {
        status: response.status, provider: providerName, error: errText.slice(0, 200),
      });

      if (response.status === 429) return errorResponse("Limite de requisicoes excedido. Tente novamente.", 429, req);
      if (response.status === 402) return errorResponse("Creditos insuficientes. Adicione creditos.", 402, req);

      response = await callOpenRouter(finalMessages, tools, tool_choice, stream ?? false)();
      usedFallback = true;

      // Sem logAiUsage aqui: a linha de uso é gravada UMA vez, no fecho da
      // requisição (:270 no sucesso / bloco de erro abaixo), com status 'fallback'.
      // Gravar nos dois pontos contava a mesma chamada duas vezes e corrompia a
      // auditoria de uso/cota.
    }

    if (!response.ok) {
      const errText = await response.text();
      log.error("Final provider error", { status: response.status, error: errText.slice(0, 200) });
      logAiUsage({
        functionName: 'ai-proxy', userId,
        model: usedFallback ? FALLBACK_MODEL : routing.model,
        durationMs, status: 'error',
        errorMessage: "HTTP " + response.status,
        metadata: { ...modelMetadata, model_used: usedFallback ? FALLBACK_MODEL : modelMetadata.model_used, model_resolved: routing.model, provider_id: provider.id, provider_type: providerType },
      });
      return errorResponse("Erro do provedor: " + response.status, 502, req);
    }

    if (stream) {
      log.done(200, { provider: usedFallback ? 'OpenRouter (fallback)' : providerName, streaming: true });
      return new Response(response.body, {
        headers: { ...Object.fromEntries(response.headers), 'Content-Type': 'text/event-stream' },
      });
    }

    const data = await response.json();
    const { inputTokens, outputTokens, model } = extractTokenUsage(data);

    logAiUsage({
      functionName: 'ai-proxy', userId,
      model: model || (usedFallback ? FALLBACK_MODEL : routing.model) || null,
      inputTokens, outputTokens, durationMs,
      status: usedFallback ? 'fallback' : 'success',
      metadata: { ...modelMetadata, model_used: usedFallback ? FALLBACK_MODEL : modelMetadata.model_used, model_resolved: routing.model, provider_id: provider.id, provider_type: providerType, use_for: purpose, fallback: usedFallback },
    });

    log.done(200, { provider: usedFallback ? 'OpenRouter (fallback)' : providerName, tokens: inputTokens + outputTokens });
    return jsonResponse(data, 200, req);

  } catch (error) {
    log.error("Proxy error", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(error instanceof Error ? error.message : 'Unknown error', 500, req);
  }
});
