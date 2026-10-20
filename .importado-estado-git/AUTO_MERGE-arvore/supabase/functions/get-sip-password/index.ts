import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, checkRateLimit, getClientIP } from "../_shared/validation.ts";

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

export async function handleGetSipPassword(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("get-sip-password");

  try {
    const ip = getClientIP(req);
    const rl = checkRateLimit(`sip-pwd:${ip}`, 10, 60_000);
    if (!rl.allowed) return errorResponse("Rate limit exceeded", 429, req);
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse('Unauthorized', 401, req);
    }

    const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return errorResponse('Invalid or expired token', 401, req);
    }

    const userId = claimsData.claims.sub;
    const { data: profile, error: profileError } = await supabase
      .from('profiles').select('id, is_active').eq('user_id', userId).maybeSingle();

    if (profileError || !profile) return errorResponse('User profile not found', 403, req);
    if (!profile.is_active) return errorResponse('User account is inactive', 403, req);

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
  Deno.serve(handleGetSipPassword);
}
