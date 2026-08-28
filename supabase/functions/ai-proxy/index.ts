/**
 * AI Proxy Edge Function
 * Routes AI calls through admin-configured provider with automatic fallback to Lovable AI.
 */
import { handleCors, errorResponse, jsonResponse, Logger, requireEnv, requireAuth, checkRateLimit, getClientIP } from "../_shared/validation.ts";
import { z, parseBody } from "../_shared/schemas.ts";
import { logAiUsage, extractTokenUsage, extractUserIdFromRequest } from "../_shared/ai-usage.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";
import { callLovableAI, callOpenAICompatible, callCustomWebhook, withRetry } from "../_shared/ai-providers.ts";
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

interface AiProvider {
  id: string;
  name: string;
  provider_type: string;
  api_endpoint: string | null;
  api_key_secret_name: string | null;
  model: string | null;
  system_prompt: string | null;
  config: Record<string, unknown>;
  is_active: boolean;
}

async function getProvider(supabase: ReturnType<typeof createClient>, useFor: string, providerId?: string): Promise<AiProvider | null> {
  let query = supabase.from('ai_providers').select('*').eq('is_active', true);
  if (providerId) {
    query = query.eq('id', providerId);
  } else {
    query = query.contains('use_for', [useFor]).eq('is_default', true);
  }
  const { data } = await query.limit(1).maybeSingle();
  return data as AiProvider | null;
}

function injectSystemPrompt(messages: Array<{ role: string; content: string }>, systemPrompt: string) {
  const result = [...messages];
  const hasSystem = result.some(m => m.role === 'system');
  if (hasSystem) {
    result[0] = { role: 'system', content: systemPrompt + '\n\n' + result[0].content };
  } else {
    result.unshift({ role: 'system', content: systemPrompt });
  }
  return result;
}

