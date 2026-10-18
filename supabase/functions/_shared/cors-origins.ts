/**
 * Política de origem do CORS das edge functions — fonte única.
 *
 * Sem imports e sem APIs de runtime (Deno/Node): é importável por `validation.ts`,
 * por `schemas.ts` (que não pode importar `validation.ts` para continuar carregável
 * em Node nos testes de contrato) e pelos próprios testes.
 */

// W61: origens exatas canonicas de producao. Atualizadas em sincronia com
// scripts/edge-deploy/allowed-origins.json. URLs de deployment/preview do projeto
// (zappwebv2-<hash|branch>-juca1.vercel.app) continuam em ORIGIN_PATTERNS; o alias
// padrao do projeto (zappwebv2-juca1.vercel.app) nao entra de proposito.
export const EXACT_ALLOWED_ORIGINS = new Set([
  'https://zapp-web-v2.vercel.app',
  'https://zappweb.app.br',
]);

/** Origem devolvida quando a do pedido não é aceita (ou não existe). */
export const FALLBACK_ORIGIN = 'https://zapp-web-v2.vercel.app';

export const ORIGIN_PATTERNS = [
  /^https:\/\/zappwebv2-[a-z0-9-]+-juca1\.vercel\.app$/,
];

// Z020: origens localhost são aceitáveis apenas fora de produção.
export const LOCALHOST_PATTERNS = [
  /^http:\/\/localhost(?::\d{1,5})?$/,
  /^http:\/\/127\.0\.0\.1(?::\d{1,5})?$/,
];

export function isAllowedOrigin(origin: string, allowLocalhost = false): boolean {
  return EXACT_ALLOWED_ORIGINS.has(origin) ||
    ORIGIN_PATTERNS.some((pattern) => pattern.test(origin)) ||
    (allowLocalhost && LOCALHOST_PATTERNS.some((pattern) => pattern.test(origin)));
}

/** Valor de `Access-Control-Allow-Origin` para o pedido: a própria origem se aceita, senão o fallback. */
export function allowedOriginFor(req?: Request): string {
  const origin = req?.headers.get('origin') || '';
  return isAllowedOrigin(origin) ? origin : FALLBACK_ORIGIN;
}
