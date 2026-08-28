import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger } from "../_shared/validation.ts";
import { ExternalDbBridgeSchema, parseBody } from "../_shared/schemas.ts";

// ─── Allowlist of tables and operations ───────────────────────────────────
// Service-role bypasses RLS, so we MUST whitelist what this bridge can touch.
// Format: table -> set of allowed actions. Use "*" to allow all listed ops.
const TABLE_ALLOWLIST: Record<string, ReadonlyArray<"select" | "insert" | "update" | "delete">> = {
  evolution_contacts: ["select"],
  evolution_messages: ["select"],
  evolution_chats: ["select"],
  clientes: ["select"],
  promogifts_catalog: ["select"],
};

// Allowlist of RPCs callable through this bridge.
const RPC_ALLOWLIST: ReadonlySet<string> = new Set<string>([
  "search_external_contacts",
  "get_external_message_count",
]);

function isOperationAllowed(action: string, table?: string | null, rpc?: string | null): boolean {
  if (action === "rpc") return !!rpc && RPC_ALLOWLIST.has(rpc);
  if (!table) return false;
  const ops = TABLE_ALLOWLIST[table];
  if (!ops) return false;
  return (ops as ReadonlyArray<string>).includes(action);
}

// ─── Telemetry helper ─────────────────────────────────────────
interface TelemetryPayload {
  operation: string;
  table_name?: string | null;
  rpc_name?: string | null;
  duration_ms: number;
  record_count?: number | null;
  query_limit?: number | null;
  query_offset?: number | null;
  count_mode?: string | null;
  severity: string;
  error_message?: string | null;
  user_id?: string | null;
}

const SLOW_QUERY_THRESHOLD_MS = 3000;
const VERY_SLOW_QUERY_THRESHOLD_MS = 8000;

function classifySeverity(durationMs: number, hasError: boolean): string {
  if (hasError) return "error";
  if (durationMs >= VERY_SLOW_QUERY_THRESHOLD_MS) return "very_slow";
  if (durationMs >= SLOW_QUERY_THRESHOLD_MS) return "slow";
  return "ok";
}

// deno-lint-ignore no-explicit-any
async function emitTelemetry(supabaseAdmin: any, payload: TelemetryPayload): Promise<void> {
  try {
    await supabaseAdmin.from("query_telemetry").insert({
      operation: payload.operation,
      table_name: payload.table_name ?? null,
      rpc_name: payload.rpc_name ?? null,
      duration_ms: Math.round(payload.duration_ms),
      record_count: payload.record_count ?? null,
      query_limit: payload.query_limit ?? null,
      query_offset: payload.query_offset ?? null,
      count_mode: payload.count_mode ?? null,
      severity: payload.severity,
      error_message: payload.error_message ?? null,
      user_id: payload.user_id ?? null,
    });
  } catch (err) {
    console.error("[emitTelemetry] exception:", err instanceof Error ? err.message : String(err));
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("external-db-bridge");

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Unauthorized", 401, req);
    }

    const anonKey = requireEnv("SUPABASE_ANON_KEY");
    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData?.user) {
      return errorResponse("Unauthorized", 401, req);
    }
    const userId = userData.user.id;

    // Parse & validate body
    const parsed = parseBody(ExternalDbBridgeSchema, await req.json());
    if (!parsed.success) return errorResponse(parsed.error, 400, req);

    const { action, table, rpc, params, limit, offset, countMode } = parsed.data;

    // Enforce allowlist BEFORE running anything with service role
    if (!isOperationAllowed(action, table, rpc)) {
      return errorResponse(
        `Operation '${action}' on ${rpc ? `rpc:${rpc}` : `table:${table}`} is not permitted by allowlist`,
        403,
        req,
      );
    }

    const startTime = performance.now();
    let result: unknown = null;
    let queryError: string | null = null;
    let recordCount: number | null = null;

    try {
      if (action === "select" && table) {
        // deno-lint-ignore no-explicit-any
        let query: any = supabaseAdmin.from(table).select(params?.select as string || "*", {
          count: (countMode as "exact" | "planned" | "estimated") || undefined,
        });
        if (params?.filters) {
          for (const f of params.filters as Array<{ column: string; operator: string; value: unknown }>) {
            query = query.filter(f.column, f.operator, f.value);
          }
        }
        if (params?.order) {
          const ord = params.order as { column: string; ascending?: boolean };
          query = query.order(ord.column, { ascending: ord.ascending ?? true });
        }
        if (limit) query = query.limit(limit);
        if (offset) query = query.range(offset, offset + (limit || 50) - 1);

        const { data, error, count } = await query;
        if (error) throw error;
        result = data;
        recordCount = count ?? (Array.isArray(data) ? data.length : null);
      } else if (action === "rpc" && rpc) {
        const { data, error } = await supabaseAdmin.rpc(rpc, params || {});
        if (error) throw error;
        result = data;
        recordCount = Array.isArray(data) ? data.length : 1;
      } else if (action === "insert" && table) {
        const { data, error } = await supabaseAdmin.from(table).insert(params?.rows || params).select();
        if (error) throw error;
        result = data;
        recordCount = Array.isArray(data) ? data.length : 1;
      } else if (action === "update" && table) {
        // deno-lint-ignore no-explicit-any
        let query: any = supabaseAdmin.from(table).update(params?.values || {});
        if (params?.match) {
          for (const [k, v] of Object.entries(params.match)) {
            query = query.eq(k, v as string);
          }
        }
        const { data, error } = await query.select();
        if (error) throw error;
        result = data;
        recordCount = Array.isArray(data) ? data.length : 0;
      } else if (action === "delete" && table) {
        // deno-lint-ignore no-explicit-any
        let query: any = supabaseAdmin.from(table).delete();
        if (params?.match) {
          for (const [k, v] of Object.entries(params.match)) {
            query = query.eq(k, v as string);
          }
        }
        const { data, error } = await query.select();
        if (error) throw error;
        result = data;
        recordCount = Array.isArray(data) ? data.length : 0;
      } else {
        return errorResponse("Invalid action or missing table/rpc", 400, req);
      }
    } catch (err) {
      queryError = err instanceof Error ? err.message : String(err);
    }

    const durationMs = performance.now() - startTime;
    const severity = classifySeverity(durationMs, !!queryError);

    if (severity !== "ok") {
      emitTelemetry(supabaseAdmin, {
        operation: action,
        table_name: table || null,
        rpc_name: rpc || null,
        duration_ms: durationMs,
        record_count: recordCount,
        query_limit: limit || null,
        query_offset: offset || null,
        count_mode: countMode || null,
        severity,
        error_message: queryError,
        user_id: userId,
      }).catch((e) => log.error("telemetry fire-and-forget failed", { error: String(e) }));
    }

    if (queryError) {
      log.done(500, { severity, durationMs: Math.round(durationMs) });
      return jsonResponse({ error: queryError, telemetry: { severity, duration_ms: Math.round(durationMs) } }, 500, req);
    }

    log.done(200, { severity, durationMs: Math.round(durationMs) });
    return jsonResponse({
      data: result,
      meta: { record_count: recordCount, duration_ms: Math.round(durationMs), severity },
    }, 200, req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("Fatal error", { error: msg });
    return errorResponse(msg, 500, req);
  }
});
