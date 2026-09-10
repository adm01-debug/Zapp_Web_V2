import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.87.1';
import {
  enforceRateLimit,
  errorResponse,
  getClientIP,
  handleCors,
  isValidUUID,
  jsonResponse,
  requireAuth,
  requireEnv,
} from '../_shared/validation.ts';
import { resolvePrivateBucketUrl } from '../_shared/evolution-api-proxy.ts';
import { evoFetch, extractMessageId } from '../_shared/evolution-send.ts';

const MAX_REQUEST_BYTES = 8 * 1024;
const WORKER_NAME = 'edge:message-delivery';

type Claim = {
  message_id: string;
  contact_id: string;
  agent_id: string;
  content: string;
  message_type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location' | 'poll' | 'contact';
  media_url: string | null;
  caption: string | null;
  media_filename: string | null;
  media_mimetype: string | null;
  reply_external_id: string | null;
  whatsapp_instance_name: string;
  contact_phone: string;
  claim_token: string;
};

interface ServiceClient {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: { code?: string } | null;
  }>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function readMessageId(req: Request): Promise<string | null> {
  const declaredLength = Number(req.headers.get('content-length') || '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) return null;
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return null;
  }
  const body = asRecord(payload);
  return isValidUUID(body?.messageId) ? body?.messageId as string : null;
}

export function providerPayload(
  claim: Claim,
  mediaUrl: string | null,
  richPayload: Record<string, unknown> | null = null,
): { path: string; body: Record<string, unknown> } {
  const base = { number: claim.contact_phone };
  const quoted = claim.reply_external_id ? { quoted: { key: { id: claim.reply_external_id } } } : {};

  switch (claim.message_type) {
    case 'image':
    case 'video':
    case 'document':
      if (!mediaUrl) throw new Error('missing_media_url');
      return {
        path: `/message/sendMedia/${claim.whatsapp_instance_name}`,
        body: {
          ...base,
          mediatype: claim.message_type,
          media: mediaUrl,
          ...(claim.message_type === 'document'
            ? {
              fileName: claim.media_filename || claim.content,
              ...(claim.caption ? { caption: claim.caption } : {}),
            }
            : (claim.caption ? { caption: claim.caption } : {})),
          ...(claim.media_mimetype ? { mimetype: claim.media_mimetype } : {}),
          ...quoted,
        },
      };
    case 'audio':
      if (!mediaUrl) throw new Error('missing_media_url');
      return {
        path: `/message/sendWhatsAppAudio/${claim.whatsapp_instance_name}`,
        body: { ...base, audio: mediaUrl, ...quoted },
      };
    case 'sticker':
      if (!mediaUrl) throw new Error('missing_media_url');
      return {
        path: `/message/sendSticker/${claim.whatsapp_instance_name}`,
        body: { ...base, sticker: mediaUrl, ...quoted },
      };
    case 'text':
      return {
        path: `/message/sendText/${claim.whatsapp_instance_name}`,
        body: { ...base, text: claim.content, ...quoted },
      };
    case 'location': {
      let location: unknown;
      try { location = JSON.parse(claim.content); } catch { throw new Error('invalid_location_payload'); }
      const parsed = asRecord(location);
      if (!parsed) throw new Error('invalid_location_payload');
      const latitude = parsed?.latitude;
      const longitude = parsed?.longitude;
      if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
          typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        throw new Error('invalid_location_payload');
      }
      return {
        path: `/message/sendLocation/${claim.whatsapp_instance_name}`,
        body: {
          ...base, latitude, longitude,
          ...(typeof parsed.name === 'string' ? { name: parsed.name.slice(0, 512) } : {}),
          ...(typeof parsed.address === 'string' ? { address: parsed.address.slice(0, 1024) } : {}),
          ...quoted,
        },
      };
    }
    case 'poll': {
      const name = richPayload?.name;
      const values = richPayload?.values;
      const selectableCount = richPayload?.selectableCount;
      if (typeof name !== 'string' || !Array.isArray(values) || values.length < 2 || values.length > 12 ||
          !values.every((value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 256) ||
          typeof selectableCount !== 'number' || !Number.isInteger(selectableCount) ||
          selectableCount < 1 || selectableCount > values.length) {
        throw new Error('invalid_poll_payload');
      }
      return {
        path: `/message/sendPoll/${claim.whatsapp_instance_name}`,
        body: { ...base, name, values, selectableCount, ...quoted },
      };
    }
    case 'contact': {
      const fullName = richPayload?.fullName;
      const phoneNumber = richPayload?.phoneNumber;
      if (typeof fullName !== 'string' || fullName.trim().length === 0 || fullName.length > 512 ||
          typeof phoneNumber !== 'string' || !/^\d{8,15}$/.test(phoneNumber.replace(/\D/g, ''))) {
        throw new Error('invalid_contact_card_payload');
      }
      const contact = {
        fullName,
        phoneNumber: phoneNumber.replace(/\D/g, ''),
        ...(typeof richPayload?.organization === 'string' ? { organization: richPayload.organization.slice(0, 512) } : {}),
        ...(typeof richPayload?.email === 'string' ? { email: richPayload.email.slice(0, 320) } : {}),
      };
      return {
        path: `/message/sendContact/${claim.whatsapp_instance_name}`,
        body: { ...base, contact: [contact], ...quoted },
      };
    }
    default:
      throw new Error('unsupported_message_type');
  }
}

