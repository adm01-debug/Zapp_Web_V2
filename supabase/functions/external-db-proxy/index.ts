import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { getCorsHeaders, handleCors } from '../_shared/validation.ts'

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  const corsHeaders = getCorsHeaders(req)

  try {
    const url = Deno.env.get('EXTERNAL_SUPABASE_URL')
    const key = Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY')

    // If external DB is not configured, return empty result gracefully
    // (avoids 503 errors that break the UI when the integration is optional)
    if (!url || !key || url.includes('PLACEHOLDER') || !url.startsWith('https://')) {
      return new Response(JSON.stringify({ data: [], count: 0, notConfigured: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const ext = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    })

    const body = await req.json()
    const { action, table, select, filters, order, limit, offset, countMode, rpc, params, data, match } = body

    // RPC call
    if (action === 'rpc' && rpc) {
      const { data: rpcData, error } = await ext.rpc(rpc, params || {})
      if (error) return new Response(JSON.stringify({ error: error.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
      return new Response(JSON.stringify({ data: rpcData }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Mutation: insert
    if (action === 'insert' && table && data) {
      const { data: result, error } = await ext.from(table).insert(data).select()
      if (error) return new Response(JSON.stringify({ error: error.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
      return new Response(JSON.stringify({ data: result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Mutation: update
    if (action === 'update' && table && data && match) {
      let q = ext.from(table).update(data)
      for (const [k, v] of Object.entries(match)) q = q.eq(k, v as string)
      const { data: result, error } = await q.select()
      if (error) return new Response(JSON.stringify({ error: error.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
      return new Response(JSON.stringify({ data: result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // SELECT query (default)
    if (!table) {
      return new Response(JSON.stringify({ error: 'Missing table parameter' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let query = ext.from(table).select(select || '*', { count: countMode || undefined })

    if (filters && Array.isArray(filters)) {
      for (const f of filters) {
        // PostgREST 'in' requires the value wrapped in parentheses:
        // .filter(col, 'in', '(a,b)'). A raw array serializes to 'a,b' and the
        // upstream DB rejects it with 400 "failed to parse filter (in.a,b)".
        const value = f.operator === 'in' && Array.isArray(f.value)
          ? `(${f.value.join(',')})`
          : f.value
        query = query.filter(f.column, f.operator, value)
      }
    }

    if (order) {
      query = query.order(order.column, { ascending: order.ascending ?? true })
    }

    const effectiveLimit = limit || 50
    const effectiveOffset = offset || 0
    query = query.range(effectiveOffset, effectiveOffset + effectiveLimit - 1)

    const { data: queryData, error: queryError, count } = await query

    if (queryError) {
      return new Response(JSON.stringify({ error: queryError.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({
      data: queryData || [],
      count: count ?? (Array.isArray(queryData) ? queryData.length : 0),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
