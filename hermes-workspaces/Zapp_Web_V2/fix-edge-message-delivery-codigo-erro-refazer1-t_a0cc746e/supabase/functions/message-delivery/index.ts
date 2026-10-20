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
import { providerErrorInfo } from '../_shared/messaging/errors.ts';
import {
  EFFECT_MESSAGE_SEND,
  enqueueEffectReconcile,
  type ReconcileClient,
} from '../_shared/effect-reconcile.ts';

const MAX_REQUEST_BYTES = 8 * 1024;
const WORKER_NAME = 'edge:message-delivery';

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

// ── Código de erro estável para o cliente (PD-80) ────────────────────────────
// O corpo de erro passa a carregar um `code` estável, se a falha é retentável
// (`retryable`) e se o resultado ficou AMBÍGUO (`ambiguous`: a mensagem PODE ter
// saído). O `error` é mensagem FIXA por código — nunca o corpo do provedor,
// telefone, token ou texto da mensagem.
export type DeliveryErrorCode =
  | 'invalid_number'
  | 'instance_unavailable'
  | 'provider_rejected'
  | 'provider_unavailable'
  | 'rate_limited'
  | 'in_progress'
  | 'receipt_unconfirmed'
  | 'media_invalid';

export interface DeliveryFailure {
  status: number;
  code: DeliveryErrorCode;
  /** Causa temporária: o OPERADOR pode tentar de novo (não é reenvio automático). */
  retryable: boolean;
  /** true SOMENTE quando o POST já saiu e a confirmação falhou: não reenvie cego. */
  ambiguous: boolean;
}

/** Mensagem fixa (pt-BR) por código — nunca inclui dado do provedor/pessoal. */
export const DELIVERY_ERROR_MESSAGES: Record<DeliveryErrorCode, string> = {
  invalid_number: 'Número inválido ou sem WhatsApp.',
  instance_unavailable: 'A conexão do WhatsApp está desconectada. Reconecte a instância e tente de novo.',
  provider_rejected: 'O provedor recusou o envio da mensagem.',
  provider_unavailable: 'O WhatsApp está indisponível no momento. Tente de novo em instantes.',
  rate_limited: 'Muitos envios em pouco tempo. Aguarde e tente de novo.',
  in_progress: 'O envio desta mensagem já está em andamento.',
  receipt_unconfirmed: 'A mensagem pode ter sido entregue, mas não foi possível confirmar. Confira a conversa antes de enviar de novo.',
  media_invalid: 'Não foi possível montar o envio: mídia ou conteúdo do pedido inválido.',
};

export function deliveryFailureBody(failure: DeliveryFailure): Record<string, unknown> {
  return {
    error: DELIVERY_ERROR_MESSAGES[failure.code],
    code: failure.code,
    retryable: failure.retryable,
    ambiguous: failure.ambiguous,
  };
}

/** Resposta de falha de ENTREGA (4xx/409/422/429/502) com o envelope estável. */
export function deliveryFailureResponse(failure: DeliveryFailure, req?: Request): Response {
  return jsonResponse(deliveryFailureBody(failure), failure.status, req);
}

/** Recusa definitiva do provedor para o PEDIDO (não há efeito a reconciliar). */
export const PROMPT_REJECTED_FAILURE: DeliveryFailure = {
  status: 422, code: 'provider_rejected', retryable: false, ambiguous: false,
};
/** Outro worker tem o lease: o envio está em andamento — não reenvie às cegas. */
export const IN_PROGRESS_FAILURE: DeliveryFailure = {
  status: 409, code: 'in_progress', retryable: false, ambiguous: false,
};
/** Limite de envios do próprio Zapp (não é recusa do provedor). */
export const EDGE_RATE_LIMITED_FAILURE: DeliveryFailure = {
  status: 429, code: 'rate_limited', retryable: true, ambiguous: false,
};
/** POST saiu e o recibo não chegou (200 sem id, recibo não gravado, rede/timeout). */
export function unconfirmedReceiptFailure(): DeliveryFailure {
  return { status: 502, code: 'receipt_unconfirmed', retryable: false, ambiguous: true };
}
/** Falha ANTES do POST: a carga do pedido não pôde ser montada. Nada saiu. */
export function preDispatchFailure(): DeliveryFailure {
  return { status: 422, code: 'media_invalid', retryable: false, ambiguous: false };
}

/** Marcas textuais de instância/conexão fora do ar. O corpo do provedor NUNCA é
 *  devolvido; ele só decide o código estável (nada ambíguo: não houve entrega). */
const INSTANCE_DOWN_CUES: readonly string[] = [
  'connection closed', 'not connected', 'disconnected', 'instance closed',
  'instance not found', 'instance token ausente', 'desconectad', 'logged out', 'logout',
];

function providerBodyText(body: unknown): string {
  if (typeof body === 'string') return body.toLowerCase();
  if (body === null || body === undefined) return '';
  try { return JSON.stringify(body).toLowerCase(); } catch { return ''; }
}

/**
 * Traduz a recusa do provedor em código estável. O POST já saiu em TODOS os
 * ramos desta função; `ambiguous` só é true no 5xx (o provedor falhou e a
 * confirmação não veio). Nos 4xx/429 ele recusou de forma definitiva → sem
 * entrega, logo não ambíguo.
 */
