const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-name, x-app-version',
};
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { evoFetch, extractConnectionState } from '../_shared/evolution-send.ts';

const IS_GO = (Deno.env.get('EVOLUTION_API_FLAVOR') ?? 'go') !== 'v2';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL')!;
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'full-diagnostic';
    const instanceName = body.instanceName;

    const results: Record<string, unknown> = { timestamp: new Date().toISOString(), action };

    // 1. Check all connections in DB
    const { data: connections } = await supabase
      .from('whatsapp_connections')
      .select('id, instance_id, status, health_status, last_health_check, phone_number');

    results.connections = connections?.map(c => ({
      instance: c.instance_id,
      dbStatus: c.status,
      healthStatus: c.health_status,
      phone: c.phone_number,
      lastCheck: c.last_health_check,
    })) || [];

    // 2. For each connection (or specified), check Evolution API directly
    const instances = instanceName
      ? [{ instance_id: instanceName }]
      : (connections || []);

    const diagnostics = [];

    for (const conn of instances) {
      const diag: Record<string, unknown> = { instance: conn.instance_id };

      // 2a. Check instance status - try multiple endpoints
      try {
        let state = 'unknown';
        const statusRes = await evoFetch(evolutionUrl, evolutionKey,
          `/instance/connectionState/${conn.instance_id}`, undefined,
          (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(10000) }), 'GET');
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          state = extractConnectionState(statusData);
        }
        // Fallback: use DB status if API unreachable
        if (state === 'unknown') {
          const dbConn = (connections || []).find((c: Record<string, unknown>) => c.instance_id === conn.instance_id);
          state = dbConn?.status === 'connected' ? 'open' : (dbConn?.status || 'unknown');
        }
        diag.connectionState = state;
        diag.statusOk = state === 'open' || state === 'connected';
      } catch (e) {
        diag.connectionState = 'error';
        diag.statusError = e instanceof Error ? e.message : 'timeout';
      }

      // 2b. Check webhook configuration
      try {
        const expectedUrl = `${supabaseUrl}/functions/v1/evolution-webhook`;
        // deno-lint-ignore no-explicit-any
        let webhook: any = null;
        let currentUrl = '';
        let events: string[] = [];
        let goEnvManaged = false;
        if (IS_GO) {
          const allRes = await evoFetch(evolutionUrl, evolutionKey, '/instance/fetchInstances', undefined,
            (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(10000) }), 'GET');
          const allData = await allRes.json();
          const records = Array.isArray(allData?.data) ? allData.data : [];
          webhook = records.find((r: { name?: string }) => r?.name === conn.instance_id) ?? null;
          currentUrl = webhook?.webhook || '';
          events = typeof webhook?.events === 'string' && webhook.events ? webhook.events.split(',') : [];
          // webhook por instância vazio ⇒ GO usa WEBHOOK_URL global do env do container
          goEnvManaged = !currentUrl;
          if (goEnvManaged) currentUrl = expectedUrl; // configurado no compose (env), não via API
        } else {
          const whRes = await fetch(`${evolutionUrl}/webhook/find/${conn.instance_id}`, {
            headers: { apikey: evolutionKey },
            signal: AbortSignal.timeout(10000),
          });
          const whData = await whRes.json();
          webhook = whData?.webhook || whData;
          currentUrl = webhook?.url || webhook?.webhookUrl || '';
          events = webhook?.events || [];
        }

        const criticalEvents = IS_GO
          ? ['Message'] // GO: subscribe por evento (Message, ReadReceipt, ...) ou ALL
          : ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED', 'CONTACTS_UPSERT', 'SEND_MESSAGE'];
        const hasAll = events.includes('ALL') || events.includes('All');
        const missingEvents = hasAll ? [] : criticalEvents.filter(e => !events.includes(e) && !events.includes(e.toUpperCase()));

        diag.webhook = {
          url: currentUrl,
          urlCorrect: currentUrl === expectedUrl,
          expectedUrl,
          eventsCount: events.length,
          events,
          missingCritical: missingEvents,
          enabled: webhook?.enabled !== false,
          webhookByEvents: webhook?.webhookByEvents,
          webhookBase64: webhook?.webhookBase64,
          ...(IS_GO ? { goEnvManaged } : {}),
        };

        // Severity assessment
        if (!currentUrl || currentUrl !== expectedUrl) {
          diag.webhookSeverity = 'critical';
          diag.webhookIssue = 'URL incorreta ou ausente';
        } else if (missingEvents.length > 0) {
          diag.webhookSeverity = 'warning';
          diag.webhookIssue = `${missingEvents.length} eventos críticos ausentes`;
        } else {
          diag.webhookSeverity = 'ok';
        }
      } catch (e) {
        diag.webhook = { error: e instanceof Error ? e.message : 'timeout' };
        diag.webhookSeverity = 'error';
      }

      // 2c. Check recent message flow
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: recentMsgs } = await supabase
        .from('messages')
        .select('sender, created_at')
        .gte('created_at', oneHourAgo);

      const incoming = recentMsgs?.filter(m => m.sender === 'contact').length || 0;
      const outgoing = recentMsgs?.filter(m => m.sender === 'agent').length || 0;

      diag.messageFlow = {
        lastHour: { incoming, outgoing, total: (recentMsgs?.length || 0) },
        incomingOk: incoming > 0,
        flowHealth: incoming === 0 && outgoing > 0 ? 'outbound-only' : incoming === 0 ? 'no-traffic' : 'healthy',
      };

      // 2d. Auto-fix if requested
      if (action === 'auto-fix' && (diag.webhookSeverity === 'critical' || diag.webhookSeverity === 'warning')) {
        try {
          const fixRes = IS_GO
            ? await fetch(`${evolutionUrl}/instance/connect`, {
                method: 'POST',
                headers: {
                  apikey: Deno.env.get('EVOLUTION_INSTANCE_TOKEN') ?? evolutionKey,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  webhookUrl: `${supabaseUrl}/functions/v1/evolution-webhook`,
                  subscribe: ['ALL'],
                  immediate: true,
                }),
                signal: AbortSignal.timeout(15000),
              })
            : await fetch(`${evolutionUrl}/webhook/set/${conn.instance_id}`, {
            method: 'POST',
            headers: { apikey: evolutionKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: `${supabaseUrl}/functions/v1/evolution-webhook`,
              webhookByEvents: false,
              webhookBase64: true,
              events: [
                'MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'MESSAGES_DELETE', 'MESSAGES_SET',
                'SEND_MESSAGE', 'CONTACTS_UPSERT', 'CONTACTS_UPDATE', 'CONTACTS_SET',
                'PRESENCE_UPDATE', 'CHATS_UPSERT', 'CHATS_UPDATE', 'CHATS_DELETE', 'CHATS_SET',
                'CONNECTION_UPDATE', 'LABELS_EDIT', 'LABELS_ASSOCIATION',
                'GROUPS_UPSERT', 'GROUP_PARTICIPANTS_UPDATE', 'CALL', 'QRCODE_UPDATED',
              ],
            }),
            signal: AbortSignal.timeout(15000),
          });
          diag.autoFix = { applied: fixRes.ok, status: fixRes.status };
        } catch (e) {
          diag.autoFix = { applied: false, error: e instanceof Error ? e.message : 'failed' };
        }
      }

      diagnostics.push(diag);
    }

    results.diagnostics = diagnostics;

    // 3. Overall health score
    const scores = diagnostics.map(d => {
      let score = 100;
      if (d.connectionState !== 'open') score -= 40;
      if (d.webhookSeverity === 'critical') score -= 40;
      else if (d.webhookSeverity === 'warning') score -= 20;
      if ((d.messageFlow as Record<string, unknown>)?.flowHealth !== 'healthy') score -= 20;
      return Math.max(0, score);
    });

    results.overallHealth = {
      score: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
      status: scores.every(s => s >= 80) ? 'healthy' : scores.some(s => s < 40) ? 'critical' : 'degraded',
    };

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
