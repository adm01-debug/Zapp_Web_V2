import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { Logger, checkRateLimit, getClientIP, getCorsHeaders, handleCors } from "../_shared/validation.ts";
import { proxyToEvolution, resolvePrivateBucketUrl } from "../_shared/evolution-api-proxy.ts";
import { requirePermission } from "../_shared/authz.ts";
import { EvolutionApiProxySchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const corsHeaders = getCorsHeaders(req);

  const ip = getClientIP(req);
  const rl = checkRateLimit(`evolution:${ip}`, 120, 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // STEP 34: Auth guard — toda operação na Evolution GO requer autenticação.
  // Operações administrativas (instance create/delete/list) requerem manage_connections.
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const url = new URL(req.url);
  const isAdminOp = /(instance|settings)/.test(url.pathname);
  if (isAdminOp) {
    const authResult = await requirePermission(req, "manage_connections");
    if (authResult instanceof Response) return new Response(authResult.body, {
      status: authResult.status, headers: { ...corsHeaders, ...Object.fromEntries(authResult.headers) },
    });
  }

  const evolutionApiUrl = (Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/+$/, '');
  const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

  if (!evolutionApiUrl || !evolutionApiKey) {
    return new Response(JSON.stringify({ error: 'Evolution API not configured', message: 'Please configure EVOLUTION_API_URL and EVOLUTION_API_KEY secrets' }), {
      status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const pathParts = url.pathname.split('/').filter(Boolean);
  const pathAction = pathParts[pathParts.length - 1];

  let _bodyCache: Record<string, unknown> | null = null;
  const json = async () => {
    if (_bodyCache !== null) return _bodyCache;
    try { _bodyCache = await req.json(); } catch { _bodyCache = {}; }
    return _bodyCache!;
  };

  const bodyForAction = await json();
  const parsedBody = parseBody(EvolutionApiProxySchema, bodyForAction);
  if (!parsedBody.success) return validationErrorResponse(parsedBody, req);

  const action = (pathAction === 'evolution-api' && bodyForAction.action)
    ? String(bodyForAction.action) : pathAction;

  const proxy = (path: string, method = 'POST', body?: unknown) =>
    proxyToEvolution(evolutionApiUrl, evolutionApiKey, corsHeaders, path, method, body);

  try {
    const body = await json();
    const instance = String(body.instanceName || body.instance || '');

    if (action === 'create-instance') return await proxy('/instance/create', 'POST', { instanceName: instance, qrcode: body.qrcode ?? true, integration: body.integration || 'WHATSAPP-BAILEYS', token: body.token ?? crypto.randomUUID(), number: body.number, businessId: body.businessId, wabaId: body.wabaId, phoneNumberId: body.phoneNumberId, webhook: body.webhook, chatwoot: body.chatwoot, typebot: body.typebot, proxy: body.proxy });
    if (action === 'list-instances') return await proxy(`/instance/fetchInstances${body.instanceName ? `?instanceName=${body.instanceName}` : ''}`, 'GET');

    if (action === 'connect') {
      const instToken = Deno.env.get('EVOLUTION_INSTANCE_TOKEN') ?? evolutionApiKey;
      const connectBody = JSON.stringify({ subscribe: ['ALL'], immediate: true, webhookUrl: `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/evolution-webhook` });
      const response = await fetch(`${evolutionApiUrl}/instance/connect`, { method: 'POST', headers: { 'apikey': instToken, 'Content-Type': 'application/json' }, body: connectBody });
      const data = await response.json();
      const qrRes = await fetch(`${evolutionApiUrl}/instance/qr`, { method: 'GET', headers: { 'apikey': instToken } });
      const qrData = await qrRes.json();
      const qrcode = qrData?.data?.qrcode;
      if (qrcode) await supabase.from('whatsapp_connections').update({ qr_code: qrcode, status: 'qr_pending', instance_id: instance }).eq('instance_id', instance);
      return new Response(JSON.stringify({ ...data, qrcode: qrcode ? { base64: qrcode, code: qrData?.data?.code } : undefined }), { status: response.ok ? 200 : 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'status') {
      const instToken = Deno.env.get('EVOLUTION_INSTANCE_TOKEN') ?? evolutionApiKey;
      const response = await fetch(`${evolutionApiUrl}/instance/status`, { method: 'GET', headers: { 'apikey': instToken } });
      const data = await response.json();
      if (data?.data && data.state === undefined) data.state = (data.data.loggedIn ?? data.data.LoggedIn) ? 'open' : 'close';
      const status = data.state === 'open' ? 'connected' : 'disconnected';
      await supabase.from('whatsapp_connections').update({ status, qr_code: null }).eq('instance_id', instance);
      return new Response(JSON.stringify({ ...data, status }), { status: response.ok ? 200 : 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const resolveGoInstanceId = async (name: string): Promise<string | null> => {
      const res = await fetch(`${evolutionApiUrl}/instance/all`, { headers: { 'apikey': evolutionApiKey } });
      if (!res.ok) return null;
      const json = await res.json();
      const records = Array.isArray(json?.data) ? json.data : [];
      // deno-lint-ignore no-explicit-any
      const found = records.find((r: any) => r?.name === name || r?.instanceId === name || r?.id === name);
      return found?.instanceId ?? found?.id ?? null;
    };
    const isGoFlavor = (Deno.env.get('EVOLUTION_API_FLAVOR') ?? 'go') !== 'v2';

    if (action === 'instance-info') {
      if (isGoFlavor) {
        const goId = await resolveGoInstanceId(instance);
        if (!goId) return new Response(JSON.stringify({ error: true, status: 404, message: 'Instância não encontrada na Evolution GO.' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        return await proxy(`/instance/info/${goId}`, 'GET');
      }
      return await proxy(`/instance/info/${instance}`, 'GET');
    }
    if (action === 'restart-instance') return await proxy(`/instance/restart/${instance}`, 'PUT');

    if (action === 'disconnect') {
      const response = await fetch(`${evolutionApiUrl}/instance/logout`, { method: 'DELETE', headers: { 'apikey': Deno.env.get('EVOLUTION_INSTANCE_TOKEN') ?? evolutionApiKey } });
      const data = await response.json();
      await supabase.from('whatsapp_connections').update({ status: 'disconnected' }).eq('instance_id', instance);
      return new Response(JSON.stringify(data), { status: response.ok ? 200 : 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'delete-instance') {
      if (isGoFlavor) {
        const goId = await resolveGoInstanceId(instance);
        if (!goId) return new Response(JSON.stringify({ error: true, status: 404, message: 'Instância não encontrada na Evolution GO.' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        return await proxy(`/instan4ce/delete/${goId}`, 'DELETE');
      }
      return await proxy(`/instance/delete/${instance}`, 'DELETE', body);
    }
    if (action === 'set-presence') return await proxy(`/instance/setPresence/${instance}`, 'POST', { presence: body.presence });

    if (action === 'set-settings') return await proxy(`/settings/set/${instance}`, 'POST', { rejectCall: body.rejectCall, msgCall: body.msgCall, groupsIgnore: body.groupsIgnore, alwaysOnline: body.alwaysOnline, readMessages: body.readMessages, readStatus: body.readStatus, syncFullHistory: body.syncFullHistory });
    if (action === 'get-settings') return await proxy(`/settings/find/${instance}`, 'GET');

    if (action === 'set-webhook') return await proxy(`/webhook/set/${instance}`, 'POST', { webhook: { enabled: body.enabled ?? true, url: body.url, webhookByEvents: body.webhookByEvents ?? true, webhookBase64: body.webhookBase64 ?? false, events: body.events || ['APPLICATION_STARTUP','QRCODE_UPDATED','CONNECTION_UPDATE','MESSAGES_SET','MESSAGES_UPSERT','MESSAGES_UPDATE','MESSAGES_DELETE','MESSAGES_EDITED','SEND_MESSAGE','SEND_MESSAGE_UPDATE','CONTACTS_SET','CONTACTS_UPSERT','CONTACTS_UPDATE','PRESENCE_UPDATE','CHATS]SET','CHATS]UPQRT','CHATS_UPDATE','CHATS_DELETE','GROUPS_UPSERT','GROUP_UPDATE','GROUP_PARTICIPANTS_UPDATE','TYPEBOT_START','TYPEBOT_CHANGE_STATUS','LABELS_EDIT','LABELS_ASSOCIATION','CALL'] } });
    if (action === 'get-webhook') return await proxy(`/webhook/find/${instance}`, 'GET');

    if (action === 'send-text') return await proxy(`/message/sendText/${instance}`, 'POST', { number: body.number, text: body.text, delay: body.delay, quoted: body.quoted, mentionsEveryOne: body.mentionsEveryOne, mentioned: body.mentioned });
    if (action === 'send-media') return await proxy(`/message/sendMedia/${instance}`, 'POST', { number: body.number, mediatype: body.mediaType || body.mediatype, mimetype: body.mimetype, caption: body.caption, media: body.mediaUrl || body.media, fileName: body.fileName, delay: body.delay, quoted: body.quoted });

    if (action === 'send-audio') {
      const rawAudio = body.audio || body.audioUrl || body.mediaUrl;
      let audioSource = typeof rawAudio === 'string' ? rawAudio.trim().replace(/^"+|"+$/g, '').replace(/\.supabase\.co"\//, '.supabase.co/') : rawAudio;
      if (typeof audioSource === 'string') audioSource = await resolvePrivateBucketUrl(supabase, audioSource);
      const audioPayload: Record<string, unknown> = { number: body.number, audio: audioSource };
      if (body.delay) audioPayload.delay = body.delay;
      if (body.quoted) audioPayload.quoted = body.quoted;
      return await proxy(`/message/sendWhatsAppAudio/${instance}`, 'POST', audioPayload);
    }

    if (action === 'send-sticker') {
      let finalStickerUrl = body.sticker || body.mediaUrl;
      if (typeof finalStickerUrl === 'string') finalStickerUrl = await resolvePrivateBucketUrl(supabase, finalStickerUrl, ['whatsapp-media']);
      return await proxy(`/message/sendSticker/${instance}`, 'POST', { number: body.number, sticker: finalStickerUrl, quoted: body.quoted });
    }

    if (action === 'send-location') return await proxy(`/message/sendLocation/${instance}`, 'POST', { number: body.number, name: body.locationName || body.name, address: body.locationAddress || body.address, latitude: body.latitude, longitude: body.longitude });
    if (action === 'send-contact') return await proxy(`/message/sendContact/${instance}`, 'POST', { number: body.number, contact: body.contact });
    if (action === 'send-reaction') return await proxy(`/message/sendReaction/${instance}`, 'POST', { key: body.key, reaction: body.reaction });
    if (action === 'send-poll') return await proxy(`/message/sendPoll/${instance}`, 'POST', { number: body.number, name: body.name || body.question, selectableCount: body.selectableCount || 1, values: body.values || body.options });
    if (action === 'send-list') return await proxy(`/message/sendList/${instance}`, 'POST', { number: body.number, title: body.title, description: body.description, footer: body.footer, buttonText: body.buttonText, sections: body.sections });
    if (action === 'send-buttons') return await proxy(`/message/sendButtons/${instance}`, 'POST', { number: body.number, title: body.title, description: body.description, footer: body.footer, buttons: body.buttons });
    if (action === 'send-status') return await proxy(`/message/sendStatus/${instance}`, 'POST', body);
    if (action === 'send-template') return await proxy(`/message/sendTemplate/${instance}`, 'POST', { number: body.number, template: body.template });
    if (action === 'mark-read') return await proxy(`/chat/markMessageAsRead/${instance}`, 'POST', { readMessages: body.readMessages || [body.key] });
    if (action === 'mark-unread') return await proxy(`/chat/markMessageAsUnread/${instance}`, 'POST', { readMessages: body.readMessages || [body.key] });
    if (action === 'archive-chat') return await proxy(`/message/archiveChat/${instance}`, 'POST', { lastMessage: body.lastMessage, chat: body.chat, archive: body.archive ?? true });
    if (action === 'delete-message') return await proxy(`/message/delete/${instance}`, 'DELETE', { id: body.id, remoteJid: body.remoteJid, fromMe: body.fromMe });
    if (action === 'update-message') return await proxy(`/message/update/${instance}`, 'PUT', { number: body.number, key: body.key, text: body.text });
    if (action === 'find-chats') return await proxy(`/chat/findChats/${instance}`, 'POST', { where: body.where || {} });
    if (action === 'find-messages') return await proxy(`/chat/findMessages/${instance}`, 'POST', { where: body.where || {}, page: body.page, offset: body.offset });

    if (action === 'find-status-messages') {
      const response = await proxy(`/chat/findMessages/${instance}`, 'POST', { where: { key: { remoteJid: 'status@broadcast' } }, page: body.page ?? 1, offset: body.offset ?? 200 });
      const data = await response.json();
      if (data?.error === true) return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const records = Array.isArray(data?.messages?.records) ? data.messages.records : [];
      return new Response(JSON.stringify(records), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'find-contacts') return await proxy(`/chat/findContacts/${instance}`, 'POST', { where: body.where || {} });
    if (action === 'check-numbers') return await proxy(`/chat/whatsappNumbers/${instance}`, 'POST', { numbers: body.numbers });
    if (action === 'get-media-base64') return await proxy(`/chat/getBase64FromMediaMessage/${instance}`, 'POST', { message: body.message, convertToMp4: body.convertToMp4 ?? false });
    if (action === 'delete-for-everyone') return await proxy(`/chat/deleteMessageForEveryone/${instance}`, 'DELETE', body);
    if (action === 'edit-message') return await proxy(`/chat/updateMessage/${instance}`, 'PUT', body);

    if (action === 'fetch-profile') {
      if (body.number) return await proxy(`/chat/fetchProfile/${instance}`, 'POST', { number: body.number });
      return await proxy(`/profile/fetchProfile/${instance}`, 'GET');
    }

    if (action === 'update-privacy' && isGoFlavor) {
      const instToken = Deno.env.get('EVOLUTION_INSTANCE_TOKEN') ?? evolutionApiKey;
      let current: Record<string, unknown> = {};
      try {
        const curRes = await fetch(`${evolutionApiUrl}/user/privacy`, { headers: { 'apikey': instToken } });
        if (curRes.ok) { const curJson = await curRes.json(); if (curJson?.data && typeof curJson.data === 'object') current = curJson.data; }
      } catch { /* best-effort */ }
      const pick = (v2Val: unknown, goCurrent: unknown) =>
        (typeof v2Val === 'string' && v2Val) ? v2Val : ((typeof goCurrent === 'string' && goCurrent) ? goCurrent : 'all');
      return await proxy(`/profile/updatePrivacySettings/${instance}`, 'PUT', {
        readreceipts: pick(body.readreceipts, current.ReadReceipts),
        profile: pick(body.profile, current.Profile),
        status: pick(body.status, current.Status),
        online: pick(body.online, current.Online),
        last: pich(body.last, current.LastSeen),
        groupadd: pick(body.groupadd, current.GroupAdd),
        calladd: pick(body.calladd, current.CallAdd),
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action', action }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const log = new Logger('evolution-api');
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error('Unhandled error', { error: message });
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