export function classifyProviderFailure(status: number, body: unknown): DeliveryFailure {
  if (status === 429) return EDGE_RATE_LIMITED_FAILURE;
  if (status >= 500) {
    return { status: 502, code: 'provider_unavailable', retryable: false, ambiguous: true };
  }
  const text = providerBodyText(body);
  if (INSTANCE_DOWN_CUES.some((cue) => text.includes(cue))) {
    return { status: 409, code: 'instance_unavailable', retryable: true, ambiguous: false };
  }
  const info = providerErrorInfo(status, body);
  if (info.code === 'invalid_number' || info.code === 'number_not_exists') {
    return { status: 422, code: 'invalid_number', retryable: false, ambiguous: false };
  }
  if (info.code === 'auth_failed') {
    return { status: 409, code: 'instance_unavailable', retryable: true, ambiguous: false };
  }
  return PROMPT_REJECTED_FAILURE;
}

// ── Costura de dependências (injetável para teste; produção usa os defaults) ──
// O builder do PostgREST é tipado por fora; o client injetável segue o MESMO
// idioma do resto do repo (efeito-reconcile.ts usa o mesmo `any` controlado).
/* eslint-disable @typescript-eslint/no-explicit-any */
export type DeliveryDbClient = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface MessageDeliveryDeps {
  requireAuth?: (req: Request) => Promise<{ userId: string } | Response>;
  enforceRateLimit?: (
    key: string,
    maxRequests: number,
    windowMs: number,
  ) => Promise<{ allowed: boolean }>;
  createClient?: (
    url: string,
    key: string,
    options: { auth?: { persistSession?: boolean }; global?: { headers?: Record<string, string> } },
  ) => DeliveryDbClient;
  requireEnv?: (name: string) => string;
  evoFetch?: typeof evoFetch;
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

export async function handleMessageDeliveryRequest(
  req: Request,
  deps: MessageDeliveryDeps = {},
): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405, req);

  const authFn = deps.requireAuth ?? requireAuth;
  const rateLimitFn = deps.enforceRateLimit ?? enforceRateLimit;
  const readEnv = deps.requireEnv ?? requireEnv;
  const fetchProvider = deps.evoFetch ?? evoFetch;
  const makeClient = deps.createClient
    ?? ((url: string, key: string, options: { auth?: { persistSession?: boolean }; global?: { headers?: Record<string, string> } }) =>
      createClient(url, key, options as never) as DeliveryDbClient);

  const auth = await authFn(req);
  if (auth instanceof Response) return auth;
  const rate = await rateLimitFn(`message-delivery:${auth.userId}:${getClientIP(req)}`, 60, 60_000);
  if (!rate.allowed) return deliveryFailureResponse(EDGE_RATE_LIMITED_FAILURE, req);

  const messageId = await readMessageId(req);
  if (!messageId) return errorResponse('messageId must be a UUID', 400, req);

  let supabaseUrl: string;
  let serviceRoleKey: string;
  let anonKey: string;
  let evolutionUrl: string;
  let evolutionKey: string;
  try {
    supabaseUrl = readEnv('SUPABASE_URL');
    serviceRoleKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');
    anonKey = readEnv('SUPABASE_ANON_KEY');
    evolutionUrl = readEnv('EVOLUTION_API_URL').replace(/\/+$/, '');
    evolutionKey = readEnv('EVOLUTION_API_KEY');
  } catch {
    return errorResponse('Message delivery is not configured', 503, req);
  }

  const service = makeClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const caller = makeClient(supabaseUrl, anonKey, {
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
    // PD-79: claim vazio também cobre "POST iniciado + lease vencido"; o caso
    // ambíguo desse ramo é resolvido pelo fluxo PD-78/PD-79
    // (fail_outbound_unclaimed), não aqui. Não reenviamos.
    return deliveryFailureResponse(IN_PROGRESS_FAILURE, req);
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
    providerPostAttempted = true;
    const providerResponse = await fetchProvider(evolutionUrl, evolutionKey, outbound.path, outbound.body);
    const raw = await providerResponse.text();
    let providerData: unknown = null;
    try { providerData = raw ? JSON.parse(raw) : null; } catch { /* provider response is invalid */ }

    if (!providerResponse.ok) {
      await failClaim(service, claim);
      const failure = classifyProviderFailure(providerResponse.status, providerData ?? raw);
      // 5xx: o provedor pode ter aceitado antes de falhar → efeito INCERTO.
      // 4xx/429: rejeição definitiva, nada a reconciliar.
      if (failure.ambiguous) {
        await enqueueDeliveryReconciliation(service, claim, null);
      }
      console.error(JSON.stringify({ event: 'message_delivery_provider_error', status: providerResponse.status, code: failure.code }));
      return deliveryFailureResponse(failure, req);
    }

    externalId = extractMessageId(providerData) ?? null;
    if (!externalId || externalId.length > 512) {
      await failClaim(service, claim);
      // 200 sem id: ambíguo (pode ter enviado). Efeito INCERTO.
      await enqueueDeliveryReconciliation(service, claim, null);
      console.error(JSON.stringify({ event: 'message_delivery_missing_provider_id' }));
      return deliveryFailureResponse(unconfirmedReceiptFailure(), req);
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
      return deliveryFailureResponse(unconfirmedReceiptFailure(), req);
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
    // IA-047: exceção depois do POST (rede/timeout/corpo): efeito INCERTO.
    // Enfileira a reconciliação com o id se já o tínhamos; nunca reenvia.
    // Antes do POST (payload/mídia inválidos): nada saiu → não ambíguo.
    const failure = providerPostAttempted ? unconfirmedReceiptFailure() : preDispatchFailure();
    if (providerPostAttempted) {
      await enqueueDeliveryReconciliation(service, claim, externalId);
    }
    console.error(JSON.stringify({ event: 'message_delivery_exception', code: error instanceof Error ? error.message : 'unknown' }));
    return deliveryFailureResponse(failure, req);
  }
}

if (import.meta.main) Deno.serve((req) => handleMessageDeliveryRequest(req));
