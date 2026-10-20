/**
 * Edge `health` (item 035 do plano de paridade V1/V3) — saúde consolidada.
 *
 * O inventário de 2026-10-07 media "Sem health/status/metrics"; a paridade do V3 tem
 * `health` como gatekeeper. Aqui a checagem é a de banco: um HEAD/`select` no
 * PostgREST (o equivalente local do `SELECT 1`) em `whatsapp_connections`, tabela do
 * catálogo. Banco fora do ar → 503 `unhealthy`; banco de pé → 200 `healthy`.
 *
 * Acesso FECHADO por padrão (`authorizeObservability`): `x-cron-secret` que casa com
 * `CRON_SECRET` (scraper/máquina) OU JWT de admin/supervisor. `health` devolve estado
 * de infraestrutura — não é endpoint público. A correlação (034) ecoa o id no
 * envelope de erro e no log.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.87.1';
import { handleCors, jsonResponse, requireEnv } from '../_shared/validation.ts';
import {
  authorizeObservability,
  errorResponseWithRequestId,
  resolveRequestId,
  withRequestId,
  type ObservabilityAuthDeps,
} from '../_shared/observability.ts';

export interface HealthDeps {
  /** Cliente service-role injetado nos testes (não toca em env nem em rede). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: any;
  auth?: ObservabilityAuthDeps;
}

export async function handleHealth(req: Request, deps: HealthDeps = {}): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const requestId = resolveRequestId(req);

  const denial = await authorizeObservability(req, deps.auth);
  if (denial) return errorResponseWithRequestId(denial.message, denial.status, req, requestId);

  const supabase = deps.supabase ?? createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  );

  const started = Date.now();
  try {
    const { error } = await supabase
      .from('whatsapp_connections')
      .select('id', { count: 'exact', head: true });
    if (error) throw error;

    return jsonResponse({
      status: 'healthy',
      checks: { database: { status: 'up', latency_ms: Date.now() - started } },
      requestId,
    }, 200, req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({
      level: 'error', source: 'edge', fn: 'health', rid: requestId, msg: 'db indisponível', error: msg,
    }));
    // 503 é o aceite do item 035: banco indisponível NÃO é 200 com corpo vazio.
    return jsonResponse({
      status: 'unhealthy',
      checks: { database: { status: 'down', latency_ms: Date.now() - started } },
      requestId,
    }, 503, req);
  }
}

if (import.meta.main) {
  Deno.serve(withRequestId('health', (req) => handleHealth(req)));
}
