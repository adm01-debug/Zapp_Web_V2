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
import { resolveInstanceToken, type InstanceTokenClient } from '../_shared/evolution-instance-token.ts';
import {
  EFFECT_MESSAGE_SEND,
  enqueueEffectReconcile,
  type ReconcileClient,
} from '../_shared/effect-reconcile.ts';

const MAX_REQUEST_BYTES = 8 * 1024;
const WORKER_NAME = 'edge:message-delivery';
// Lease que a Edge pede ao claim_outbound_message (30..300 por contrato da RPC).
export const CLAIM_LEASE_SECONDS = 90;
// PD-79 (t_ea8decbb): o POST ao provedor TI M tem de terminar antes do lease de
// CLAIM_LEASE_SECONDS vencer. Com o timeout >= lease, a linha ficaria com POST
// iniciado e lease vencido -> resultado AMBIGUO (o re-claim recusa e ela vira
// 'failed' pela varredura). 45 s cabem com folga nos 90 s do lease.
export const PROVIDER_POST_TIMEOUT_MS = 45_000;
// PD-79 (t_76478b12): o limite de envio da Edge tem de acompanhar o throttle do
// cliente, senão um usuário que envia no ritmo que o app permite toma 429 aqui.
// O cliente (src/lib/sendThrottle.ts: SEND_THROTTLE_BURST=5 a cada
// SEND_THROTTLE_WINDOW_MS=3 s) deixa passar até 100 envios/min; o limite da Edge
// estava em 60/min — abaixo do que o próprio app autoriza.
export const MESSAGE_DELIVERY_RATE_LIMIT_PER_MINUTE = 100;

function isAbortError(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'TimeoutError' || name === 'AbortError';
}

