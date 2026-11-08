import { createClient } from 'npm:@supabase/supabase-js@2.87.1'
import { getCorsHeaders, handleCors, internalErrorResponse } from '../_shared/validation.ts'

const READ_TABLES = new Set(['evolution_contacts', 'evolution_messages', 'media_quarantine'])
const FILTER_OPERATORS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in'])
const QUARANTINE_DECISIONS = new Set(['allowed', 'deleted', 'whitelisted'])

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

function validIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z_][a-z0-9_]*$/i.test(value)
}

function isInfraError(err: { code?: string; message?: string }) {
  const code = err.code ?? ''
  const msg = (err.message ?? '').toLowerCase()
  return (
    code === 'PGRST116' ||
    code === '42P01' ||
    code === '42501' ||
    msg.includes('schema cache') ||
    msg.includes('does not exist') ||
    msg.includes('permission denied')
  )
}

export async function handleExternalDbProxy(req: Request): Promise<Response> {
  const cors = handleCors(req)
  if (cors) return cors

  const corsHeaders = getCorsHeaders(req)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401, corsHeaders)
    }

    const canonicalUrl = Deno.env.get('SUPABASE_URL')
    const canonicalAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    if (!canonicalUrl || !canonicalAnonKey) {
      return json({ error: 'Canonical auth is not configured' }, 503, corsHeaders)
    }
    const canonical = createClient(canonicalUrl, canonicalAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userError } = await canonical.auth.getUser()
    if (userError || !userData.user) {
      return json({ error: 'Unauthorized' }, 401, corsHeaders)
    }

    const url = Deno.env.get('EVOLUTION_VPS_SUPABASE_URL')
    const key = Deno.env.get('EVOLUTION_VPS_SUPABASE_ANON_KEY')

    if (!url || !key || url.includes('PLACEHOLDER') || !url.startsWith('https://')) {
      return json({ data: [], count: 0, notConfigured: true }, 200, corsHeaders)
    }

    const ext = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    })

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Invalid JSON body' }, 400, corsHeaders)
    }
    const { action, table, select, filters, order, limit, offset, countMode, data, match } = body

    if (!validIdentifier(table) || !READ_TABLES.has(table)) {
      return json({ error: 'Table is not allowed' }, 400, corsHeaders)
    }

    const { data: isAdminOrSupervisor, error: roleError } = await canonical.rpc('is_admin_or_supervisor', {
      _user_id: userData.user.id,
    })
    const canManageExternalDb = !roleError && isAdminOrSupervisor === true

    if (action === 'update') {
      if (table !== 'media_quarantine' || !data || typeof data !== 'object' || Array.isArray(data) ||
          !match || typeof match !== 'object' || Array.isArray(match)) {
        return json({ error: 'Invalid quarantine update' }, 400, corsHeaders)
      }
      const update = data as Record<string, unknown>
      const matcher = match as Record<string, unknown>
      const updateKeys = Object.keys(update)
      if (updateKeys.some((key) => !['decision', 'reviewed_at'].includes(key)) ||
          !QUARANTINE_DECISIONS.has(String(update.decision)) ||
          Object.keys(matcher).length !== 1 || typeof matcher.id !== 'string') {
        return json({ error: 'Invalid quarantine update' }, 400, corsHeaders)
      }
      if (!canManageExternalDb) return json({ error: 'Forbidden' }, 403, corsHeaders)

      let q = ext.from(table).update(update)
      for (const [k, v] of Object.entries(matcher)) q = q.eq(k, v as string)
      const { data: result, error } = await q.select()
      if (error) return json({ error: 'External update failed' }, 502, corsHeaders)
      return json({ data: result }, 200, corsHeaders)
    }

    if (action !== undefined) {
      return json({ error: 'Action is not allowed' }, 400, corsHeaders)
    }

    if (typeof select !== 'undefined' && typeof select !== 'string') {
      return json({ error: 'Invalid select parameter' }, 400, corsHeaders)
    }
    if (typeof select === 'string' && select.includes('(')) {
      return json({ error: 'Invalid select parameter' }, 400, corsHeaders)
    }
    if (typeof countMode !== 'undefined' && !['exact', 'planned', 'estimated'].includes(String(countMode))) {
      return json({ error: 'Invalid count mode' }, 400, corsHeaders)
    }

    if (!canManageExternalDb) return json({ error: 'Forbidden' }, 403, corsHeaders)

    let query = ext.from(table).select((select as string) || '*', {
      count: countMode as 'exact' | 'planned' | 'estimated' | undefined,
    })

    if (filters !== undefined) {
      if (!Array.isArray(filters)) return json({ error: 'Invalid filters' }, 400, corsHeaders)
      for (const rawFilter of filters) {
        const f = rawFilter as Record<string, unknown>
        if (!validIdentifier(f.column) || typeof f.operator !== 'string' || !FILTER_OPERATORS.has(f.operator)) {
          return json({ error: 'Invalid filter' }, 400, corsHeaders)
        }
        const value = f.operator === 'in' && Array.isArray(f.value)
          ? `(${f.value.join(',')})`
          : f.value
        query = query.filter(f.column, f.operator, value)
      }
    }

    if (order !== undefined) {
      if (!order || typeof order !== 'object' || Array.isArray(order) ||
          !validIdentifier((order as Record<string, unknown>).column)) {
        return json({ error: 'Invalid order parameter' }, 400, corsHeaders)
      }
      const typedOrder = order as { column: string; ascending?: boolean }
      query = query.order(typedOrder.column, { ascending: typedOrder.ascending ?? true })
    }

    const effectiveLimit = typeof limit === 'number' && Number.isInteger(limit)
      ? Math.min(Math.max(limit, 1), 500)
      : 50
    const effectiveOffset = typeof offset === 'number' && Number.isInteger(offset)
      ? Math.max(offset, 0)
      : 0
    query = query.range(effectiveOffset, effectiveOffset + effectiveLimit - 1)

    const { data: queryData, error: queryError, count } = await query

    if (queryError) {
      if (isInfraError(queryError)) {
        return json({ data: [], count: 0, notConfigured: true }, 200, corsHeaders)
      }
      return json({ error: 'External query failed' }, 502, corsHeaders)
    }

    return json({
      data: queryData || [],
      count: count ?? (Array.isArray(queryData) ? queryData.length : 0),
    }, 200, corsHeaders)

  } catch (error) {
    return internalErrorResponse(error, req)
  }
}

if (import.meta.main) Deno.serve(handleExternalDbProxy)