async function failClaim(
  service: ServiceClient,
  claim: Claim,
): Promise<void> {
  const { error } = await service.rpc('fail_outbound_message', {
    p_message_id: claim.message_id,
    p_claim_token: claim.claim_token,
    // A response ambiguity can duplicate a WhatsApp message. Never retry it
    // automatically; an operator can make an explicit retry with a new action.
    p_retryable: false,
  });
  if (error) console.error(JSON.stringify({ event: 'message_delivery_fail_transition', code: error.code }));
}

export async function handleMessageDeliveryRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405, req);

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const rate = await enforceRateLimit(`message-delivery:${auth.userId}:${getClientIP(req)}`, 60, 60_000);
  if (!rate.allowed) return errorResponse('Rate limit exceeded', 429, req);

  const messageId = await readMessageId(req);
  if (!messageId) return errorResponse('messageId must be a UUID', 400, req);

  let supabaseUrl: string;
  let serviceRoleKey: string;
  let anonKey: string;
  let evolutionUrl: string;
  let evolutionKey: string;
  try {
    supabaseUrl = requireEnv('SUPABASE_URL');
    serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    anonKey = requireEnv('SUPABASE_ANON_KEY');
    evolutionUrl = requireEnv('EVOLUTION_API_URL').replace(/\/+$/, '');
    evolutionKey = requireEnv('EVOLUTION_API_KEY');
  } catch {
    return errorResponse('Message delivery is not configured', 503, req);
  }

  const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const caller = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: req.headers.get('authorization') || req.headers.get('Authorization') || '' } },
  });
  const { data: profile, error: profileError } = await service
    .from('profiles')
    .select('id, is_active')
    .eq('user_id', auth.userId)
    .maybeSingle();
  if (profileError || !profile?.id || profile.is_active !== true) {
    return errorResponse('Forbidden', 403, req);
  }

  const { data: claimedRows, error: claimError } = await service.rpc('claim_outbound_message', {
    p_message_id: messageId,
    p_agent_id: profile.id,
    p_worker: WORKER_NAME,
    p_lease_seconds: 90,
  });
  if (claimError) {
    console.error(JSON.stringify({ event: 'message_delivery_claim_error', code: claimError.code }));
    return errorResponse('Unable to claim message delivery', 502, req);
  }

  const claim = (claimedRows?.[0] ?? null) as Claim | null;
  if (!claim) {
    const { data: existing, error: existingError } = await service
      .from('messages')
      .select('agent_id, sender, status, external_id')
      .eq('id', messageId)
      .maybeSingle();
    if (existingError || !existing || existing.agent_id !== profile.id || existing.sender !== 'agent') {
      return errorResponse('Message not found', 404, req);
    }
    if (existing.external_id && ['sent', 'delivered', 'read'].includes(existing.status || '')) {
      return jsonResponse({ messageId, status: existing.status, externalId: existing.external_id, idempotent: true }, 200, req);
    }
    return errorResponse('Message delivery is already in progress or cannot be sent', 409, req);
  }

  try {
    const mediaUrl = claim.media_url
      ? await resolvePrivateBucketUrl(caller, claim.media_url, undefined, supabaseUrl)
      : null;
    let richPayload: Record<string, unknown> | null = null;
    if (claim.message_type === 'poll' || claim.message_type === 'contact') {
      const { data: messageMetadata, error: metadataError } = await service
        .from('messages')
        .select('media_meta')
        .eq('id', claim.message_id)
        .maybeSingle();
      const meta = asRecord(messageMetadata?.media_meta);
      richPayload = asRecord(meta?.outbound_delivery_payload);
      if (metadataError || !richPayload) throw new Error('missing_rich_delivery_payload');
    }
    const outbound = providerPayload(claim, mediaUrl, richPayload);
    const providerResponse = await evoFetch(evolutionUrl, evolutionKey, outbound.path, outbound.body);
    const raw = await providerResponse.text();
    let providerData: unknown = null;
    try { providerData = raw ? JSON.parse(raw) : null; } catch { /* provider response is invalid */ }

    if (!providerResponse.ok) {
      await failClaim(service, claim);
      console.error(JSON.stringify({ event: 'message_delivery_provider_error', status: providerResponse.status }));
      return errorResponse('Message provider rejected the delivery', 502, req);
    }

    const externalId = extractMessageId(providerData);
    if (!externalId || externalId.length > 512) {
      await failClaim(service, claim);
      console.error(JSON.stringify({ event: 'message_delivery_missing_provider_id' }));
      return errorResponse('Message provider returned an invalid delivery receipt', 502, req);
    }

    const { data: completed, error: completeError } = await service.rpc('complete_outbound_message', {
      p_message_id: claim.message_id,
      p_claim_token: claim.claim_token,
      p_external_id: externalId,
      p_delivery_status: 'sent',
    });
    if (completeError || !completed?.id) {
      // Evolution may have accepted the send even though its receipt could not
      // be persisted. Make this terminal so an expired lease can never resend
      // the same WhatsApp message; reconciliation is an explicit operation.
      await failClaim(service, claim);
      console.error(JSON.stringify({ event: 'message_delivery_complete_error', code: completeError?.code }));
      return errorResponse('Unable to persist delivery receipt', 502, req);
    }

    // This is intentionally best effort: delivery already has its durable
    // receipt, so a metric failure must never turn a sent WhatsApp message into
    // a client-visible send failure.
    try {
      const { error: metricError } = await service.rpc('mark_first_response', {
        p_contact_id: claim.contact_id,
      });
      if (metricError) {
        console.error(JSON.stringify({ event: 'message_delivery_metric_error', code: metricError.code }));
      }
    } catch {
      console.error(JSON.stringify({ event: 'message_delivery_metric_error' }));
    }
    return jsonResponse({ messageId: completed.id, status: completed.status, externalId, idempotent: false }, 200, req);
  } catch (error) {
    await failClaim(service, claim);
    console.error(JSON.stringify({ event: 'message_delivery_exception', code: error instanceof Error ? error.message : 'unknown' }));
    return errorResponse('Message delivery failed', 502, req);
  }
}

if (import.meta.main) Deno.serve(handleMessageDeliveryRequest);
