import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { evoFetch, extractConnectionState } from '../_shared/evolution-send.ts';
import { getCorsHeaders, handleCors, errorResponse, jsonResponse, requireEnv, Logger } from "../_shared/validation.ts";
import { escapeHtml } from '../_shared/notification-events.ts';
import { EMAIL_FONT_STACK } from '../_shared/email-font-stack.ts';

function timingSafeStringEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

export async function handleConnectionHealthCheck(
  req: Request,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _injected?: { supabase?: any; serviceKey?: string },
): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("connection-health-check");
  const headers = { ...getCorsHeaders(req), "Content-Type": "application/json" };

  try {
    // O `as SupabaseClient` e preciso: `_injected?.supabase` e `any` e, sem a anotacao,
    // o receiver `any` faz o TS perder a inferencia dos callbacks do client (TS7006/TS7031
    // no corpo que nao mudou). O `??` continua preguicoso de proposito: os testes injetam
    // o client e rodam sem SUPABASE_URL.
    const supabase = (_injected?.supabase
      ?? createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))) as SupabaseClient;
    const serviceKey = _injected?.serviceKey ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // L5 da matriz IA-004: credencial de maquina do cron (x-cron-secret, segredo
    // DEDICADO no Vault, lido por RPC SECURITY DEFINER) OU JWT de usuario autenticado.
    // A ANON KEY deixa de entrar: ela e publica (vai no bundle do front) e o gateway a
    // aceitava como "um JWT valido", entao qualquer visitante anonimo passava daqui.
    // O x-cron-secret e conferido ANTES do guard de Bearer para o pg_cron chegar; o
    // getUser recusa a anon key porque ela nao tem usuario. Fail-closed: se a RPC do
    // Vault falhar, isCronAuth fica false e a chamada segue para o caminho de JWT.
    const cronSecretHeader = req.headers.get('x-cron-secret');
    let isCronAuth = false;
    if (cronSecretHeader) {
      const { data: vaultSecret, error: rpcError } = await supabase.rpc('get_connection_health_check_cron_secret');
      if (!rpcError && typeof vaultSecret === 'string') {
        isCronAuth = timingSafeStringEqual(cronSecretHeader, vaultSecret);
      }
    }
    if (!isCronAuth) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
      }
      const token = authHeader.slice(7);
      if (!timingSafeStringEqual(token, serviceKey)) {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
        }
      }
    }

    const evolutionUrl = requireEnv('EVOLUTION_API_URL');
    const evolutionKey = requireEnv('EVOLUTION_API_KEY');
    const baseUrl = evolutionUrl.replace(/\/+$/, '');

    const { data: connections, error: connError } = await supabase
      .from('whatsapp_connections').select('id, instance_id, status, phone_number')
      .neq('instance_id', 'E2E_FIXTURE'); // Pular fixture E2E — status seeded nao deve ser sobrescrito pelo health check

    if (connError || !connections) return errorResponse('Failed to fetch connections', 500, req);

    const results = [];
    const alertsToCreate: Array<{ connection_id: string; instance_id: string; phone: string | null }> = [];

    for (const conn of connections) {
      const start = performance.now();
      let healthStatus = 'unknown';
      let errorMessage: string | null = null;
      let responseTime = 0;

      try {
        const resp = await evoFetch(baseUrl, evolutionKey,
          `/instance/connectionState/${conn.instance_id}`, undefined,
          (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(10000) }), 'GET');
        responseTime = Math.round(performance.now() - start);

        if (resp.ok) {
          const data = await resp.json();
          const state = extractConnectionState(data);
          healthStatus = state === 'open' ? 'healthy' : state === 'close' ? 'disconnected' : 'degraded';

          // Only update for definitive GO states; skip transient (connecting/qr_pending).
          const dbStatus = state === 'open' ? 'connected' : state === 'close' ? 'disconnected' : null;
          if (dbStatus && dbStatus !== conn.status) {
            // Never overwrite a QR-scan or reconnect transient state with 'disconnected'.
            const isTransient = conn.status === 'qr_pending' || conn.status === 'connecting';
            if (dbStatus === 'connected' || !isTransient) {
              // .eq('status', conn.status): um webhook pode ter mudado a linha
              // enquanto liamos o estado na GO. Sem isso, um qr_pending recem
              // gravado viraria 'disconnected' e dispararia alerta falso.
              // CAS pelo status lido. '.eq' com null nao casa linha nenhuma no
              // PostgREST, entao conexao com status NULL precisa de 'is.null'.
              const { data: updated } = await supabase.from('whatsapp_connections')
                .update({ status: dbStatus, updated_at: new Date().toISOString() })
                .eq('id', conn.id)
                .or(conn.status === null || conn.status === undefined
                  ? 'status.is.null'
                  : `status.eq.${conn.status}`)
                .select('id');
              if (updated?.length && dbStatus === 'disconnected' && conn.status === 'connected') {
                alertsToCreate.push({ connection_id: conn.id, instance_id: conn.instance_id, phone: conn.phone_number });
              }
            }
          }
        } else {
          healthStatus = 'error';
          errorMessage = `HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`;
        }
      } catch (err) {
        responseTime = Math.round(performance.now() - start);
        healthStatus = 'timeout';
        errorMessage = err instanceof Error ? err.message : 'Unknown error';
      }

      await supabase.from('connection_health_logs').insert({
        connection_id: conn.id, instance_id: conn.instance_id, status: healthStatus,
        response_time_ms: responseTime, error_message: errorMessage,
      });

      await supabase.from('whatsapp_connections').update({
        last_health_check: new Date().toISOString(), health_status: healthStatus, health_response_ms: responseTime,
      }).eq('id', conn.id);

      results.push({ instance_id: conn.instance_id, status: healthStatus, response_time_ms: responseTime, error: errorMessage });
    }

    for (const alert of alertsToCreate) {
      // Schema real de warroom_alerts: alert_type/title/message/source
      // (severity/description/metadata nao existem — o insert antigo falhava
      // com PGRST204 e o alerta critico nunca era gravado).
      await supabase.from('warroom_alerts').insert({
        alert_type: 'critical',
        title: `\uD83D\uDD34 Conexao ${alert.instance_id} desconectada`,
        message: `A instancia ${alert.instance_id}${alert.phone ? ` (${alert.phone})` : ''} perdeu conexao com o WhatsApp. Reconecte para evitar perda de mensagens.`,
        source: 'connection-health-check',
      }).then(({ error }) => { if (error) log.warn("Failed to create warroom alert", { error: error.message }); });
    }

    // warroom_alerts so aparece pra quem esta com o painel aberto. Conexao caida
    // significa que nao entra nem sai mensagem, entao o alerta tem que sair do app.
    if (alertsToCreate.length > 0) {
      const resendKey = Deno.env.get('RESEND_API_KEY');
      const { data: admins } = await supabase
        .from('profiles').select('email').eq('role', 'admin').not('email', 'is', null);
      const to = (admins ?? []).map((a) => a.email as string).filter(Boolean);
      if (!resendKey || to.length === 0) {
        log.warn("Queda detectada sem canal de e-mail", { hasKey: Boolean(resendKey), recipients: to.length });
      } else {
        for (const alert of alertsToCreate) {
          const label = escapeHtml(alert.instance_id) + (alert.phone ? ` (${escapeHtml(alert.phone)})` : '');
          try {
            const resp = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: 'ZAPP Alertas <alertas@promobrindes.com.br>',
                to,
                subject: `\uD83D\uDD34 WhatsApp ${alert.instance_id} desconectado \u2014 ZAPP`,
                html: `<div style="font-family:${EMAIL_FONT_STACK};max-width:600px;margin:0 auto">
                  <h2 style="color:#dc2626">\uD83D\uDD34 A conexao do WhatsApp caiu</h2>
                  <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:16px;margin:16px 0">
                    <p style="margin:0;font-size:16px">A instancia <strong>${label}</strong> perdeu a conexao. Enquanto ela estiver fora, nenhuma mensagem entra nem sai.</p>
                  </div>
                  <p style="font-size:15px">Abra <strong>Conexoes</strong> no ZAPP e escaneie o QR Code para reconectar.</p>
                  <p style="color:#9ca3af;font-size:12px;margin-top:24px">Detectado em ${new Date().toISOString()} pelo monitor automatico (connection-health-check).</p>
                </div>`,
              }),
            });
            if (!resp.ok) log.warn("Resend recusou o alerta de queda", { status: resp.status });
          } catch (err) {
            log.error("Falha ao enviar alerta de queda por e-mail", { error: err instanceof Error ? err.message : String(err) });
          }
        }
      }
    }

    // Cleanup old health logs
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('connection_health_logs').delete().lt('checked_at', sevenDaysAgo);

    log.done(200, { checked: results.length, alerts: alertsToCreate.length });
    return jsonResponse({
      success: true, checked_at: new Date().toISOString(),
      connections: results, alerts_created: alertsToCreate.length,
    }, 200, req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    log.error("Health check error", { error: msg });
    return errorResponse(msg, 500, req);
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleConnectionHealthCheck(req));
}
