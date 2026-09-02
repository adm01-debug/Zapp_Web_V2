import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { evoFetch, extractConnectionState } from '../_shared/evolution-send.ts';
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("connection-health-check");

  try {
    const evolutionUrl = requireEnv('EVOLUTION_API_URL');
    const evolutionKey = requireEnv('EVOLUTION_API_KEY');
    const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));
    const baseUrl = evolutionUrl.replace(/\/+$/, '');

    const { data: connections, error: connError } = await supabase
      .from('whatsapp_connections').select('id, instance_id, status, phone_number');

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
              await supabase.from('whatsapp_connections').update({ status: dbStatus, updated_at: new Date().toISOString() }).eq('id', conn.id);
              if (dbStatus === 'disconnected' && conn.status === 'connected') {
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
      // (severity/description/metadata não existem — o insert antigo falhava
      // com PGRST204 e o alerta crítico nunca era gravado).
      await supabase.from('warroom_alerts').insert({
        alert_type: 'critical',
        title: `🔴 Conexão ${alert.instance_id} desconectada`,
        message: `A instância ${alert.instance_id}${alert.phone ? ` (${alert.phone})` : ''} perdeu conexão com o WhatsApp. Reconecte para evitar perda de mensagens.`,
        source: 'connection-health-check',
      }).then(({ error }) => { if (error) log.warn("Failed to create warroom alert", { error: error.message }); });
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
});