function dispatchProvider(
  providerType: string,
  provider: AiProvider | null,
  finalMessages: Array<{ role: string; content: string }>,
  tools: unknown,
  toolChoice: unknown,
  stream: boolean,
  clientModel?: string,
): () => Promise<Response> {
  switch (providerType) {
    case 'lovable_ai': {
      const apiKey = requireEnv("LOVABLE_API_KEY");
      return () => callLovableAI({ messages: finalMessages, apiKey, model: clientModel || provider?.model || undefined, tools, toolChoice, stream });
    }
    case 'openai_compatible':
    case 'google_gemini': {
      if (!provider?.api_endpoint) throw new Error("Endpoint da API não configurado para este provedor.");
      const secretName = provider.api_key_secret_name;
      const apiKey = secretName ? Deno.env.get(secretName) : null;
      if (!apiKey) throw new Error(`Chave de API '${secretName}' não encontrada nos secrets.`);
      return () => callOpenAICompatible({
        endpoint: provider.api_endpoint!, apiKey, messages: finalMessages,
        model: provider.model || undefined, tools, toolChoice, stream, config: provider.config || {},
      });
    }
    case 'custom_webhook':
    case 'custom_agent': {
      if (!provider?.api_endpoint) throw new Error("Endpoint não configurado para este agente/webhook.");
      const secretName2 = provider.api_key_secret_name;
      const apiKey2 = secretName2 ? Deno.env.get(secretName2) : undefined;
      return () => callCustomWebhook({
        endpoint: provider.api_endpoint!, apiKey: apiKey2, messages: finalMessages, config: provider.config || {},
      });
    }
    default: {
      const apiKey = requireEnv("LOVABLE_API_KEY");
      return () => callLovableAI({ messages: finalMessages, apiKey, tools, toolChoice, stream });
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
    const { allowed } = checkRateLimit(`proxy:${ip}`, 30, 60_000);
    if (!allowed) return errorResponse("Limite de requisições excedido. Tente novamente em 1 minuto.", 429, req);

    const parsed = parseBody(AiProxySchema, await req.json());
    if (!parsed.success) return errorResponse(parsed.error, 400, req);

    const { messages, model: clientModel, use_for, provider_id, tools, tool_choice, stream } = parsed.data;

    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const provider = await getProvider(supabase as any, use_for as string, provider_id);
    const providerType = provider?.provider_type || 'lovable_ai';
    const providerName = provider?.name || 'Lovable AI';

    log.info("Routing AI call", { provider: providerName, type: providerType, use_for });

    const finalMessages = provider?.system_prompt
      ? injectSystemPrompt(messages, provider.system_prompt)
      : [...messages];

    const startTime = Date.now();
    let response: Response;
    let usedFallback = false;

    try {
      const callFn = dispatchProvider(providerType, provider, finalMessages, tools, tool_choice, stream ?? false, clientModel);
      response = await withRetry(callFn, 2, 500);
    } catch (dispatchErr) {
      // If the configured provider fails entirely, fallback to Lovable AI
      if (providerType !== 'lovable_ai') {
        log.warn("Provider dispatch failed, falling back to Lovable AI", {
          provider: providerName,
          error: dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr),
        });
        const fallbackKey = requireEnv("LOVABLE_API_KEY");
        response = await callLovableAI({ messages: finalMessages, apiKey: fallbackKey, tools, toolChoice: tool_choice, stream });
        usedFallback = true;
      } else {
        throw dispatchErr;
      }
    }

    const durationMs = Date.now() - startTime;

    // Fallback on non-OK response from external provider
    if (!response.ok && providerType !== 'lovable_ai' && !usedFallback) {
      const errText = await response.text();
      log.warn("Provider returned error, falling back to Lovable AI", {
        status: response.status, provider: providerName, error: errText.slice(0, 200),
      });

      if (response.status === 429) return errorResponse("Limite de requisições excedido. Tente novamente.", 429, req);
      if (response.status === 402) return errorResponse("Créditos insuficientes. Adicione créditos.", 402, req);

      const fallbackKey = requireEnv("LOVABLE_API_KEY");
      response = await callLovableAI({ messages: finalMessages, apiKey: fallbackKey, tools, toolChoice: tool_choice, stream });
      usedFallback = true;

      logAiUsage({
        functionName: 'ai-proxy', userId, model: provider?.model || null,
        durationMs, status: 'fallback',
        errorMessage: `${providerName}: HTTP error → fallback Lovable AI`,
        metadata: { provider_id: provider?.id, provider_type: providerType, fallback: true },
      });
    }

    if (!response.ok) {
      const errText = await response.text();
      log.error("Final provider error", { status: response.status, error: errText.slice(0, 200) });
      logAiUsage({
        functionName: 'ai-proxy', userId, model: provider?.model || null,
        durationMs, status: 'error',
        errorMessage: `HTTP ${response.status}`,
        metadata: { provider_id: provider?.id, provider_type: providerType },
      });
      return errorResponse(`Erro do provedor: ${response.status}`, 502, req);
    }

    if (stream) {
      log.done(200, { provider: usedFallback ? 'Lovable AI (fallback)' : providerName, streaming: true });
      return new Response(response.body, {
        headers: { ...Object.fromEntries(response.headers), 'Content-Type': 'text/event-stream' },
      });
    }

    const data = await response.json();
    const { inputTokens, outputTokens, model } = extractTokenUsage(data);

    logAiUsage({
      functionName: 'ai-proxy', userId,
      model: model || provider?.model || null,
      inputTokens, outputTokens, durationMs,
      status: usedFallback ? 'fallback' : 'success',
      metadata: { provider_id: provider?.id, provider_type: providerType, use_for, fallback: usedFallback },
    });

    log.done(200, { provider: usedFallback ? 'Lovable AI (fallback)' : providerName, tokens: inputTokens + outputTokens });
    return jsonResponse(data, 200, req);

  } catch (error) {
    log.error("Proxy error", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(error instanceof Error ? error.message : 'Unknown error', 500, req);
  }
});
