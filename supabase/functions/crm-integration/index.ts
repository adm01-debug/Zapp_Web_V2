import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.87.1';
import {
  enforceRateLimit, errorResponse, getClientIP, handleCors, isValidUUID, jsonResponse, requireAuth, requireEnv,
} from '../_shared/validation.ts';
import {
  CRM_TABLE_ALLOWLIST, FILTER_OPERATORS, isExpectedExternalServerKey, isExpectedExternalUrl,
  normalizePhone, parseSyncResult, validateMutation, validateRpc, validIdentifier,
} from '../_shared/crm-integration-contract.ts';

const TIMEOUT_MS = 12_000;
const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_BATCH_SIZE = 10;

function timingSafeEqual(left: string | null, right: string | null): boolean {
  if (left === null || right === null) return false;
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index++) difference |= (a[index] || 0) ^ (b[index] || 0);
  return difference === 0;
}

async function readBoundedJson(req: Request): Promise<Record<string, unknown>> {
  const declared = Number(req.headers.get('content-length') || '0');
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) throw new Error('REQUEST_TOO_LARGE');
  if (!req.body) throw new Error('INVALID_JSON');
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new Error('REQUEST_TOO_LARGE');
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  const parsed = JSON.parse(new TextDecoder().decode(merged));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('INVALID_JSON');
  return parsed as Record<string, unknown>;
}

async function withTimeout<T>(operation: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error('CRM_TIMEOUT')), TIMEOUT_MS); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

interface OutboxRow {
  id: string;
  contact_id: string | null;
  normalized_phone: string | null;
  idempotency_key: string;
  lease_token: string;
  payload: Record<string, unknown>;
}

