/**
 * Observabilidade das edges — itens 034 e 035 do plano de paridade V1/V3
 * (docs/plans/PLANO_100_ETAPAS_PARIDADE_V1_V3_2026-09-01.md).
 *
 * As duas lacunas medidas no inventário de 2026-10-07 são "Sem health/status/metrics
 * nem withRequestId". Este módulo fecha o que é comum às três edges novas:
 *
 * 034 — Correlation ID (`withRequestId`):
 *   (a) valida o `x-request-id` que o cliente (wrapper de invoke) mandou ou gera um;
 *   (b) reescreve a requisição com o id RESOLVIDO, para o `X-Request-ID` da resposta
 *       (que `getCorsHeaders` já ecoa) ser exatamente o mesmo que foi logado;
 *   (c) ecoa o id no envelope de erro (`errorResponseWithRequestId`);
 *   (d) registra UMA linha estruturada por requisição com `rid`/`status`/`durationMs`.
 *   Sem isso, um erro do chat não era rastreável front → edge → `query_telemetry`
 *   pelo mesmo id: cada camada inventava o seu.
 *
 * 035 — acesso às duas edges que expõem estado interno (`health`, `metrics`):
 *   `authorizeObservability` decide, FECHADO por padrão — `x-cron-secret` que casa com
 *   `CRON_SECRET` (segredo de máquina já usado por cleanup-rate-limit-logs,
 *   auto-close-conversations e talkx-scheduler) OU JWT de admin/supervisor pela RPC
 *   canônica `is_admin_or_supervisor`. Segredo interno vazio não autoriza nada.
 *
 * Aditivo por construção: nada aqui altera o comportamento de quem não chama estas
 * funções; `status` é a única sem acesso interno e não devolve dado sensível.
 */
import { getCorsHeaders, requireEnv } from './validation.ts';
import { timingSafeEqual } from './hmac-validation.ts';

// ─── 034 · Correlation ID ──────────────────────────────────────────────────────

/**
 * Formato aceito do id vindo do cliente. A classe de caracteres EXCLUI `\r`, `\n`,
 * espaço e aspas de propósito: ecoar um valor cru com quebra de linha transformaria o
 * cabeçalho em injeção de header. Fora deste formato, a edge gera o próprio id.
 */
const REQUEST_ID_RE = /^[A-Za-z0-9._-]{8,64}$/;

/** O id de correlação da requisição: o `x-request-id` válido do cliente ou um novo. */
export function resolveRequestId(req: Request): string {
  const raw = req.headers.get('x-request-id');
  if (raw !== null && REQUEST_ID_RE.test(raw)) return raw;
  return crypto.randomUUID();
}

export interface RequestContext {
  /** O mesmo id que vira `X-Request-ID` na resposta e `rid` no log estruturado. */
  requestId: string;
}

/**
 * Reescreve a requisição com o id resolvido. Sem isto, uma edge que lê
 * `resolveRequestId(req)` por conta própria geraria OUTRO id quando o cliente não
 * mandou nenhum, e o envelope de erro divergiria do cabeçalho logado. A reescrita
 * transfere método, URL e corpo (o `Request` de entrada é consumido no lugar).
 */
function withResolvedRequestId(req: Request, requestId: string): Request {
  try {
    const headers = new Headers(req.headers);
    headers.set('x-request-id', requestId);
    return new Request(req, { headers });
  } catch {
    // Corpo já consumido/não reescrevível: segue com a requisição original — o id do
    // envelope pode divergir neste caso raro, e é por isso que ele fica no log.
    return req;
  }
}

/**
 * Aplica o correlation id a um handler: resolve o id, roda o handler e garante que a
 * resposta ecoe `X-Request-ID` e que cada requisição deixe uma linha estruturada.
 * Uma exceção que escape do handler vira 500 com o MESMO id no envelope — erro sem
 * correlação era justamente o que a lacuna descrevia.
 */
export function withRequestId(
  fnName: string,
  handler: (req: Request, ctx: RequestContext) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const requestId = resolveRequestId(req);
    const started = Date.now();
    let res: Response;
    try {
      res = await handler(withResolvedRequestId(req, requestId), { requestId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({
        level: 'error', fn: fnName, rid: requestId, msg: 'handler falhou', error: msg,
      }));
      res = errorResponseWithRequestId('Internal server error', 500, req, requestId);
    }
    return finalizeResponse(res, fnName, requestId, started);
  };
}

/** Garante o eco do id no cabeçalho e registra a linha de conclusão da requisição. */
function finalizeResponse(
  res: Response,
  fnName: string,
  requestId: string,
  started: number,
): Response {
  let out = res;
  if (res.headers.get('x-request-id') !== requestId) {
    try {
      const headers = new Headers(res.headers);
      headers.set('X-Request-ID', requestId);
      out = new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    } catch {
      // Cabeçalho imutável (resposta vinda de `fetch`, por exemplo): preserva o corpo e
      // segue — a correlação continua no log estruturado abaixo.
      console.warn(JSON.stringify({
        level: 'warn', fn: fnName, rid: requestId, msg: 'cabeçalho X-Request-ID imutável na resposta',
      }));
      out = res;
    }
  }
  console.log(JSON.stringify({
    level: out.status >= 400 ? 'error' : 'info',
    fn: fnName,
    rid: requestId,
    status: out.status,
    durationMs: Date.now() - started,
  }));
  return out;
}