type Claim = {
  message_id: string;
  contact_id: string;
  agent_id: string;
  content: string;
  message_type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location' | 'poll' | 'contact' | 'buttons' | 'list';
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
    case 'buttons': {
      const body = richPayload?.body;
      const title = richPayload?.title;
      const footer = richPayload?.footer;
      const buttons = richPayload?.buttons;
      if (typeof body !== 'string' || body.trim().length < 1 || body.trim().length > 1024 ||
          (title !== undefined && (typeof title !== 'string' || title.length > 60)) ||
          (footer !== undefined && (typeof footer !== 'string' || footer.length > 60)) ||
          !Array.isArray(buttons) || buttons.length < 1 || buttons.length > 3 ||
          !buttons.every((button) => {
            const b = asRecord(button);
            if (!b) return false;
            if (typeof b.type !== 'string' || !['reply', 'url', 'call'].includes(b.type)) return false;
            if (typeof b.displayText !== 'string' || b.displayText.trim().length < 1 || b.displayText.trim().length > 20) return false;
            if (b.id !== undefined && (typeof b.id !== 'string' || b.id.length > 256)) return false;
            if (b.type === 'reply' && (typeof b.id !== 'string' || b.id.length < 1)) return false;
            if (b.type === 'url' && (typeof b.url !== 'string' || b.url.length > 2048 || !/^https?:\/\//.test(b.url))) return false;
            if (b.type === 'call' && (typeof b.phoneNumber !== 'string' || !/^\d{8,15}$/.test(b.phoneNumber.replace(/\D/g, '')))) return false;
            return true;
          })) {
        throw new Error('invalid_buttons_payload');
      }
      return {
        path: `/message/sendButtons/${claim.whatsapp_instance_name}`,
        body: {
          ...base,
          ...(typeof title === 'string' && title.length > 0 ? { title } : {}),
          description: body,
          footer: typeof footer === 'string' && footer.length > 0 ? footer : ' ',
          buttons: buttons.map((button) => {
            const b = button as Record<string, unknown>;
            return {
              type: b.type,
              displayText: b.displayText,
              ...(typeof b.id === 'string' ? { id: b.id } : {}),
              ...(typeof b.url === 'string' ? { url: b.url } : {}),
              ...(typeof b.phoneNumber === 'string' ? { phoneNumber: b.phoneNumber.replace(/\D/g, '') } : {}),
            };
          }),
          ...quoted,
        },
      };
    }
    case 'list': {
      const body = richPayload?.body;
      const title = richPayload?.title;
      const footer = richPayload?.footer;
      const buttonText = richPayload?.buttonText;
      const sections = richPayload?.sections;
      if (typeof body !== 'string' || body.trim().length < 1 || body.trim().length > 1024 ||
          (title !== undefined && (typeof title !== 'string' || title.length > 60)) ||
          (footer !== undefined && (typeof footer !== 'string' || footer.length > 60)) ||
          typeof buttonText !== 'string' || buttonText.trim().length < 1 || buttonText.trim().length > 20 ||
          !Array.isArray(sections) || sections.length < 1 || sections.length > 10 ||
          !sections.every((section) => {
            const s = asRecord(section);
            if (!s) return false;
            if (typeof s.title !== 'string' || s.title.trim().length < 1 || s.title.trim().length > 24) return false;
            if (!Array.isArray(s.rows) || s.rows.length < 1 || s.rows.length > 10) return false;
            return s.rows.every((row) => {
              const r = asRecord(row);
              if (!r) return false;
              if (typeof r.title !== 'string' || r.title.trim().length < 1 || r.title.trim().length > 24) return false;
              if (r.description !== undefined && (typeof r.description !== 'string' || r.description.length > 72)) return false;
              return typeof r.id === 'string' && r.id.length >= 1 && r.id.length <= 256;
            });
          })) {
        throw new Error('invalid_list_payload');
      }
      return {
        path: `/message/sendList/${claim.whatsapp_instance_name}`,
        body: {
          ...base,
          ...(typeof title === 'string' && title.length > 0 ? { title } : {}),
          description: body,
          footer: typeof footer === 'string' && footer.length > 0 ? footer : ' ',
          buttonText,
          sections: sections.map((section) => {
            const s = section as Record<string, unknown>;
            return {
              title: s.title,
              rows: (s.rows as Record<string, unknown>[]).map((row) => ({
                title: row.title,
                ...(typeof row.description === 'string' && row.description.length > 0 ? { description: row.description } : {}),
                rowId: row.id,
              })),
            };
          }),
          ...quoted,
        },
      };
    }
    default:
      throw new Error('unsupported_message_type');
  }
}

/**
 * E15 / TRA-002 (#18): entrega o outbound à Evolution com a credencial da
 * PRÓPRIA conexão do claim. O token sai de `get_instance_token` pelo
 * `whatsapp_instance_name` (Vault, E18/E19) — nunca da key global, que faria a
 * GO atender pela instância padrão. Sem token resolvido, `evoFetch` falha
 * fechado (400, antes de qualquer rede) em vez de emprestar a credencial da
 * padrão. `resolveInstanceToken` não lança: sem credencial segura devolve null.
 */
export async function deliverOutbound(
  service: InstanceTokenClient,
  evolutionUrl: string,
  evolutionKey: string,
  outbound: { path: string; body: Record<string, unknown> },
  instanceName: string,
  fetcher?: (url: string, options: RequestInit) => Promise<Response>,
  signal?: AbortSignal,
): Promise<Response> {
  const instanceToken = await resolveInstanceToken(service, instanceName);
  return evoFetch(
    evolutionUrl,
    evolutionKey,
    outbound.path,
    outbound.body,
    fetcher,
    undefined,
    signal,
    instanceToken ?? undefined,
  );
}

/**
 * PD-79 (t_ea8decbb): dispara o POST ao provedor sob um timeout MENOR que o lease
 * do claim. O timeout aborta a requisição; o chamador trata o abort como resultado
 * AMBÍGUO (a mensagem pode ter saído) — nunca reenvio automático. Devolver o
 * resultado em vez de lançar deixa o caminho ambíguo explícito e testável.
 */
export async function dispatchProviderPost(
  deliver: (signal: AbortSignal) => Promise<Response>,
  timeoutMs: number = PROVIDER_POST_TIMEOUT_MS,
): Promise<{ ok: boolean; response: Response | null; aborted: boolean }> {
  try {
    const response = await deliver(AbortSignal.timeout(timeoutMs));
    return { ok: true, response, aborted: false };
  } catch (error) {
    return { ok: false, response: null, aborted: isAbortError(error) };
  }
}

/**
 * PD-79: carimba no banco que o POST ao provedor VAI sair, com fencing por
 * (id, token) em status='sending'. A RPC recusa lease vencido — aí o POST NÃO
 * pode sair (nada foi enviado; a linha segue retomável). Idempotente no mesmo token.
 */
export async function markOutboundPostStarted(
  service: ServiceClient,
  messageId: string,
  claimToken: string,
): Promise<{ marked: boolean; code?: string }> {
  const { error } = await service.rpc('mark_outbound_post_started', {
    p_message_id: messageId,
    p_claim_token: claimToken,
  });
  if (error) return { marked: false, code: error.code };
  return { marked: true };
}

/**
 * PD-78 / PD-79: quando o claim volta VAZIO a linha não pode ficar muda em
 * 'sending'. A RPC fail_outbound_unclaimed decide o motivo NO BANCO (o chamador
 * não informa: telefone inválido -> sem conexão conectada -> genérico) e marca a
 * linha 'failed' — nunca reenvia. O ator é o profile que clicou; a RPC resolve o
 * papel (dono ou admin/supervisor ativo). Com lease VIVO a RPC recusa (42501).
 */
export async function recordUnclaimedFailure(
  service: ServiceClient,
  messageId: string,
  agentId: string,
): Promise<{ recorded: boolean; reason: string | null; code?: string }> {
  const { data, error } = await service.rpc('fail_outbound_unclaimed', {
    p_message_id: messageId,
    p_agent_id: agentId,
  });
  if (error) return { recorded: false, reason: null, code: error.code };
  const reason = (asRecord(data)?.delivery_failure_reason as string | undefined) ?? 'nao_despachada';
  return { recorded: true, reason };
}

/**
 * Resultado AMBÍGUO: o POST já saiu (ou pode ter saído) e não há recibo confiável.
 * Marca a linha terminal NÃO retentável e enfileira a reconciliação somente-leitura.
 * Nunca reenvia automaticamente.
 */
export async function settleAmbiguousDelivery(
  service: ServiceClient & ReconcileClient,
  claim: Pick<Claim, 'message_id' | 'claim_token'>,
  externalId: string | null = null,
): Promise<void> {
  await failClaim(service, claim);
  await enqueueDeliveryReconciliation(service, claim as Claim, externalId);
}

export async function failClaim(
  service: ServiceClient,
  claim: Pick<Claim, 'message_id' | 'claim_token'>,
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

/**
 * IA-047: enfileira a RECONCILIAÇÃO (somente-leitura, idempotente, SEM reenvio)
 * de uma entrega cujo resultado ficou incerto. A chave estável
 * `reconcile:message.send:<message_id>` colide no UNIQUE de `ai_jobs`, então
 * repetir devolve o MESMO job. Best-effort: a linha já está terminal/quarentena,
 * então uma falha aqui só é logada e a linha segue visível para ação humana.
 */
async function enqueueDeliveryReconciliation(
  service: ReconcileClient,
  claim: Claim,
  externalId: string | null,
): Promise<void> {
  try {
    await enqueueEffectReconcile({
      supabase: service,
      effect: EFFECT_MESSAGE_SEND,
      sourceTable: 'messages',
      sourceId: claim.message_id,
      externalId,
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'message_delivery_reconcile_enqueue_error',
      code: error instanceof Error ? error.message : 'unknown',
    }));
  }
}

export async function handleMessageDeliveryRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405, req);

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const rate = await enforceRateLimit(
    `message-delivery:${auth.userId}:${getClientIP(req)}`,
    MESSAGE_DELIVERY_RATE_LIMIT_PER_MINUTE,
    60_000
  );
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
    p_lease_seconds: CLAIM_LEASE_SECONDS,
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
    // PD-78 / PD-79: o claim vazio não pode ficar mudo. A RPC decide o motivo NO
    // BANCO (telefone inválido -> sem conexão conectada -> genérico) e marca a
    // linha 'failed' — nunca reenvia. Com lease VIVO a RPC recusa (42501): a
    // entrega está em curso, devolvemos 409 sem tocar na linha.
    const failure = await recordUnclaimedFailure(service, messageId, profile.id);
    if (!failure.recorded) {
      if (failure.code === '42501') {
        return errorResponse('Message delivery is already in progress', 409, req);
      }
      console.error(JSON.stringify({ event: 'message_delivery_unclaimed_error', code: failure.code }));
      return errorResponse('Message delivery cannot be dispatched', 409, req);
    }
    console.error(JSON.stringify({ event: 'message_delivery_unclaimed', reason: failure.reason }));
    // Corpo legível pelo cliente: `reason` é o motivo decidido no banco e `error`
    // mantém o formato que o resto das edges usa em non-2xx.
    return jsonResponse({
      messageId,
      status: 'failed',
      reason: failure.reason,
      error: `Message not dispatched: ${failure.reason}`,
    }, 409, req);
  }

  // IA-047: rastreia se o POST ao provedor já saiu. Se saiu e o resultado ficou
  // ambíguo, enfileira a RECONCILIAÇÃO (somente-leitura, sem reenvio).
  let providerPostAttempted = false;
  let externalId: string | null = null;
  try {
    const mediaUrl = claim.media_url
      ? await resolvePrivateBucketUrl(caller, claim.media_url, undefined, supabaseUrl)
      : null;
    let richPayload: Record<string, unknown> | null = null;
    if (claim.message_type === 'poll' || claim.message_type === 'contact'
        || claim.message_type === 'buttons' || claim.message_type === 'list') {
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

    // PD-79: carimba o POST iniciado IMEDIATAMENTE antes de disparar. Sem isso, um
    // POST que passe do lease de 90 s deixaria a linha reivindicável de novo
    // (reenvio duplicado ao WhatsApp). A marca recusa lease vencido — aí NÃO
    // disparamos: nada saiu e a linha segue retomável, sem resultado ambíguo.
    const mark = await markOutboundPostStarted(service, claim.message_id, claim.claim_token);
    if (!mark.marked) {
      console.error(JSON.stringify({ event: 'message_delivery_post_mark_failed', code: mark.code }));
      return errorResponse('Message delivery claim is no longer valid; nothing was sent', 409, req);
    }

    providerPostAttempted = true;
    const post = await dispatchProviderPost((signal) =>
      deliverOutbound(
        service, evolutionUrl, evolutionKey, outbound, claim.whatsapp_instance_name,
        undefined, signal,
      )
    );
    if (!post.ok || !post.response) {
      // Timeout/aborto/rede DEPOIS do POST: a mensagem pode ter saído. Resultado
      // AMBÍGUO — nunca reenvio automático. Marca a linha terminal não retentável
      // e enfileira a reconciliação somente-leitura.
      await settleAmbiguousDelivery(service, claim, null);
      console.error(JSON.stringify({
        event: post.aborted ? 'message_delivery_post_timeout' : 'message_delivery_post_error',
      }));
      return errorResponse('Message delivery outcome is uncertain', 502, req);
    }
    const providerResponse = post.response;
    const raw = await providerResponse.text();
    let providerData: unknown = null;
    try { providerData = raw ? JSON.parse(raw) : null; } catch { /* provider response is invalid */ }

    if (!providerResponse.ok) {
      await failClaim(service, claim);
      // 5xx: o provedor pode ter aceitado antes de falhar → efeito INCERTO.
      // 4xx: rejeição definitiva, nada a reconciliar.
      if (providerResponse.status >= 500) {
        await enqueueDeliveryReconciliation(service, claim, null);
      }
      console.error(JSON.stringify({ event: 'message_delivery_provider_error', status: providerResponse.status }));
      return errorResponse('Message provider rejected the delivery', 502, req);
    }

    externalId = extractMessageId(providerData) ?? null;
    if (!externalId || externalId.length > 512) {
      await failClaim(service, claim);
      // 200 sem id: ambíguo (pode ter enviado). Efeito INCERTO.
      await enqueueDeliveryReconciliation(service, claim, null);
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
      // IA-047: temos o id do provedor — o varredor confirma por ele, SOMENTE-LEITURA.
      await enqueueDeliveryReconciliation(service, claim, externalId);
      console.error(JSON.stringify({ event: 'message_delivery_complete_error', code: completeError?.code }));
      return errorResponse('Unable to persist delivery receipt', 502, req);
    }

    // O SLA de 1ª resposta é registrado pelo trigger trg_messages_sla_first_response,
    // disparado dentro de complete_outbound_message() quando a mensagem vira 'sent'
    // (20260903225000 + 20261006211248). A RPC mark_first_response aqui era
    // redundante e falhava sempre com 42501: ela exige auth.uid() e este caminho roda
    // com service_role. Nada a fazer depois do recibo.
    return jsonResponse({ messageId: completed.id, status: completed.status, externalId, idempotent: false }, 200, req);
  } catch (error) {
    await failClaim(service, claim);
    // IA-047: exceção depois do POST (rede/timeout/corpo): efeito INCERTO.
    // Enfileira a reconciliação com o id se já o tínhamos; nunca reenvia.
    if (providerPostAttempted) {
      await enqueueDeliveryReconciliation(service, claim, externalId);
    }
    console.error(JSON.stringify({ event: 'message_delivery_exception', code: error instanceof Error ? error.message : 'unknown' }));
    return errorResponse('Message delivery failed', 502, req);
  }
}

if (import.meta.main) Deno.serve(handleMessageDeliveryRequest);
