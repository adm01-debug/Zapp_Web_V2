import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { getCorsHeaders, handleCors, checkRateLimit, getClientIP } from "../_shared/validation.ts";
import {
  isRecord, normalizeEventName, toEventRecords,
  handleReactionEvent,
  type WebhookPayload,
} from "../_shared/evolution-helpers.ts";
import { parseMessageContent } from "../_shared/evolution-media.ts";
import { EvolutionWebhookEnvelopeV1Schema, EvolutionWebhookEnvelopeV2Schema, validationErrorResponse } from "../_shared/schemas.ts";
import { parseVersioned } from "../_shared/contracts.ts";
import { isGoPayload, translateGoPayload } from "../_shared/evolution-go-adapter.ts";
import {
  handleConnectionUpdate, handleSendMessage, handleMessagesUpdate, handleMessagesDelete,
  handleContactsUpsert, handlePresenceUpdate, handleChatsUpdate,
  handleLabelsEdit, handleLabelsAssociation, handleCallEvent,
  handleChatsDelete, handleApplicationStartup, handleMessagesSet,
  handleContactsSet, handleChatsSet, handleMessagesEdited,
} from "../_shared/evolution-webhook-handlers.ts";
import {
  handleIncomingMessage, handleOutgoingWhatsAppMessage,
} from "../_shared/evolution-webhook-messages.ts";

