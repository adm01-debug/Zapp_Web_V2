/**
 * Shared AI Usage Logger for Edge Functions.
 * Logs token consumption per user to ai_usage_logs table.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";

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
      input_tokens: entry.inputTokens || 0,
      output_tokens: entry.outputTokens || 0,
      duration_ms: entry.durationMs || null,
      status: entry.status || 'success',
      error_message: entry.errorMessage || null,
      metadata: entry.metadata || null,
    });
  } catch (e) {
    // Never throw — logging failures must not break the main flow
    console.warn(`[ai-usage] Failed to log: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Convenience wrapper: call AI gateway and log usage automatically (with 30s timeout) */
export async function callAiWithTracking(params: {
  functionName: string;
  userId?: string | null;
  apiKey: string;
  body: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<{ response: Response; data: Record<string, unknown> | null; durationMs: number }> {
  const startTime = Date.now();
  const timeout = params.timeoutMs || 30_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params.body),
      signal: controller.signal,
    });

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      logAiUsage({
        functionName: params.functionName,
        userId: params.userId,
        model: params.body.model as string || null,
        durationMs,
        status: 'error',
        errorMessage: `HTTP ${response.status}`,
      });
      return { response, data: null, durationMs };
    }

    const data = await response.json();
    const { inputTokens, outputTokens, model } = extractTokenUsage(data);

    // Fire-and-forget logging
    logAiUsage({
      functionName: params.functionName,
      userId: params.userId,
      model: model || (params.body.model as string) || null,
      inputTokens,
      outputTokens,
      durationMs,
      status: 'success',
    });

    return { response, data, durationMs };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const isTimeout = err instanceof DOMException && err.name === 'AbortError';
    logAiUsage({
      functionName: params.functionName,
      userId: params.userId,
      model: params.body.model as string || null,
      durationMs,
      status: 'error',
      errorMessage: isTimeout ? `Timeout after ${timeout}ms` : (err instanceof Error ? err.message : String(err)),
    });
    // Re-throw with clearer message for timeouts
    if (isTimeout) throw new Error(`AI request timed out after ${timeout}ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
