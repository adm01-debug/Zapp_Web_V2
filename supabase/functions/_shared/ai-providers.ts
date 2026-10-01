/**
 * AI Provider call handlers — modular dispatchers for each provider type.
 *
 * IA-038: o `config` do provedor (coluna jsonb do painel) nunca é espalhado cru.
 * Ele entra sempre pelos filtros de ./ai-routing.ts, que removem as chaves
 * reservadas (model/messages/headers/...). Modelo, mensagens e cabeçalhos de
 * autenticação são decididos pelo servidor e não podem ser sobrescritos.
 */

import { filterConfigBody, filterExtraBody, filterHeaders } from "./ai-routing.ts";

export async function callLovableAI(params: {
  messages: Array<{ role: string; content: string }>;
  apiKey: string;
  model?: string;
  tools?: unknown;
  toolChoice?: unknown;
  stream?: boolean;
}): Promise<Response> {
  const body: Record<string, unknown> = {
    model: params.model || 'google/gemini-3-flash-preview',
    messages: params.messages,
  };
  if (params.tools) body.tools = params.tools;
  if (params.toolChoice) body.tool_choice = params.toolChoice;
  if (params.stream) body.stream = true;

  return fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function callOpenAICompatible(params: {
  endpoint: string;
  apiKey: string;
  messages: Array<{ role: string; content: string }>;
  model?: string;
  tools?: unknown;
  toolChoice?: unknown;
  stream?: boolean;
  config?: Record<string, unknown>;
}): Promise<Response> {
  const config = params.config ?? {};

  // Só as chaves de geração liberadas pelo filtro entram no corpo, e entram
  // ANTES dos campos do código: `model` e `messages` decididos pelo servidor
  // não podem ser sobrescritos pelo config do provedor.
  const body: Record<string, unknown> = {
    ...filterConfigBody(config),
    model: params.model || 'gpt-4o',
    messages: params.messages,
  };
  if (params.tools) body.tools = params.tools;
  if (params.toolChoice) body.tool_choice = params.toolChoice;
  if (params.stream) body.stream = true;

  // Cabeçalhos do config passam pela allowlist e entram primeiro; Authorization
  // e Content-Type são do código e vencem sempre (não são sobrescrevíveis).
  const headers: Record<string, string> = {
    ...filterHeaders(config.headers),
    Authorization: `Bearer ${params.apiKey}`,
    "Content-Type": "application/json",
  };

  return fetch(params.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

export async function callCustomWebhook(params: {
  endpoint: string;
  apiKey?: string;
  messages: Array<{ role: string; content: string }>;
  config?: Record<string, unknown>;
}): Promise<Response> {
  const config = params.config ?? {};

  // Mesma regra dos demais: config.headers só passa pela allowlist, e o
  // Content-Type do código é aplicado por último.
  const headers: Record<string, string> = {
    ...filterHeaders(config.headers),
    "Content-Type": "application/json",
  };
  if (params.apiKey) {
    const authScheme = (config.auth_scheme as string) || 'Bearer';
    // Authorization sempre do código, após o filtro: imutável pelo config.
    headers.Authorization = `${authScheme} ${params.apiKey}`;
  }

  return fetch(params.endpoint, {
    method: "POST",
    headers,
    // extra_body filtrado entra primeiro e `messages` do código por último:
    // a configuração do webhook não pode reescrever as mensagens enviadas.
    body: JSON.stringify({
      ...filterExtraBody(config.extra_body),
      messages: params.messages,
    }),
  });
}

/** Retry a fetch-like function with exponential backoff on transient errors (5xx, network). */
export async function withRetry(
  fn: () => Promise<Response>,
  maxRetries = 2,
  baseDelayMs = 500,
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fn();
      // Only retry on 5xx (server errors), not 4xx (client errors)
      if (response.status >= 500 && attempt < maxRetries) {
        // Consume body to prevent resource leak before retrying
        try { await response.text(); } catch { /* ignore */ }
        await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
        continue;
      }
      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError || new Error('All retries exhausted');
}
