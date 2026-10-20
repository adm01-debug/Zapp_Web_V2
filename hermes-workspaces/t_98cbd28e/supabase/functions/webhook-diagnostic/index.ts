import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.87.1';
import { evoFetch, extractConnectionState } from '../_shared/evolution-send.ts';
import { getCorsHeaders, handleCors } from '../_shared/validation.ts';
import { decideControlAuthz } from '../_shared/evolution-control-authz.ts';

export interface WebhookRecord {
  webhook?: string;
  events?: string | string[];
  url?: string;
  webhookUrl?: string;
  name?: string;
  enabled?: boolean;
  webhookByEvents?: boolean;
  webhookBase64?: boolean;
}

// Evolution v2 legada devolve `events` como array; algumas instalacoes devolvem
// uma unica string quando ha so 1 evento inscrito. Normaliza os dois formatos
// para array antes de contar eventos criticos ausentes (FIX desta sessao).
export function normalizeWebhookEvents(webhook: WebhookRecord | null): string[] {
  if (Array.isArray(webhook?.events)) return webhook.events;
  if (webhook?.events) return [webhook.events];
  return [];
}

const IS_GO = (Deno.env.get('EVOLUTION_API_FLAVOR') ?? 'go') !== 'v2';

/** Dependências injetáveis nos testes (mesma forma das edges com guard). */
export interface WebhookDiagnosticDeps {
  supabase?: SupabaseClient;
  callerClient?: SupabaseClient;
  serviceKey?: string;
  anonKey?: string;
}

export async function handleWebhookDiagnostic(req: Request, _injected?: WebhookDiagnosticDeps): Promise<Response> {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabase = _injected?.supabase
      ?? createClient(supabaseUrl, _injected?.serviceKey ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL')!;
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY')!;
    const callerClient = _injected?.callerClient
      ?? createClient(supabaseUrl, _injected?.anonKey ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
        global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
      });

    // R2-API-001: a leitura sensível de diagnóstico (telefones/status/config de
    // TODAS as conexões) e o auto-fix (POST de configuração do webhook na GO)
    // deixam de ser abertos a qualquer JWT válido — o reparo NÃO é exceção ao
    // gate. Exigem papel admin/supervisor (mesma matriz das ações de controle).
    const { data: { user }, error: authError } = await callerClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Não autenticado.' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data: isAdmin } = await callerClient.rpc('is_admin_or_supervisor', { _user_id: user.id });
    const decision = decideControlAuthz(!!isAdmin);
    if (!decision.allowed) {
      return new Response(JSON.stringify({ error: decision.message }), { status: decision.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

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

    // 2. For each connection (or specified), check Evolution API directly.
    // R2-API-037: a conexao e resolvida aqui, a partir do banco, e cada
    // diagnostico roda ESCOPADO a ela. Quando o instanceName do corpo nao casa
    // nenhuma linha, o fluxo e INDETERMINADO (nunca herda metrica global).
    const allConnections: Array<Record<string, unknown>> = Array.isArray(connections) ? connections : [];
    const instances: Array<{ instance_id: string; resolvedConnectionId: string | null }> = instanceName
      ? [{
          instance_id: String(instanceName),
          resolvedConnectionId: (allConnections.find((c) => c.instance_id === instanceName)?.id as string | undefined) ?? null,
        }]
      : allConnections.map((c) => ({
          instance_id: String(c.instance_id),
          resolvedConnectionId: (c.id as string | undefined) ?? null,
        }));

    const diagnostics = [];

    for (const conn of instances) {
      const diag: Record<string, unknown> = { instance: conn.instance_id };
      diag.connectionResolved = conn.resolvedConnectionId !== null;

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
          const dbConn = allConnections.find((c) => c.instance_id === conn.instance_id);
          const dbStatus = dbConn?.status;
          state = dbStatus === 'connected' ? 'open' : (typeof dbStatus === 'string' ? dbStatus : 'unknown');
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
        let webhook: WebhookRecord | null = null;
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
          events = normalizeWebhookEvents(webhook);
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

      // 2c. Check recent message flow — ESCOPADO a esta conexao (R2-API-037).
      // A consulta antiga filtrava so created_at e contava as MESMAS linhas
      // globais para toda instancia: o trafego de A virava "saude" de B. Agora
      // cada agregado e filtrado por whatsapp_connection_id e contado pelo
      // banco (count 'exact' + head), entao o numero reflete so esta conexao e
      // nao depende do teto de linhas que o PostgREST devolve.
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      if (conn.resolvedConnectionId) {
        const [incomingRes, outgoingRes] = await Promise.all([
          supabase.from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('whatsapp_connection_id', conn.resolvedConnectionId)
            .eq('sender', 'contact')
            .gte('created_at', oneHourAgo),
          supabase.from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('whatsapp_connection_id', conn.resolvedConnectionId)
            .eq('sender', 'agent')
            .gte('created_at', oneHourAgo),
        ]);

        const incoming = incomingRes.count;
        const outgoing = outgoingRes.count;
        const flowError = incomingRes.error ?? outgoingRes.error;

        if (flowError || typeof incoming !== 'number' || typeof outgoing !== 'number') {
          // Falha de consulta NAO e "sem trafego": diagnostico indeterminado,
          // sem inventar disponibilidade a partir de numero ausente.
          diag.messageFlow = {
            lastHour: { incoming: 0, outgoing: 0, total: 0 },
            incomingOk: false, flowHealth: 'unknown', scope: 'query-failed',
            error: flowError?.message ?? 'contagem indisponivel',
          };
        } else {
          diag.messageFlow = {
            lastHour: { incoming, outgoing, total: incoming + outgoing },
            incomingOk: incoming > 0,
            flowHealth: incoming === 0 && outgoing > 0 ? 'outbound-only' : incoming === 0 ? 'no-traffic' : 'healthy',
            scope: 'connection',
          };
        }
      } else {
        // instanceName sem linha correspondente no banco: nao ha chave para
        // escopar o fluxo. Diagnostico INDETERMINADO — nunca herda metrica global.
        diag.messageFlow = {
          lastHour: { incoming: 0, outgoing: 0, total: 0 },
          incomingOk: false, flowHealth: 'unknown', scope: 'unresolved-connection',
        };
      }

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
}

if (import.meta.main) {
  Deno.serve((req) => handleWebhookDiagnostic(req));
}