// â”€â”€ E5: AutenticaÃ§Ã£o via apikey (log-only enquanto nÃ£o hÃ¡ enforce)
// Evolution GO envia Global API Key no header 'apikey' de cada POST.
// EVOLUTION_WEBHOOK_SECRET deve ser configurado nos secrets do destino.
// Log-only = nunca bloqueia; registra discrepÃ¢ncia para monitoramento.
function checkWebhookAuth(req: Request): { ok: boolean; reason?: string } {
  const secret = Deno.env.get('EVOLUTION_WEBHOOK_SECRET') || Deno.env.get('EVOLUTION_API_KEY');
  if (!secret) return { ok: true }; // sem secret configurado: bypass (modo inicial)
  const header = req.headers.get('apikey') || req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ','');
  if (!header) return { ok: false, reason: 'no_apikey_header' };
  if (header !== secret) return { ok: false, reason: 'apikey_mismatch' };
  return { ok: true };
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req);

  // E10: Rate limit â€” max 600 req/min por IP (Evolution GO pode ser verbose)
  const ip = getClientIP(req);
  const rl = checkRateLimit(`evolution-webhook:${ip}`, 600, 60_000);
  if (!rl.allowed) {
    console.warn(`[RATE_LIMIT] evolution-webhook blocked ip=${ip} count=${rl.count}`);
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers: getCorsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  // E5: Auth check log-only â€” nunca bloqueia; enforce ativado na etapa E7 (GATE)
  const auth = checkWebhookAuth(req);
  if (!auth.ok) {
    console.warn('[EVOLUTION_AUTH] Unauthorized webhook:', auth.reason, 'ip:', req.headers.get('x-forwarded-for') || 'unknown');
    // LOG-ONLY: nÃ£o retorna 401 ainda (aguarda 48h sem falso positivo â†’ E7)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // E2 (contratos): JSON malformado â†’ 422 estruturado antes de qualquer parse
    const rawBody: unknown = await req.json().catch(() => null);
    if (rawBody === null || typeof rawBody !== 'object') {
      return validationErrorResponse([{ path: '(root)', message: 'Body must be a valid JSON object', code: 'invalid_type' }], req);
    }

    let payload: WebhookPayload = rawBody as WebhookPayload;
    if (isGoPayload(payload)) payload = translateGoPayload(payload) as unknown as WebhookPayload;

    // E2 (contratos): valida envelope v1/v2 (event + instance obrigatÃ³rios)
    const contract = parseVersioned(req, payload, {
      v1: EvolutionWebhookEnvelopeV1Schema,
      v2: EvolutionWebhookEnvelopeV2Schema,
    });
    if (!contract.ok) return contract.response;
    payload = contract.data as WebhookPayload;

    const event = normalizeEventName(payload.event);
    const instance = payload.instance;
    const data = payload.data ?? {};
    const baseData = isRecord(data) ? data : {};

    console.log('Evolution webhook received:', payload.event, '->', event, instance);

    if (event === 'connection.update') await handleConnectionUpdate(supabase, instance, baseData);

    if (event === 'qrcode.updated') {
      const qrCode = (baseData.qrcode as Record<string, string>)?.base64;
      if (qrCode) {
        await supabase.from('whatsapp_connections')
          .update({ qr_code: qrCode, status: 'qr_pending', updated_at: new Date().toISOString() })
          .eq('instance_id', instance);
      } else if (!isRecord(baseData.qrcode)) {
        await supabase.from('whatsapp_connections')
          .update({ qr_code: null, status: 'disconnected', updated_at: new Date().toISOString() })
          .eq('instance_id', instance);
      }
    }

    if (event === 'messages.upsert') {
      const entries = toEventRecords(data, ['messages']);
      console.log(`[MSG_UPSERT] Processing ${entries.length} entries for instance ${instance}`);
      for (const entry of entries) {
        const keySource = isRecord(entry.key) ? entry.key : isRecord(baseData.key) ? baseData.key : null;
        const externalId =
          (typeof entry.id === 'string' && entry.id) ||
          (typeof baseData.id === 'string' && baseData.id) ||
          (typeof keySource?.id === 'string' && keySource.id) ||
          null;

        if (!externalId) {
          console.log('[MSG_UPSERT] Ignored: missing message id', { instance, entryKeys: Object.keys(entry) });
          continue;
        }

        const key = {
          id: externalId,
          fromMe: Boolean(
            (typeof entry.fromMe === 'boolean' ? entry.fromMe : undefined) ??
            (typeof baseData.fromMe === 'boolean' ? baseData.fromMe : undefined) ??
            (typeof keySource?.fromMe === 'boolean' ? keySource.fromMe : undefined) ??
            false
          ),
          remoteJid:
            (typeof entry.remoteJid === 'string' ? entry.remoteJid : undefined) ??
            (typeof baseData.remoteJid === 'string' ? baseData.remoteJid : undefined) ??
            (typeof keySource?.remoteJid === 'string' ? keySource.remoteJid : undefined),
          remoteJidAlt:
            (typeof entry.remoteJidAlt === 'string' ? entry.remoteJidAlt : undefined) ??
            (typeof baseData.remoteJidAlt === 'string' ? baseData.remoteJidAlt : undefined) ??
            (typeof keySource?.remoteJidAlt === 'string' ? keySource.remoteJidAlt : undefined),
          participant:
            (typeof entry.participant === 'string' ? entry.participant : undefined) ??
            (typeof baseData.participant === 'string' ? baseData.participant : undefined) ??
            (typeof keySource?.participant === 'string' ? keySource.participant : undefined),
          participantAlt:
            (typeof entry.participantAlt === 'string' ? entry.participantAlt : undefined) ??
            (typeof baseData.participantAlt =2w7G&–ærrò&6TFFç'F–6—çDÇB¢VæFVf–æVB’óğ¢‡G—Vöb¶W•6÷W&6Sòç'F–6—çDÇBÓÓÒw7G&–ærrò¶W•6÷W&6Rç'F–6—çDÇB¢VæFVf–æVB’À¢Ó° ¢6öç6öÆRæÆör†´Õ4uõU4U%EÒ–CÒG¶W‡FW&æÄ–GÒg&öÔÖSÒG¶¶W’æg&öÔÖWÒ&VÖ÷FT¦–CÒG¶¶W’ç&VÖ÷FT¦–GÖ“° ¢6öç7B×6rÒ†VçG'’æÖW76vRÇÂ&6TFFæÖW76vR’2&V6÷&CÇ7G&–ærÂVæ¶æ÷vãâÂVæFVf–æVC°¢–b†×6sòç&V7F–öäÖW76vR’°¢6öç6öÆRæÆör†´Õ4uõU4U%EÒ&ö6W76–ær&V7F–öâf÷"G¶W‡FW&æÄ–GÖ“°¢v—B†æFÆU&V7F–öäWfVçB‡7W&6RÂ×6rç&V7F–öäÖW76vR2&V6÷&CÇ7G&–ærÂVæ¶æ÷vãâÂ¶W’æg&öÔÖR“°¢6öçF–çVS°¢Ğ ¢–b‚¶W’æg&öÔÖR’°¢v—B†æFÆT–æ6öÖ–ætÖW76vR‡7W&6RÂ–ç7Fæ6RÂ²ââæ&6TFFÂââæVçG'’ÒÂ¶W’Â7W&6UW&ÂÂ7W&6U6W'f–6T¶W’“°¢ÒVÇ6R°¢v—B†æFÆT÷WFvö–æuv†G4ÖW76vR‡7W&6RÂ–ç7Fæ6RÂ²ââæ&6TFFÂââæVçG'’ÒÂ¶W’“°¢Ğ¢Ğ¢Ğ ¢–b†WfVçBÓÓÒw6VæBæÖW76vRr’v—B†æFÆU6VæDÖW76vR‡7W&6RÂ–ç7Fæ6RÂFFÂ&6TFF“°¢–b†WfVçBÓÓÒvÖW76vW2çWFFRr’v—B†æFÆTÖW76vW5WFFR‡7W&6RÂ–ç7Fæ6RÂFFÂ&6TFF“°¢–b†WfVçBÓÓÒvÖW76vW2æFVÆWFRr’v—B†æFÆTÖW76vW4FVÆWFR‡7W&6RÂ–ç7Fæ6RÂFFÂ&6TFF“°¢–b†WfVçBÓÓÒv6öçF7G2çW6W'BrÇÂWfVçBÓÓÒv6öçF7G2çWFFRr’v—B†æFÆT6öçF7G5W6W'B‡7W&6RÂ–ç7Fæ6RÂFF“°¢–b†WfVçBÓÓÒw&W6Væ6RçWFFRr’v—B†æFÆU&W6Væ6UWFFR‡7W&6RÂ–ç7Fæ6RÂFF“°¢–b†WfVçBÓÓÒv6†G2çW6W'BrÇÂWfVçBÓÓÒv6†G2çWFFRr’v—B†æFÆT6†G5WFFR‡7W&6RÂ–ç7Fæ6RÂFF“° ¢–b†WfVçBÓÓÒvw&÷W2çW6W'BrÇÂWfVçBÓÓÒvw&÷WçWFFRr’°¢6öç7Bw&÷WFFÒ—5&V6÷&B†FF’òFF¢·Ó°¢6öç7Bw&÷W¦–BÒw&÷WFFæ–B27G&–æs°¢6öç7B7V&¦V7BÒw&÷WFFç7V&¦V7B27G&–æs°¢–b†w&÷W¦–Bbb7V&¦V7B’6öç6öÆRæÆör†w&÷WWFFS¢G¶w&÷W¦–GÒ(	BG·7V&¦V7GÖ“°¢Ğ ¢–b†WfVçBÓÓÒvw&÷Wç'F–6—çG2çWFFRrÇÂWfVçBÓÓÒvw&÷W×'F–6—çG2çWFFRr’°¢6öç7B'F–6—çDFFÒ—5&V6÷&B†FF’òFF¢·Ó°¢6öç6öÆRæÆör†w&÷WG·'F–6—çDFFæ–GÒ'F–6—çG2G·'F–6—çDFFæ7F–öçÓ¢G²‡'F–6—çDFFç'F–6—çG227G&–æuµÒ“òæ¦ö–â‚rÂr—Ö“°¢Ğ ¢–b†WfVçBÓÓÒvÆ&VÇ2æVF—Br’v—B†æFÆTÆ&VÇ4VF—B‡7W&6RÂ–ç7Fæ6RÂFF“°¢–b†WfVçBÓÓÒvÆ&VÇ2æ76ö6–F–öâr’v—B†æFÆTÆ&VÇ476ö6–F–öâ‡7W&6RÂ–ç7Fæ6RÂFF“°¢–b†WfVçBÓÓÒv6ÆÂr’v—B†æFÆT6ÆÄWfVçB‡7W&6RÂ–ç7Fæ6RÂFF“°¢–b†WfVçBÓÓÒv6†G2æFVÆWFRr’v—B†æFÆT6†G4FVÆWFR‡7W&6RÂ–ç7Fæ6RÂFF“°¢–b†WfVçBÓÓÒvÆ–6F–öâç7F'GWr’v—B†æFÆTÆ–6F–öå7F'GW‡7W&6RÂ–ç7Fæ6R“°¢–b†WfVçBÓÓÒvÖW76vW2ç6WBr’v—B†æFÆTÖW76vW56WB‡7W&6RÂ–ç7Fæ6RÂFF“°¢–b†WfVçBÓÓÒv6öçF7G2ç6WBr’v—B†æFÆT6öçF7G56WB‡7W&6RÂ–ç7Fæ6RÂFF“°¢–b†WfVçBÓÓÒv6†G2ç6WBr’v—B†æFÆT6†G56WB‡7W&6RÂ–ç7Fæ6RÂFF“°¢–b†WfVçBÓÓÒvÖW76vW2æVF—FVBrÇÂWfVçBÓÓÒvÖW76vW2æVF—Br’v—B†æFÆTÖW76vW4VF—FVB‡7W&6RÂFFÂ&6TFF“° ¢&WGW&âæWr&W7öç6R„¥4ôâç7G&–æv–g’‡²7V66W73¢G'VRÒ’Â°¢7FGW3¢#Â†VFW'3¢²ââæ6÷'4†VFW'2Ât6öçFVçBÕG—Rs¢vÆ–6F–öâö§6öârÒÀ¢Ò“°¢Ò6F6‚†W'&÷#¢Væ¶æ÷vâ’°¢6öç6öÆRæW'&÷"‚tWföÇWF–öâvV&†öö²W'&÷#¢rÂW'&÷"“°¢6öç7BÖW76vRÒW'&÷"–ç7Fæ6VöbW'&÷"òW'&÷"æÖW76vR¢uVæ¶æ÷vâW'&÷"s°¢&WGW&âæWr&W7öç6R„¥4ôâç7G&–æv–g’‡²W'&÷#¢ÖW76vRÒ’Â°¢7FGW3¢SÂ†VFW'3¢²ââæ6÷'4†VFW'2Ât6öçFVçBÕG—Rs¢vÆ–6F–öâö§6öârÒÀ¢Ò“°¢Ğ§Ò“° 