/**
 * Envelope de erro com o correlation id. Mesmo contrato de `errorResponse` (campo
 * `error`, 5xx nunca vaza a mensagem interna) acrescido de `requestId` — é o eco que
 * fecha o item 034 sem tocar em `_shared/validation.ts` (usado por toda edge).
 */
export function errorResponseWithRequestId(
  message: string,
  status: number,
  req: Request,
  requestId: string,
): Response {
  let body = message;
  if (status >= 500) {
    console.error(JSON.stringify({ level: 'error', source: 'edge', status, msg: message }));
    body = 'Internal server error';
  }
  return new Response(
    JSON.stringify({ error: body, requestId }),
    {
      status,
      headers: { ...getCorsHeaders(req), 'X-Request-ID': requestId, 'Content-Type': 'application/json' },
    },
  );
}

// ─── 035 · Acesso às edges de observabilidade ──────────────────────────────────

/** Cliente de escopo usuário usado só para validar o JWT e conferir o papel. */
export interface ObservabilityAuthClient {
  auth: {
    getUser: (token: string) => Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  };
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
}

export interface ObservabilityAuthDeps {
  /** Injetado no teste para não tocar em rede nem em env. */
  authClient?: ObservabilityAuthClient;
  /** Override do `CRON_SECRET` para o teste não mexer no env do processo. */
  cronSecret?: string;
}

/** Negação de acesso: a edge monta a resposta com o próprio correlation id. */
export interface ObservabilityDenial {
  status: 401 | 403;
  message: string;
}

/**
 * `null` = autorizado; caso contrário, a negação (401 sem identidade, 403 sem papel).
 *
 * Fail-closed: sem `CRON_SECRET` não vazio, o `x-cron-secret` não autoriza nada; JWT
 * sem usuário ou com erro na RPC de papel é negado. "Não existe" e "existe mas
 * inválido" respondem IGUAL (401), para não revelar se o token corresponde a alguém.
 */
export async function authorizeObservability(
  req: Request,
  deps: ObservabilityAuthDeps = {},
): Promise<ObservabilityDenial | null> {
  const cronSecret = deps.cronSecret !== undefined
    ? deps.cronSecret
    : (Deno.env.get('CRON_SECRET') ?? '');
  const cronHeader = req.headers.get('x-cron-secret');
  if (cronSecret !== '' && cronHeader !== null && timingSafeEqual(cronHeader, cronSecret)) {
    return null;
  }

  const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return { status: 401, message: 'Unauthorized' };
  }
  const token = authHeader.slice(7);
  const client = deps.authClient ?? await makeUserScopedClient(authHeader);
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) return { status: 401, message: 'Unauthorized' };

  const { data: privileged, error: roleError } = await client.rpc('is_admin_or_supervisor', {
    _user_id: user.id,
  });
  if (roleError || privileged !== true) return { status: 403, message: 'Forbidden' };
  return null;
}

/** Cliente de escopo usuário (anon key): a decisão de papel não usa cliente privilegiado. */
async function makeUserScopedClient(authHeader: string): Promise<ObservabilityAuthClient> {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.87.1');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
    ?? '';
  return createClient(requireEnv('SUPABASE_URL'), anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  }) as unknown as ObservabilityAuthClient;
}

// ─── 035 · Exposição Prometheus (text v0.0.4) ──────────────────────────────────

export interface PrometheusSample {
  name: string;
  help: string;
  type: 'counter' | 'gauge';
  labels?: Record<string, string>;
  value: number;
}

const METRIC_NAME_RE = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;

/** Escapa o valor de um rótulo conforme o formato: `\` → `\\`, `"` → `\"`, LF → `\n`. */
export function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/**
 * Monta o texto de exposição Prometheus v0.0.4: uma linha `# HELP` e uma `# TYPE`
 * antes do primeiro exemplar de cada métrica (exigência do formato), depois as
 * amostras. Nome fora do padrão e valor não finito falham ALTO em vez de gerar um
 * scrape inválido que o Prometheus descartaria em silêncio.
 */
export function renderPrometheus(samples: PrometheusSample[]): string {
  const lines: string[] = [];
  const declared = new Set<string>();
  for (const sample of samples) {
    if (!METRIC_NAME_RE.test(sample.name)) {
      throw new Error(`nome de métrica inválido: ${sample.name}`);
    }
    if (!Number.isFinite(sample.value)) {
      throw new Error(`valor não finito em ${sample.name}`);
    }
    if (!declared.has(sample.name)) {
      lines.push(`# HELP ${sample.name} ${sample.help.replace(/\n/g, ' ')}`);
      lines.push(`# TYPE ${sample.name} ${sample.type}`);
      declared.add(sample.name);
    }
    const labels = sample.labels && Object.keys(sample.labels).length > 0
      ? `{${Object.entries(sample.labels)
          .map(([key, value]) => `${key}="${escapeLabelValue(value)}"`)
          .join(',')}}`
      : '';
    lines.push(`${sample.name}${labels} ${sample.value}`);
  }
  return `${lines.join('\n')}\n`;
}
