import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.87.1";
import { handleCors, errorResponse, internalErrorResponse, jsonResponse, requireEnv, Logger } from "../_shared/validation.ts";
import { ExternalDbBridgeSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";

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

// Parâmetros de query que o PostgREST interpreta como CONTROLE, não como coluna:
// um "filtro" com esse nome viraria `?select=eq.x`/`?or=eq.(...)`/`?limit=eq.1`
// ao lado dos parâmetros reais montados pelo supabase-js.
const POSTGREST_RESERVED: ReadonlySet<string> = new Set([
  'select', 'or', 'and', 'not', 'order', 'limit', 'offset', 'on_conflict', 'columns',
]);

export function validIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z_][a-z0-9_]{0,62}$/i.test(value)
    && !POSTGREST_RESERVED.has(value.toLowerCase());
}
const FILTER_OPERATORS: ReadonlySet<string> = new Set([
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in',
]);
const MAX_FILTERS = 20;
const MAX_IN_ITEMS = 1000;

type Scalar = string | number | boolean;
type ValidFilter = { column: string; operator: string; value: Scalar | null };

function isScalar(value: unknown): value is Scalar {
  return typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value));
}

/** Item de lista do `in`: string sempre entre aspas (vírgula/parêntese/aspas escapados). */
function inListItem(value: Scalar): string {
  if (typeof value !== 'string') return String(value);
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Valida `params.filters`: array de objetos `{ column, operator, value }`, coluna
 * identificador simples (sem nome reservado do PostgREST), operador da allowlist,
 * valor escalar — e, no `in`, array de escalares que vira `("a","b")`. Qualquer
 * outra forma é erro do PEDIDO (400), não do servidor (antes: TypeError → 500).
 */
export function parseFilters(raw: unknown): ValidFilter[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_FILTERS) return null;
  const filters: ValidFilter[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const { column, operator, value } = item as Record<string, unknown>;
    if (!validIdentifier(column) || typeof operator !== 'string' || !FILTER_OPERATORS.has(operator)) return null;
    if (operator === 'in') {
      if (!Array.isArray(value) || value.length < 1 || value.length > MAX_IN_ITEMS || !value.every(isScalar)) return null;
      filters.push({ column, operator, value: `(${value.map(inListItem).join(',')})` });
      continue;
    }
    if (operator === 'is') {
      if (value !== null && value !== true && value !== false) return null;
      filters.push({ column, operator, value: value === null ? 'null' : String(value) });
      continue;
    }
    if (!isScalar(value)) return null;
    filters.push({ column, operator, value });
  }
  return filters;
}

function isOperationAllowed(action: string, table?: string | null, rpc?: string | null): boolean {
  if (action === "rpc") return !!rpc && RPC_ALLOWLIST.has(rpc);
  if (!table) return false;
  const ops = TABLE_ALLOWLIST[table];
  if (!ops) return false;
  return (ops as ReadonlyArray<string>).includes(action);
}

// ─── Telemetry helper ──────────────────────────────────
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

/**
 * Clientes injetáveis pelos testes (mesmo contrato de `EdgeInjected`/`bootEdge`
 * das funções irmãs): `userClient` carrega o JWT do chamador — é ele que faz o
 * `auth.getUser()` e resolve o papel — e `adminClient` é o service_role que roda
 * as queries da allowlist.
 */
export interface ExternalDbBridgeInjected {
  userClient?: SupabaseClient;
  adminClient?: SupabaseClient;
}

export async function handleExternalDbBridge(
  req: Request,
  _injected?: ExternalDbBridgeInjected,
): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("external-db-bridge");

  try {
    const supabaseAdmin = _injected?.adminClient ??
      createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Unauthorized", 401, req);
    }

    const supabaseUser = _injected?.userClient ?? createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData?.user) {
      return errorResponse("Unauthorized", 401, req);
    }
    const userId = userData.user.id;

    // SEC-EDGE_FUNCTIONS-01 (Y27 P0-01): as queries abaixo usam o cliente
    // service_role, que BYPASSA a RLS. Sem checar papel, qualquer sessão
    // autenticada (inclusive `agent`) leria a base inteira por esta função.
    // Antes de tocar em qualquer tabela/RPC da allowlist, resolvemos o papel no
    // RPC canônico (`is_admin_or_supervisor`, o mesmo de `external-db-proxy`).
    // Não há consumidor não-admin em `src/` nem em `supabase/functions/`
    // (git grep), então o caminho permitido é SÓ admin/supervisor: erro no RPC
    // ou valor diferente de `true` NEGA (falha fechada).
    const { data: isAdmin, error: roleError } = await supabaseUser.rpc(
      "is_admin_or_supervisor",
      { _user_id: userId },
    );
    if (roleError) {
      log.error("falha ao resolver papel do chamador", { error: roleError.message });
      return errorResponse("Forbidden", 403, req);
    }
    if (isAdmin !== true) {
      return errorResponse("Forbidden", 403, req);
    }

    // Parse & validate body
    const parsed = parseBody(ExternalDbBridgeSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

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
        // Z018: rejeitar `select` com `(` previne injeção de função PostgREST.
        const selectParam = params?.select as string | undefined;
        if (selectParam && selectParam.includes('(')) {
          return errorResponse("Invalid select parameter", 400, req);
        }
        // Valida filtros ANTES de montar a query privilegiada.
        const filters = parseFilters(params?.filters);
        if (!filters) {
          return errorResponse("Invalid filter column or operator", 400, req);
        }
        // deno-lint-ignore no-explicit-any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let query: any = supabaseAdmin.from(table).select(selectParam || "*", {
          count: (countMode as "exact" | "planned" | "estimated") || undefined,
        });
        for (const f of filters) {
          query = query.filter(f.column, f.operator, f.value);
        }
        if (params?.order !== undefined) {
          const ord = params.order as { column?: unknown; ascending?: unknown } | null;
          if (!ord || typeof ord !== 'object' || Array.isArray(ord) || !validIdentifier(ord.column)
              || (ord.ascending !== undefined && typeof ord.ascending !== 'boolean')) {
            return errorResponse("Invalid order column", 400, req);
          }
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
      // Z015: internalErrorResponse envia "Internal server error" ao cliente —
      // o erro bruto do banco (nome de tabela/coluna/SQL interno) fica só na
      // telemetria (error_message acima) e no log server-side.
      return internalErrorResponse(new Error(queryError), req);
    }

    log.done(200, { severity, durationMs: Math.round(durationMs) });
    return jsonResponse({
      data: result,
      meta: { record_count: recordCount, duration_ms: Math.round(durationMs), severity },
    }, 200, req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("Fatal error", { error: msg });
    return errorResponse("Internal server error", 500, req);
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleExternalDbBridge(req));
}