export async function handleCRMIntegrationRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405, req);

  let serviceKey: string;
  let supabaseUrl: string;
  try {
    serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    supabaseUrl = requireEnv('SUPABASE_URL');
  } catch {
    return errorResponse('CRM integration is not configured', 503, req);
  }
  const authHeader = req.headers.get('Authorization') || '';
  const isServiceRequest = timingSafeEqual(authHeader, `Bearer ${serviceKey}`);
  const cronSecret = Deno.env.get('CRON_SECRET');
  const isCronRequest = Boolean(cronSecret && timingSafeEqual(req.headers.get('x-cron-secret'), cronSecret));
  let userId: string | null = null;
  if (!isServiceRequest && !isCronRequest) {
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return errorResponse('Missing Authorization bearer token', 401, req);
    }
    const preAuthRate = await enforceRateLimit(`crm-preauth:${getClientIP(req)}`, 120, 60_000);
    if (!preAuthRate.allowed) return errorResponse('Rate limit exceeded', 429, req);
    const auth = await requireAuth(req);
    if (auth instanceof Response) return auth;
    userId = auth.userId;
    const rate = await enforceRateLimit(`crm:${userId}:${getClientIP(req)}`, 60, 60_000);
    if (!rate.allowed) return errorResponse('Rate limit exceeded', 429, req);
  }

  let body: Record<string, unknown>;
  try {
    body = await readBoundedJson(req);
  } catch (error) {
    return errorResponse(error instanceof Error && error.message === 'REQUEST_TOO_LARGE'
      ? 'Request body is too large' : 'Invalid JSON body', error instanceof Error && error.message === 'REQUEST_TOO_LARGE' ? 413 : 400, req);
  }
  if (isCronRequest && body.action !== 'health' && body.action !== 'processOutbox') {
    return errorResponse('Cron credential is not allowed for this action', 403, req);
  }

  let externalUrl: string;
  let externalKey: string;
  try {
    externalUrl = requireEnv('EXTERNAL_SUPABASE_URL');
    externalKey = requireEnv('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY');
  } catch {
    return errorResponse('CRM integration is not configured', 503, req);
  }
  if (!isExpectedExternalUrl(externalUrl) || !isExpectedExternalServerKey(externalKey)) {
    return errorResponse('External CRM configuration is invalid', 503, req);
  }

  const externalClient = createClient(externalUrl, externalKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) }) },
  });
  const canonical = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const canonicalUser = isServiceRequest || isCronRequest ? canonical : createClient(supabaseUrl, requireEnv('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false }, global: { headers: { Authorization: authHeader } },
  });
  const started = performance.now();

  const userHasPermission = async (permission: string): Promise<boolean> => {
    if (!userId) return false;
    const { data, error } = await canonical.rpc('user_has_permission', {
      _user_id: userId,
      _permission_name: permission,
    });
    return !error && data === true;
  };

  const processRows = async (rows: OutboxRow[]) => {
    const results: Array<Record<string, unknown>> = [];
    for (const row of rows) {
      try {
        if (!row.lease_token || !row.normalized_phone) throw new Error('CRM_INVALID_QUEUE_ROW');
        const payload = row.payload || {};
        const result = await withTimeout(externalClient.rpc('sync_interaction_from_zapp', {
          p_phone: row.normalized_phone,
          p_channel: payload.channel || 'whatsapp',
          p_direction: payload.direction || 'inbound',
          p_assunto: payload.assunto || null,
          p_resumo: payload.resumo || null,
          p_conteudo: null,
          p_sentiment: payload.sentiment || 'neutral',
          p_message_count: payload.message_count || 0,
          p_duration_seconds: payload.duration_seconds || null,
          p_agent_name: payload.agent_name || null,
          p_zapp_conversation_id: row.idempotency_key,
        }));
        if (result.error) throw new Error(`CRM_SYNC:${result.error.code || 'unknown'}`);
        const value = parseSyncResult(result.data);
        if (row.contact_id) {
          const { data: stableLink, error: stableLinkError } = await canonical.from('crm_contact_links')
            .select('external_contact_id').eq('zapp_contact_id', row.contact_id).maybeSingle();
          if (stableLinkError) throw new Error(`CRM_LINK_READ:${stableLinkError.code || 'unknown'}`);
          if (stableLink && stableLink.external_contact_id !== value.contact_id) throw new Error('CRM_IDENTITY_MISMATCH');
          const { error: linkError } = await canonical.from('crm_contact_links').upsert({
            zapp_contact_id: row.contact_id,
            external_contact_id: value.contact_id,
            external_company_id: typeof value.company_id === 'string' ? value.company_id : null,
            normalized_phone: row.normalized_phone,
            link_source: 'sync_result', verified_at: new Date().toISOString(),
          }, { onConflict: 'zapp_contact_id' });
          if (linkError) throw new Error(`CRM_LINK:${linkError.code || 'unknown'}`);
        }
        const { error: completeError } = await canonical.rpc('complete_crm_sync_outbox', {
          p_id: row.id, p_lease_token: row.lease_token,
          p_interaction_id: value.interaction_id,
          p_contact_id: value.contact_id,
          p_company_id: value.company_id,
        });
        if (completeError) throw new Error(`CRM_QUEUE_COMPLETE:${completeError.code || 'unknown'}`);
        results.push({ id: row.id, ok: true, result: value });
      } catch (error) {
        const code = error instanceof Error ? error.message.split(':')[0] : 'CRM_UNKNOWN';
        const { error: failError } = await canonical.rpc('fail_crm_sync_outbox', {
          p_id: row.id, p_lease_token: row.lease_token, p_error_code: code,
        });
        if (failError) console.error(JSON.stringify({ event: 'crm_queue_fail_update', outbox_id: row.id, code: failError.code }));
        results.push({ id: row.id, ok: false, error_code: code });
      }
    }
    return results;
  };

  try {
    const action = body.action;
    let data: unknown;

    if (action === 'contactLookup') {
      if (isServiceRequest || isCronRequest || !isValidUUID(body.contactId) ||
        !['360', 'intelligence'].includes(String(body.lookup))) return errorResponse('Contact lookup is invalid', 400, req);
      const { data: contact, error: contactError } = await canonicalUser.from('contacts')
        .select('id,phone').eq('id', body.contactId).maybeSingle();
      if (contactError || !contact) return errorResponse('Contact not found or not visible', 404, req);
      const phone = normalizePhone(contact.phone);
      if (!phone) return errorResponse('Contact phone is invalid', 409, req);
      const rpc = body.lookup === '360' ? 'get_contact_360_by_phone' : 'get_contact_intelligence_by_phone';
      const result = await withTimeout(externalClient.rpc(rpc, { p_phone: phone }));
      if (result.error) throw new Error(`CRM_RPC:${result.error.code || 'unknown'}`);
      if (JSON.stringify(result.data).length > 512_000) throw new Error('CRM_RESPONSE_TOO_LARGE');
      data = result.data;
    } else if (action === 'contactLookupBatch') {
      if (isServiceRequest || isCronRequest || !Array.isArray(body.contactIds) || body.contactIds.length < 1 ||
        body.contactIds.length > 100 || body.contactIds.some((id) => !isValidUUID(id))) {
        return errorResponse('Contact batch is invalid', 400, req);
      }
      const contactIds = [...new Set(body.contactIds as string[])];
      const { data: contacts, error: contactsError } = await canonicalUser.from('contacts')
        .select('id,phone').in('id', contactIds);
      if (contactsError) throw new Error(`CRM_CONTACTS:${contactsError.code || 'unknown'}`);
      const phones = [...new Set((contacts || []).map((contact) => normalizePhone(contact.phone)).filter((phone): phone is string => Boolean(phone)))];
      if (phones.length === 0) { data = {}; }
      else {
        const result = await withTimeout(externalClient.rpc('get_companies_by_phones_batch', { p_phones: phones }));
        if (result.error) throw new Error(`CRM_RPC:${result.error.code || 'unknown'}`);
        if (!result.data || typeof result.data !== 'object' || Array.isArray(result.data) || JSON.stringify(result.data).length > 512_000) {
          throw new Error('CRM_INVALID_RESPONSE');
        }
        const allowedPhones = new Set(phones);
        data = Object.fromEntries(Object.entries(result.data as Record<string, unknown>)
          .filter(([phone]) => { const normalized = normalizePhone(phone); return normalized && allowedPhones.has(normalized); }));
      }
    } else if (action === 'rpc') {
      const { data: isAdmin, error: adminError } = await canonical.rpc('is_admin_or_supervisor', { _user_id: userId });
      if (adminError || !isAdmin) return errorResponse('Forbidden', 403, req);
      const validation = validateRpc(body.rpc, body.params);
      if (validation) return errorResponse(validation, 400, req);
      const normalizedParams = { ...(body.params as Record<string, unknown>) };
      if (typeof normalizedParams.p_phone === 'string') normalizedParams.p_phone = normalizePhone(normalizedParams.p_phone);
      if (Array.isArray(normalizedParams.p_phones)) normalizedParams.p_phones = normalizedParams.p_phones.map(normalizePhone);
      const result = await withTimeout(externalClient.rpc(body.rpc as string, normalizedParams));
      if (result.error) throw new Error(`CRM_RPC:${result.error.code || 'unknown'}`);
      data = result.data;
    } else if (action === 'select') {
      if (typeof body.table !== 'string' || !CRM_TABLE_ALLOWLIST.has(body.table)) return errorResponse('Table is not allowed', 400, req);
      const safeRolesLookup = body.table === 'salespeople' && body.select === 'role';
      if (safeRolesLookup && (body.filters !== undefined || body.order !== undefined || body.countMode !== undefined)) {
        return errorResponse('Role lookup parameters are not allowed', 400, req);
      }
      if (safeRolesLookup) {
        if (!await userHasPermission('view_contacts')) return errorResponse('Forbidden', 403, req);
      } else {
        const { data: isAdmin, error } = await canonical.rpc('is_admin_or_supervisor', { _user_id: userId });
        if (error || !isAdmin) return errorResponse('Forbidden', 403, req);
      }
      if (body.select !== undefined && (typeof body.select !== 'string' || body.select.length > 1000)) return errorResponse('Select is invalid', 400, req);
      let query = externalClient.from(body.table).select((body.select as string) || '*', {
        count: body.countMode as 'exact' | 'planned' | 'estimated' | undefined,
      });
      if (body.filters !== undefined) {
        if (!Array.isArray(body.filters) || body.filters.length > 12) return errorResponse('Filters are invalid', 400, req);
        for (const raw of body.filters) {
          const filter = raw as Record<string, unknown>;
          if (!validIdentifier(filter.column) || typeof filter.operator !== 'string' || !FILTER_OPERATORS.has(filter.operator)) return errorResponse('Filter is invalid', 400, req);
          if (filter.operator === 'in') {
            if (!Array.isArray(filter.value) || filter.value.length < 1 || filter.value.length > 100 ||
              filter.value.some((value) => value !== null && !['string', 'number', 'boolean'].includes(typeof value))) {
              return errorResponse('Filter value is invalid', 400, req);
            }
            query = query.in(filter.column, filter.value);
          } else {
            if (filter.value !== null && !['string', 'number', 'boolean'].includes(typeof filter.value)) return errorResponse('Filter value is invalid', 400, req);
            if (typeof filter.value === 'string' && filter.value.length > 500) return errorResponse('Filter value is too long', 400, req);
            query = query.filter(filter.column, filter.operator, filter.value);
          }
        }
      }
      if (body.order !== undefined) {
        const order = body.order as Record<string, unknown>;
        if (!order || !validIdentifier(order.column)) return errorResponse('Order is invalid', 400, req);
        query = query.order(order.column, { ascending: order.ascending !== false });
      }
      const limit = typeof body.limit === 'number' && Number.isInteger(body.limit) ? Math.min(Math.max(body.limit, 1), 500) : 50;
      const offset = typeof body.offset === 'number' && Number.isInteger(body.offset) ? Math.min(Math.max(body.offset, 0), 100_000) : 0;
      const result = await withTimeout(query.range(offset, offset + limit - 1));
      if (result.error) throw new Error(`CRM_SELECT:${result.error.code || 'unknown'}`);
      data = result.data || [];
      const duration = Math.round(performance.now() - started);
      return jsonResponse({ data, meta: { record_count: result.count ?? (data as unknown[]).length, duration_ms: duration, severity: duration > 3000 ? 'slow' : 'ok' } }, 200, req);
    } else if (action === 'mutate') {
      const mutationAction = body.mutationAction;
      const validation = validateMutation(body.table, mutationAction, body.data, body.match);
      if (validation) return errorResponse(validation, 400, req);
      const { data: isAdmin, error } = await canonical.rpc('is_admin_or_supervisor', { _user_id: userId });
      if (error || !isAdmin) return errorResponse('Forbidden', 403, req);
      const query = mutationAction === 'insert'
        ? externalClient.from(body.table as string).insert(body.data as Record<string, unknown>)
        : externalClient.from(body.table as string).update(body.data as Record<string, unknown>).eq('id', (body.match as Record<string, unknown>).id);
      const result = await withTimeout(query.select());
      if (result.error) throw new Error(`CRM_MUTATION:${result.error.code || 'unknown'}`);
      data = result.data || [];
    } else if (action === 'enqueueSync') {
      if (isServiceRequest || isCronRequest || !isValidUUID(body.contactId)) return errorResponse('Contact id is invalid', 400, req);
      const { data: contact, error: contactError } = await canonicalUser.from('contacts')
        .select('id,phone').eq('id', body.contactId).maybeSingle();
      if (contactError || !contact) return errorResponse('Contact not found or not visible', 404, req);
      const phone = normalizePhone(contact.phone);
      if (!phone) return errorResponse('Contact phone is invalid', 409, req);
      const { data: closure } = await canonicalUser.from('conversation_closures')
        .select('id').eq('contact_id', contact.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!closure) return errorResponse('Resolve the conversation before syncing', 409, req);
      const { data: queued, error: queueError } = await canonical.from('crm_sync_outbox').upsert({
        closure_id: closure.id, contact_id: contact.id, idempotency_key: `closure:${closure.id}`,
        normalized_phone: phone,
      }, { onConflict: 'closure_id', ignoreDuplicates: true }).select('id').maybeSingle();
      if (queueError) throw new Error(`CRM_QUEUE:${queueError.code || 'unknown'}`);
      const { data: existing, error: existingError } = queued
        ? { data: queued, error: null }
        : await canonical.from('crm_sync_outbox')
          .select('id,status,external_interaction_id,external_contact_id,external_company_id')
          .eq('closure_id', closure.id).single();
      if (existingError || !existing) throw new Error(`CRM_QUEUE:${existingError?.code || 'missing'}`);
      const { data: claimed, error: claimError } = await canonical.rpc('claim_crm_sync_outbox_by_id', {
        p_id: existing.id, p_worker: `edge:${crypto.randomUUID()}`,
      });
      if (claimError) throw new Error(`CRM_QUEUE:${claimError.code || 'unknown'}`);
      const processed = await processRows((claimed || []) as OutboxRow[]);
      const first = processed[0];
      if (first?.ok) {
        data = first.result as Record<string, unknown>;
      } else if (!first && 'status' in existing && existing.status === 'succeeded') {
        data = {
          synced: true, reason: 'duplicate', interaction_id: existing.external_interaction_id,
          contact_id: existing.external_contact_id, company_id: existing.external_company_id,
        };
      } else {
        data = { synced: false, queued: true, reason: first?.error_code || 'already_queued' };
      }
    } else if (action === 'health') {
      if (!isServiceRequest && !isCronRequest) {
        const { data: isAdmin, error: adminError } = await canonical.rpc('is_admin_or_supervisor', { _user_id: userId });
        if (adminError || !isAdmin) return errorResponse('Forbidden', 403, req);
      }
      const [externalHealth, queueHealth] = await Promise.all([
        withTimeout(externalClient.rpc('get_contact_360_by_phone', { p_phone: '00000000' })),
        canonical.rpc('get_crm_sync_health'),
      ]);
      if (externalHealth.error) throw new Error(`CRM_HEALTH:${externalHealth.error.code || 'unknown'}`);
      if (queueHealth.error) throw new Error(`CRM_QUEUE_HEALTH:${queueHealth.error.code || 'unknown'}`);
      data = { external_reachable: true, queue: queueHealth.data };
    } else if (action === 'processOutbox') {
      if (!isServiceRequest && !isCronRequest) {
        const { data: isAdmin } = await canonical.rpc('is_admin_or_supervisor', { _user_id: userId });
        if (!isAdmin) return errorResponse('Forbidden', 403, req);
      }
      const { data: claimed, error } = await canonical.rpc('claim_crm_sync_outbox', {
        p_worker: `edge:${crypto.randomUUID()}`,
        p_limit: typeof body.limit === 'number' ? Math.min(Math.max(Math.trunc(body.limit), 1), MAX_BATCH_SIZE) : MAX_BATCH_SIZE,
      });
      if (error) throw new Error(`CRM_QUEUE:${error.code || 'unknown'}`);
      data = await processRows((claimed || []) as OutboxRow[]);
    } else {
      return errorResponse('Action is not allowed', 400, req);
    }

    const duration = Math.round(performance.now() - started);
    console.warn(JSON.stringify({ event: 'crm_integration', action, user_id: userId, duration_ms: duration, ok: true }));
    return jsonResponse({ data, meta: { record_count: Array.isArray(data) ? data.length : data == null ? 0 : 1, duration_ms: duration, severity: duration > 3000 ? 'slow' : 'ok' } }, 200, req);
  } catch (error) {
    const code = error instanceof Error ? error.message.split(':')[0] : 'CRM_UNKNOWN';
    const status = code === 'CRM_TIMEOUT' ? 504 : 502;
    console.error(JSON.stringify({ event: 'crm_integration', action: body.action, user_id: userId, code, ok: false }));
    return errorResponse(code === 'CRM_TIMEOUT' ? 'External CRM timed out' : 'External CRM request failed', status, req);
  }
}

if (import.meta.main) Deno.serve(handleCRMIntegrationRequest);
