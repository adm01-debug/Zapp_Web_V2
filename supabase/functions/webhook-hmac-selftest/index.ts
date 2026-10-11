/**
 * webhook-hmac-selftest — autoteste da assinatura HMAC do `evolution-webhook`.
 *
 * O QUE FAZ: dispara DOIS eventos sintéticos contra o próprio webhook — um
 * assinado com o segredo atual (EVOLUTION_WEBHOOK_SECRET, fallback WEBHOOK_SECRET)
 * e um sem assinatura — e reporta o veredito do gate de autenticidade:
 *   - `assinado_aceito`          → o webhook respondeu 200 ao evento assinado;
 *   - `sem_assinatura_recusado`  → o webhook respondeu 401 ao evento sem assinatura
 *                                  (no modo 'token' padrão; 'shadow' aceita e loga);
 *   - `modo_estrito`/`enforce_mode` → modo de enforcement vigente;
 *   - `latencia`                 → ms das duas sondagens;
 *   - `configurado`              → se existe segredo para assinar.
 *
 * O evento usa o tipo RESERVADO `selftest`, reconhecido pelo evolution-webhook
 * logo após o gate de autenticidade e ANTES de qualquer handler/escrita — ou
 * seja, o autoteste mede o gate sem produzir efeito em banco ou no provedor.
 *
 * SEGURANÇA: só admin/supervisor pelo JWT (mesma matriz das ações de controle —
 * DENY BY DEFAULT). O segredo NUNCA é devolvido, logado nem gravado; a auditoria
 * em `audit_logs` leva apenas o resultado, o modo e a latência.
 */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.87.1';
import { getCorsHeaders, handleCors, internalErrorResponse, getClientIP } from '../_shared/validation.ts';
import { decideControlAuthz } from '../_shared/evolution-control-authz.ts';
import { WebhookSecurityService } from '../_shared/hmac-validation.ts';

/** Tipo de evento RESERVADO reconhecido (e descartado) pelo evolution-webhook. */
export const HMAC_SELFTEST_EVENT = 'selftest';

export type EnforceMode = 'token' | 'shadow';

export interface HmacSelftestReport {
  assinado_aceito: boolean;
  sem_assinatura_recusado: boolean;
  modo_estrito: boolean;
  enforce_mode: EnforceMode;
  latencia: number;
  configurado: boolean;
}

/** Dependências injetáveis nos testes (mesma forma das edges com guard). */
export interface HmacSelftestDeps {
  supabase?: SupabaseClient;
  callerClient?: SupabaseClient;
  serviceKey?: string;
  anonKey?: string;
  /** Injetável: entrega o Request pronto (com ou sem assinatura) e devolve a resposta do webhook. */
  dispatch?: (req: Request) => Promise<Response>;
  webhookUrl?: string;
}

function evolutionEnforceMode(): EnforceMode {
  const mode = Deno.env.get('EVOLUTION_WEBHOOK_ENFORCE') || 'token';
  if (mode !== 'shadow' && mode !== 'token') {
    throw new Error(`EVOLUTION_WEBHOOK_ENFORCE invalido: ${mode} (use 'shadow' ou 'token')`);
  }
  return mode;
}

export async function handleWebhookHmacSelftest(
  req: Request,
  deps?: HmacSelftestDeps,
): Promise<Response> {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req);

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabase = deps?.supabase
      ?? createClient(supabaseUrl, deps?.serviceKey ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const callerClient = deps?.callerClient
      ?? createClient(supabaseUrl, deps?.anonKey ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
        global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
      });

    // Gate de acesso: ferramenta administrativa — só admin/supervisor pelo JWT.
    const { data: { user }, error: authError } = await callerClient.auth.getUser();
    if (authError || !user) {
      return json({ error: 'Não autenticado.' }, 401);
    }
    const { data: isAdmin } = await callerClient.rpc('is_admin_or_supervisor', { _user_id: user.id });
    const decision = decideControlAuthz(!!isAdmin);
    if (!decision.allowed) {
      return json({ error: decision.message }, decision.status);
    }

    const enforceMode = evolutionEnforceMode();
    const secret = Deno.env.get('EVOLUTION_WEBHOOK_SECRET') || Deno.env.get('WEBHOOK_SECRET') || '';
    const webhookUrl = deps?.webhookUrl ?? `${supabaseUrl}/functions/v1/evolution-webhook`;
    const dispatch = deps?.dispatch
      ?? ((r: Request) => fetch(r, { signal: AbortSignal.timeout(10_000) }));

    // Corpo sintético: evento reservado, sem dado de cliente nem segredo.
    const payload = JSON.stringify({
      event: HMAC_SELFTEST_EVENT,
      instance: 'webhook-hmac-selftest',
      data: { origem: 'webhook-hmac-selftest' },
    });
    const baseHeaders = { 'Content-Type': 'application/json' };

    const startedAt = Date.now();

    // Sonda 1 — assinada com o segredo atual. Sem segredo configurado não há o
    // que assinar: `assinado_aceito` fica false e `configurado` também.
    let assinadoAceito = false;
    if (secret) {
      const assinatura = await new WebhookSecurityService(secret, false).signPayload(payload);
      const res = await dispatch(new Request(webhookUrl, {
        method: 'POST',
        headers: { ...baseHeaders, 'x-hub-signature-256': assinatura },
        body: payload,
      }));
      assinadoAceito = res.status === 200;
    }

    // Sonda 2 — sem assinatura. O webhook cai no gate por instanceToken; sem
    // token, o modo 'token' (padrão) responde 401 e 'shadow' aceita (200).
    const resSemAssinatura = await dispatch(new Request(webhookUrl, {
      method: 'POST',
      headers: baseHeaders,
      body: payload,
    }));
    const semAssinaturaRecusado = resSemAssinatura.status === 401;

    const latencia = Date.now() - startedAt;
    const modoEstrito = enforceMode === 'token';
    const configurado = secret.length > 0;

    const report: HmacSelftestReport = {
      assinado_aceito: assinadoAceito,
      sem_assinatura_recusado: semAssinaturaRecusado,
      modo_estrito: modoEstrito,
      enforce_mode: enforceMode,
      latencia,
      configurado,
    };

    // Auditoria (sem segredo): resultado, modo e latência. Falha de gravação
    // não derruba a resposta — mas é registrada no log do servidor.
    const { error: auditError } = await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'webhook_hmac_selftest',
      entity_type: 'webhook',
      entity_id: null,
      details: {
        assinado_aceito: assinadoAceito,
        sem_assinatura_recusado: semAssinaturaRecusado,
        modo_estrito: modoEstrito,
        enforce_mode: enforceMode,
        latencia,
        configurado,
      },
      ip_address: getClientIP(req),
      user_agent: req.headers.get('user-agent')?.slice(0, 500) ?? null,
    });
    if (auditError) {
      console.error('[webhook-hmac-selftest] falha ao gravar auditoria:', auditError.message);
    }

    return json(report);
  } catch (err) {
    // Nunca devolve `err.message` cru ao cliente (R2-INF-016).
    return internalErrorResponse(err, req);
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleWebhookHmacSelftest(req));
}
