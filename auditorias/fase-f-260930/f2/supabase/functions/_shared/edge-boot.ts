/**
 * Bootstrap comum das edge functions com guard: CORS, logger, headers de resposta e o
 * client Supabase (preguiçoso, para os testes injetarem por `_injected`).
 *
 * Existe para não repetir o mesmo bloco em toda edge — duas cópias de ~34 linhas
 * fizeram o Sonar reprovar a PR por duplicação (`new_duplicated_lines_density`).
 *
 * O client é GENÉRICO de propósito: cada edge fixa a sua versão de `@supabase/supabase-js`
 * (2.49.1 e 2.87.1 hoje) e o tipo tem de vir de fora, do import da própria edge.
 */
import { getCorsHeaders, handleCors, requireEnv, Logger } from './validation.ts';

/** O que os testes injetam (mesma forma nas duas edges). */
export interface EdgeInjected<TClient> {
  supabase?: TClient;
  serviceKey?: string;
}

export interface EdgeBoot<TClient> {
  /** resposta pronta quando a requisição é um preflight OPTIONS (devolva e saia) */
  cors: Response | null;
  log: Logger;
  headers: Record<string, string>;
  supabase: TClient;
  serviceKey: string;
}

/**
 * `makeClient` precisa ser PREGUIÇOSO: quando o teste injeta `supabase`, o
 * `createClient(requireEnv('SUPABASE_URL'), ...)` não pode rodar (não há env no teste).
 */
export function bootEdge<TClient>(
  req: Request,
  opts: { fnName: string; injected?: EdgeInjected<TClient>; makeClient: () => TClient },
): EdgeBoot<TClient> {
  return {
    cors: handleCors(req),
    log: new Logger(opts.fnName),
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    supabase: opts.injected?.supabase ?? opts.makeClient(),
    serviceKey: opts.injected?.serviceKey ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  };
}

/** Env obrigatória do projeto, reexportada para as edges não importarem duas fontes. */
export { requireEnv };
