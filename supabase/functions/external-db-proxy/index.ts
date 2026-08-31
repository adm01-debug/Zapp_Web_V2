import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { getCorsHeaders, handleCors } from '../_shared/validation.ts'

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

// PostgREST/Postgres error codes that signal "external DB not properly wired"
// rather than a real query problem. When these appear, callers should stop
// polling silently instead of showing a red network error in DevTools.
function isInfraError(err: { code?: string; message?: string }) {
  const code = err.code ?? ''
  const msg = (err.message ?? '').toLowerCase()
  return (
    code === 'PGRST116' ||       // PostgREST: relation not found in schema cache
    code === '42P01' ||          // PostgreSQL: undefined table
    code === '42501' ||          // PostgreSQL: permission denied (misconfigured key)
    msg.includes('schema cache') ||
    msg.includes('does not exist') ||
    msg.includes('permission denied')
  )
}

Deno.serve(async (req) => {
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

    const url = Deno.env.get('EXTERNAL_SUPABASE_URL')
    const key = Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY')

    // If external DB is not configured, return empty result gracefully
    // (avoids 503 errors that break the UI when the integration is optional)
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

    // Mutation: update
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
      const { data: isAdmin, error: roleError } = await canonical.rpc('is_admin_or_supervisor', {
        _user_id: userData.user.id,
      })
      if (roleError || !isAdmin) return json({ error: 'Forbidden' }, 403, corsHeaders)

      let q = ext.from(table).update(update)
      for (const [k, v] of Object.entries(matcher)) q = q.eq(k, v as string)
      const { data: result, error } = await q.select()
      if (error) return json({ error: 'External update failed', code: error.code }, 502, corsHeaders)
      return json({ data: result }, 200, corsHeaders)
    }

    if (action !== undefined) {
      return json({ error: 'Action is not allowed' }, 400, corsHeaders)
    }

    if (typeof select !== 'undefined' && typeof select !== 'string') {
      return json({ error: 'Invalid select parameter' }, 400, corsHeaders)
    }
    if (typeof countMode !== 'undefined' && !['exact', 'planned', 'estimated'].includes(String(countMode))) {
      return json({ error: 'Invalid count mode' }, 400, corsHeaders)
    }
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
        // PostgREST 'in' requires the value wrapped in parentheses:
        // .filter(col, 'in', '(a,b)'). A raw array serializes to 'a,b' and the
        // upstream DB rejects it with 400 "failed to parse filter (in.a,b)".
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
      // Infra-level errors (table/schema missing, permission denied on key) →
      // treat as "not configured" so the browser DevTools stay clean and callers
      // disable polling silently.
      if (isInfraError(queryError)) {
        return json({ data: [], count: 0, notConfigured: true }, 200, corsHeaders)
      }
      return json({ error: 'External query failed', code: queryError.code }, 502, corsHeaders)
    }

    return json({
      data: queryData || [],
      count: count ?? (Array.isArray(queryData) ? queryData.length : 0),
    }, 200, corsHeaders)

  } catch (error) {
    console.error('external-db-proxy failed', error instanceof Error ? error.message : String(error))
    return json({ error: 'Internal proxy error' }, 500, corsHeaders)
  }
})
