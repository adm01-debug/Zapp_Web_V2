/**
 * Edge `status` (item 035 do plano de paridade V1/V3) — resposta MÍNIMA.
 *
 * O inventário de 2026-10-07 media "Sem health/status/metrics". Das três, esta é a
 * única sem dado interno: serve ao smoke e a um monitor externo que só quer saber se
 * a função está de pé. De propósito NÃO consulta banco nem devolve nada sensível —
 * estado interno é o `health` (com acesso fechado); contadores são o `metrics`.
 *
 * A correlação (034) entra pelo `withRequestId`: o `X-Request-ID` da resposta é o
 * `x-request-id` do cliente ou um gerado aqui, e toda requisição deixa uma linha
 * estruturada com `rid`.
 */
import { handleCors, jsonResponse } from '../_shared/validation.ts';
import { resolveRequestId, withRequestId } from '../_shared/observability.ts';

export async function handleStatus(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const requestId = resolveRequestId(req);
  return jsonResponse({
    status: 'ok',
    service: 'zapp-web-v2-edges',
    // Sem `ZAPP_BUILD_ID` no ambiente do runtime, o rótulo fica 'unknown' — nunca
    // inventamos uma versão que não existe.
    version: Deno.env.get('ZAPP_BUILD_ID') ?? 'unknown',
    time: new Date().toISOString(),
    requestId,
  }, 200, req);
}

if (import.meta.main) {
  Deno.serve(withRequestId('status', (req) => handleStatus(req)));
}
