import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, enforceRateLimit, getClientIP, requireAuth } from "../_shared/validation.ts";

// T15: o front não conhece mais a linha — host/usuário/porta vêm daqui. Os
// defaults são os valores que estavam hardcoded no front; a variável de
// ambiente só é necessária se a linha mudar (SIP_PASSWORD segue sendo o único
// segredo obrigatório). `Number(...) || 8089` cobre env ausente, vazia ou
// não-numérica. Exportada para o teste travar o contrato dos 5 campos.
export function provisionamentoSip(
  getEnv: (key: string) => string | undefined = (k) => Deno.env.get(k),
): { server: string; user: string; wsPort: number } {
  return {
    server: getEnv('SIP_SERVER') ?? 'ip.b24-9441-1552764901.bitrixphone.com',
    user: getEnv('SIP_USER') ?? 'phone1',
    wsPort: Number(getEnv('SIP_WS_PORT')) || 8089,
  };
}

/** Seams de injecao do handler. `client` substitui o client do chamador para o
 *  teste exercitar o gate de rate limit sem tocar rede.
 *  Z017: `requireAuthFn` substitui `requireAuth` nos testes. */
export interface GetSipCallerClient {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => PromiseLike<{ data: { id: string } | null; error: unknown }>;
      };
    };
  };
}

export interface GetSipPasswordDeps {
  enforceRateLimit?: (key: string, maxRequests: number, windowMs: number) => PromiseLike<{ allowed: boolean }>;
  client?: GetSipCallerClient;
  requireAuthFn?: (req: Request) => Promise<{ userId: string } | Response>;
}

export async function handleGetSipPassword(req: Request, deps: GetSipPasswordDeps = {}): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("get-sip-password");
  const rateLimit = deps.enforceRateLimit ?? enforceRateLimit;

  try {
    // Pre-auth: chave por IP, contador persistente (nao zera a cada isolate).
    const ip = getClientIP(req);
    const rl = await rateLimit(`sip-pwd:${ip}`, 10, 60_000);
    if (!rl.allowed) return errorResponse("Rate limit exceeded", 429, req);

    // Z017: JWT válido + perfil ativo + política de rede (requireAuth cobre os três).
    const _auth = await (deps.requireAuthFn ?? requireAuth)(req);
    if (_auth instanceof Response) return _auth;
    const userId = _auth.userId;

    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase: GetSipCallerClient = deps.client ??
      (createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
        global: { headers: { Authorization: authHeader } },
      }) as unknown as GetSipCallerClient);

    const { data: profile, error: profileError } = await supabase
      .from('profiles').select('id').eq('user_id', userId).maybeSingle();

    if (profileError || !profile) return errorResponse('User profile not found', 403, req);

    // Pos-auth: chave por USUARIO — o segredo da linha nao vaza para uma conta
    // comprometida mesmo distribuindo requests entre IPs/isolates.
    const userRl = await rateLimit(`sip-pwd:user:${userId}`, 10, 60_000);
    if (!userRl.allowed) return errorResponse("Rate limit exceeded", 429, req);

    // Secret ausente é erro de configuração, não falha de runtime: responde 503
    // com código estável em vez de estourar 500 genérico (requireEnv lançava).
    const password = Deno.env.get('SIP_PASSWORD');
    if (!password || password === 'undefined') {
      log.error('SIP_PASSWORD is not configured');
      log.done(503);
      return jsonResponse({ error: 'SIP não configurado', code: 'SIP_NOT_CONFIGURED' }, 503, req);
    }
    const { server, user, wsPort } = provisionamentoSip();
    log.done(200);
    return jsonResponse({ server, user, wsPort, password, profileId: profile.id }, 200, req);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log.error("Unhandled error", { error: msg });
    return errorResponse(msg, 500, req);
  }
}

// Convenção do repo para funções testáveis: o handler é exportado e o servidor
// só sobe quando o módulo é o entrypoint (o runtime do Supabase é o entrypoint).
if (import.meta.main) {
  Deno.serve((req) => handleGetSipPassword(req));
}
