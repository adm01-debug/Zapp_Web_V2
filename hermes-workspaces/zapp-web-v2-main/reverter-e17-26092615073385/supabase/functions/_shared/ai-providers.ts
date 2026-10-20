/**
 * AI Provider call handlers — modular dispatchers for each provider type.
 */

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
  const body: Record<string, unknown> = {
    model: params.model || 'gpt-4o',
    messages: params.messages,
    ...params.config,
  };
  if (params.tools) body.tools = params.tools;
  if (params.toolChoice) body.tool_choice = params.toolChoice;
  if (params.stream) body.stream = true;

  return fetch(params.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
      ...(params.config?.headers as Record<string, string> || {}),
    },
    body: JSON.stringify(body),
  });
}

export async function callCustomWebhook(params: {
  endpoint: string;
  apiKey?: string;
  messages: Array<{ role: string; content: string }>;
  config?: Record<string, unknown>;
}): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(params.config?.headers as Record<string, string> || {}),
  };
  if (params.apiKey) {
    const authScheme = (params.config?.auth_scheme as string) || 'Bearer';
    headers.Authorization = `${authScheme} ${params.apiKey}`;
  }

  return fetch(params.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      messages: params.messages,
      ...(params.config?.extra_body as Record<string, unknown> || {}),
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
