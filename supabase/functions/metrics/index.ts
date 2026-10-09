/**
 * Edge `metrics` (item 035 do plano de paridade V1/V3) — texto Prometheus v0.0.4.
 *
 * O inventário de 2026-10-07 media "Sem health/status/metrics". Aqui ficam os
 * contadores que o V3 expunha no scrape: volume de webhook, eventos de rate limit e
 * consultas telegrafadas. As fontes são tabelas do catálogo
 * (`webhook_rate_limits`, `rate_limit_logs`, `query_telemetry`) — `retry_metrics`
 * dependia da etapa 029 e não existe neste ponto, então fica de fora.
 *
 * Acesso FECHADO por padrão (`authorizeObservability`): `x-cron-secret` que casa com
 * `CRON_SECRET` (scraper) OU JWT de admin/supervisor. Contadores internos não são
 * endpoint público.
 *
 * Leitura que falha NÃO vira 200 silencioso: devolve 503 com `zapp_edge_up 0`, que é
 * o sinal que o scrape registra como `up=0` — o mesmo caminho de falha do `health`.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.87.1';
import { getCorsHeaders, handleCors, requireEnv } from '../_shared/validation.ts';
import {
  authorizeObservability,
  errorResponseWithRequestId,
  renderPrometheus,
  resolveRequestId,
  withRequestId,
  type ObservabilityAuthDeps,
  type PrometheusSample,
} from '../_shared/observability.ts';

const WINDOW_MS = 24 * 60 * 60 * 1000;
const PROMETHEUS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';

export interface MetricsDeps {
  /** Cliente service-role injetado nos testes (não toca em env nem em rede). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: any;
  auth?: ObservabilityAuthDeps;
  /** Relógio injetado no teste: fixa a janela de 24h das contagens. */
  now?: () => number;
}

function prometheusResponse(req: Request, body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': PROMETHEUS_CONTENT_TYPE },
  });
}

export async function handleMetrics(req: Request, deps: MetricsDeps = {}): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const requestId = resolveRequestId(req);

  const denial = await authorizeObservability(req, deps.auth);
  if (denial) return errorResponseWithRequestId(denial.message, denial.status, req, requestId);

  const supabase = deps.supabase ?? createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  );
  const nowMs = deps.now ? deps.now() : Date.now();
  const since = new Date(nowMs - WINDOW_MS).toISOString();

  try {
    // `head: true` + `count: 'exact'`: só o COUNT no PostgREST, sem trazer linhas.
    const [webhooks, rateLimits, telemetry] = await Promise.all([
      supabase.from('webhook_rate_limits').select('id', { count: 'exact', head: true })
        .gte('window_start', since),
      supabase.from('rate_limit_logs').select('id', { count: 'exact', head: true })
        .gte('created_at', since),
      supabase.from('query_telemetry').select('id', { count: 'exact', head: true })
        .gte('created_at', since),
    ]);
    for (const result of [webhooks, rateLimits, telemetry]) {
      if (result.error) throw result.error;
    }

    const samples: PrometheusSample[] = [
      {
        name: 'zapp_edge_up',
        help: 'Expositor de métricas das edges alcançável (1 = de pé).',
        type: 'gauge',
        value: 1,
      },
      {
        name: 'zapp_webhook_rate_limit_rows_24h',
        help: 'Linhas de webhook_rate_limits na janela de 24h.',
        type: 'gauge',
        value: webhooks.count ?? 0,
      },
      {
        name: 'zapp_rate_limit_events_24h',
        help: 'Eventos de rate_limit_logs na janela de 24h.',
        type: 'gauge',
        value: rateLimits.count ?? 0,
      },
      {
        name: 'zapp_query_telemetry_events_24h',
        help: 'Consultas registradas em query_telemetry na janela de 24h.',
        type: 'gauge',
        value: telemetry.count ?? 0,
      },
    ];

    return prometheusResponse(req, renderPrometheus(samples), 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({
      level: 'error', source: 'edge', fn: 'metrics', rid: requestId, msg: 'leitura de métricas falhou', error: msg,
    }));
    const down: PrometheusSample[] = [{
      name: 'zapp_edge_up',
      help: 'Expositor de métricas das edges alcançável (1 = de pé).',
      type: 'gauge',
      value: 0,
    }];
    return prometheusResponse(req, renderPrometheus(down), 503);
  }
}

if (import.meta.main) {
  Deno.serve(withRequestId('metrics', (req) => handleMetrics(req)));
}
