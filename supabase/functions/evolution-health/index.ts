// Evolution API Health Check Edge Function
// Monitors WhatsApp connection status, webhook configuration, and API health

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCors, Logger } from '../_shared/validation.ts';
import { evoFetch, extractConnectionState } from '../_shared/evolution-send.ts';

const IS_GO = (Deno.env.get('EVOLUTION_API_FLAVOR') ?? 'go') !== 'v2';

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  instance: {
    name: string
    connected: boolean
    state: string
    phoneNumber?: string
    lastSeen?: string
  }
  webhook: {
    configured: boolean
    url?: string
    events?: string[]
  }
  api: {
    reachable: boolean
    latencyMs: number
    version?: string
  }
  database: {
    connected: boolean
    lastMessageAt?: string
    pendingMessages?: number
  }
  alerts: string[]
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const headers = { ...getCorsHeaders(req), 'Content-Type': 'application/json' };
  const log = new Logger('evolution-health');

  try {
    const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL')!
    const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY')!
    const INSTANCE_NAME = Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'wpp2'
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const alerts: string[] = []

    // 1. Check Evolution API reachability
    // v2: /manager/version. GO: não existe → /instance/all (admin), que também
    // devolve o registro da instância (webhook/events) usado no check 3.
    let apiReachable = false
    let apiLatency = 0
    let apiVersion = ''
    // deno-lint-ignore no-explicit-any
    let goInstanceRecord: any = null
    try {
      const apiStart = Date.now()
      if (IS_GO) {
        const apiResponse = await evoFetch(EVOLUTION_API_URL, EVOLUTION_API_KEY, '/instance/fetchInstances', undefined, undefined, 'GET')
        apiLatency = Date.now() - apiStart
        if (apiResponse.ok) {
          apiReachable = true
          apiVersion = 'evolution-go'
          const data = await apiResponse.json()
          const records = Array.isArray(data?.data) ? data.data : []
          goInstanceRecord = records.find((r: { name?: string }) => r?.name === INSTANCE_NAME) ?? records[0] ?? null
        }
      } else {
        const apiResponse = await fetch(`${EVOLUTION_API_URL}/manager/version`, {
          headers: { 'apikey': EVOLUTION_API_KEY }
        })
        apiLatency = Date.now() - apiStart
        if (apiResponse.ok) {
          apiReachable = true
          const data = await apiResponse.json()
          apiVersion = data.version || 'unknown'
        }
      }
    } catch {
      alerts.push('Evolution API is unreachable')
    }

    // 2. Check instance connection status
    let instanceConnected = false
    let instanceState = 'unknown'
    let phoneNumber = ''
    try {
      const instanceResponse = await evoFetch(
        EVOLUTION_API_URL, EVOLUTION_API_KEY,
        `/instance/connectionState/${INSTANCE_NAME}`, undefined, undefined, 'GET'
      )
      if (instanceResponse.ok) {
        const data = await instanceResponse.json()
        instanceState = extractConnectionState(data)
        instanceConnected = instanceState === 'open'
        phoneNumber = data.instance?.phoneNumber || goInstanceRecord?.jid || ''
        
        if (!instanceConnected) {
          alerts.push(`WhatsApp disconnected: state=${instanceState}`)
        }
      }
    } catch {
      alerts.push('Failed to check instance status')
    }

    // 3. Check webhook configuration
    let webhookConfigured = false
    let webhookUrl = ''
    let webhookEvents: string[] = []
    try {
      if (IS_GO) {
        // GO não expõe /webhook/find. Webhook por instância vem em /instance/all;
        // vazio significa WEBHOOK_URL global via env do container (não introspectável).
        webhookUrl = goInstanceRecord?.webhook || 'env:WEBHOOK_URL (global)'
        webhookEvents = typeof goInstanceRecord?.events === 'string' && goInstanceRecord.events
          ? goInstanceRecord.events.split(',')
          : []
        webhookConfigured = true
        if (goInstanceRecord && !webhookEvents.includes('All') && !webhookEvents.includes('ALL') && !webhookEvents.includes('Message') && !webhookEvents.includes('MESSAGE')) {
          alerts.push(`Instance not subscribed to Message events (events=${goInstanceRecord.events ?? ''})`)
        }
      } else {
        const webhookResponse = await fetch(
          `${EVOLUTION_API_URL}/webhook/find/${INSTANCE_NAME}`,
          { headers: { 'apikey': EVOLUTION_API_KEY } }
        )
        if (webhookResponse.ok) {
          const data = await webhookResponse.json()
          webhookUrl = data.webhook?.url || ''
          webhookEvents = data.webhook?.events || []
          webhookConfigured = !!webhookUrl

          if (!webhookConfigured) {
            alerts.push('Webhook not configured')
          }

          const criticalEvents = ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED']
          const missingEvents = criticalEvents.filter(e => !webhookEvents.includes(e))
          if (missingEvents.length > 0) {
            alerts.push(`Missing webhook events: ${missingEvents.join(', ')}`)
          }
        }
      }
    } catch {
      alerts.push('Failed to check webhook configuration')
    }

    // 4. Check database connection and recent messages
    let dbConnected = false
    let lastMessageAt = ''
    let pendingMessages = 0
    try {
      const { data: lastMsg, error: lastMsgError } = await supabase
        .from('messages_whatsapp')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!lastMsgError && lastMsg) {
        dbConnected = true
        lastMessageAt = lastMsg.created_at
        
        const lastMsgTime = new Date(lastMsg.created_at).getTime()
        const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000
        if (instanceConnected && lastMsgTime < thirtyMinutesAgo) {
          alerts.push('No messages received in last 30 minutes')
        }
      }

      const { data: pending, error: pendingError } = await supabase
        .from('message_queue')
        .select('id', { count: 'exact' })
        .eq('status', 'pending')

      if (!pendingError && pending) {
        pendingMessages = pending.length
        if (pendingMessages > 100) {
          alerts.push(`High message queue: ${pendingMessages} pending`)
        }
      }
    } catch {
      dbConnected = true
    }

    // Determine overall status
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
    if (!apiReachable || !instanceConnected) {
      overallStatus = 'unhealthy'
    } else if (alerts.length > 0) {
      overallStatus = 'degraded'
    }

    const result: HealthCheckResult = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      instance: {
        name: INSTANCE_NAME,
        connected: instanceConnected,
        state: instanceState,
        phoneNumber: phoneNumber || undefined,
      },
      webhook: {
        configured: webhookConfigured,
        url: webhookUrl || undefined,
        events: webhookEvents.length > 0 ? webhookEvents : undefined,
      },
      api: {
        reachable: apiReachable,
        latencyMs: apiLatency,
        version: apiVersion || undefined,
      },
      database: {
        connected: dbConnected,
        lastMessageAt: lastMessageAt || undefined,
        pendingMessages: pendingMessages > 0 ? pendingMessages : undefined,
      },
      alerts,
    }

    try {
      await supabase.from('system_logs').insert({
        level: overallStatus === 'unhealthy' ? 'error' : overallStatus === 'degraded' ? 'warn' : 'info',
        category: 'health_check',
        message: `Evolution API health: ${overallStatus}`,
        metadata: result,
      })
    } catch {
      // system_logs table might not exist
    }

    log.done(overallStatus === 'unhealthy' ? 503 : 200);

    return new Response(JSON.stringify(result), {
      headers,
      status: overallStatus === 'unhealthy' ? 503 : 200,
    })

  } catch (error) {
    log.error('Health check error', { error: error instanceof Error ? error.message : String(error) });
    return new Response(
      JSON.stringify({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        alerts: ['Health check failed unexpectedly'],
      }),
      { headers, status: 503 }
    )
  }
})
