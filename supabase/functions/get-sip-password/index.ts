import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, checkRateLimit, getClientIP } from "../_shared/validation.ts";

Deno.serve(async (req) => {
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
    if (!password) {
      log.error('SIP_PASSWORD is not configured');
      log.done(503);
      return jsonResponse({ error: 'SIP não configurado', code: 'SIP_NOT_CONFIGURED' }, 503, req);
    }
    log.done(200);
    return jsonResponse({ password, profileId: profile.id }, 200, req);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log.error("Unhandled error", { error: msg });
    return errorResponse(msg, 500, req);
  }
});
