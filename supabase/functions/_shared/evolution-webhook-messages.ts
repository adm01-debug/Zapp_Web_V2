// Message-specific handlers for evolution-webhook: incoming, outgoing, sticker, transcription
import { evoFetch, extractBase64Media } from './evolution-send.ts';

import {
  isRecord, normalizePhone, resolveEventJid,
  getConnectionByInstance, getContactByPhone, fetchProfilePicFromApi, persistProfilePicture,
  generatePhoneVariants,
} from "./evolution-helpers.ts";
import { persistMediaToStorage, persistMediaViaApi, persistBase64Media, parseMessageContent } from "./evolution-media.ts";

// Resolve a mídia na ordem mais barata: base64 do próprio webhook (Evolution GO
// com WEBHOOKFILES=true; v2 com webhookBase64) → URL direta (CDN/MinIO) →
// download via API. Retorna a URL permanente no Storage ou null.
// deno-lint-ignore no-explicit-any
async function persistIncomingMedia(
  supabase: any, instance: string, data: Record<string, unknown>,
  messageType: string, msgId: string, parsedUrl: string | null,
): Promise<string | null> {
  const message = data.message as Record<string, unknown> | undefined;
  const webhookB64 = (data.base64 as string) || (message?.base64 as string);
  if (typeof webhookB64 === 'string' && webhookB64) {
    const fromB64 = await persistBase64Media(supabase, webhookB64, '', messageType, msgId);
    if (fromB64) return fromB64;
  }
  const directUrl = parsedUrl || (data.mediaUrl as string) || (message?.mediaUrl as string) || null;
  if (directUrl && directUrl.startsWith('http')) {
    const fromUrl = await persistMediaToStorage(supabase, directUrl, messageType, msgId);
    if (fromUrl) return fromUrl;
  }
  return await persistMediaViaApi(supabase, instance, data, messageType, msgId);
}

const URL_REGEX = /https?:\/\/[^\s<>"'`]+/i;

// Fire-and-forget OG enrichment for received messages.
// deno-lint-ignore no-explicit-any
async function enrichIncomingLinkPreview(
  supabase: any, messageId: string, content: string | null | undefined,
  supabaseUrl: string, supabaseServiceKey: string,
): Promise<void> {
  try {
    if (!content) return;
    const match = content.match(URL_REGEX);
    if (!match) return;
    const url = match[0].replace(/[).,;!?]+$/, '');
    const resp = await fetch(`${supabaseUrl}/functions/v1/fetch-link-preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseServiceKey}`,
        apikey: supabaseServiceKey,
      },
      body: JSON.stringify({ url }),
    });
    if (!resp.ok) { await resp.text().catch(() => ''); return; }
    const json = await resp.json().catch(() => null) as { preview?: unknown } | null;
    if (!json?.preview) return;
    await supabase.from('messages').update({ link_preview: json.preview }).eq('id', messageId);
  } catch (err) {
    console.error('[INCOMING] link_preview enrichment failed:', err);
  }
}

// deno-lint-ignore no-explicit-any
export async function handleOutgoingWhatsAppMessage(
  supabase: any, instance: string, data: Record<string, unknown>,
  key: { remoteJid?: string; remoteJidAlt?: string; participant?: string; participantAlt?: string; fromMe: boolean; id: string },
) {
  const externalId = key.id;
  const { data: existingMessage } = await supabase.from('messages').select('id').eq('external_id', externalId).maybeSingle();
  if (existingMessage) return;

  const payloadKey = isRecord(data.key) ? data.key : null;
  const bestJid = resolveEventJid(key, payloadKey, data);
  const phone = normalizePhone(bestJid ?? undefined);
  if (!phone || bestJid?.includes('@g.us')) {
    console.log(`[FROM_ME] Ignored message ${externalId}: unresolved recipient`, { bestJid });
    return;
  }

  const connection = await getConnectionByInstance(supabase, instance);
  if (!connection) return;

  const contact = await getContactByPhone(supabase, phone, connection.id);
  if (!contact) return;

  const message = data.message as Record<string, unknown> | undefined;
  const parsed = parseMessageContent(message, data);
  if (parsed.messageType === 'reaction') return;
  if (!parsed.content && parsed.messageType === 'text') return;

  let { mediaUrl } = parsed;
  if (['image', 'video', 'audio', 'document'].includes(parsed.messageType)) {
    const msgId = key.id.replace(/[^a-zA-Z0-9]/g, '');
    const permanentUrl = await persistIncomingMedia(supabase, instance, data, parsed.messageType, msgId, mediaUrl);
    if (permanentUrl) mediaUrl = permanentUrl;
  }

  const messageCreatedAt = (data.messageTimestamp as number)
    ? new Date((data.messageTimestamp as number) * 1000).toISOString() : new Date().toISOString();

  const recentCutoff = new Date(Date.now() - 60_000).toISOString();
  const { data: pendingMessage } = await supabase.from('messages').select('id')
    .eq('contact_id', contact.id).eq('sender', 'agent').eq('message_type', parsed.messageType)
    .is('external_id', null).gte('created_at', recentCutoff)
    .order('created_at', { ascending: true }).limit(1).maybeSingle();

  if (pendingMessage?.id) {
    await supabase.from('messages').update({ status: 'sent', external_id: externalId, status_updated_at: new Date().toISOString() }).eq('id', pendingMessage.id);
    return;
  }

  const { error: msgError } = await supabase.from('messages').insert({
    contact_id: contact.id, whatsapp_connection_id: connection.id, content: parsed.content,
    message_type: parsed.messageType, media_url: mediaUrl, sender: 'agent', external_id: externalId,
    status: 'sent', created_at: messageCreatedAt, agent_id: contact.assigned_to || null,
  }).select('id').single();

  if (msgError) { console.error('[FROM_ME] Error inserting outgoing message:', msgError); return; }
  await supabase.from('contacts').update({ updated_at: new Date().toISOString() }).eq('id', contact.id);
}

// deno-lint-ignore no-explicit-any
export async function handleIncomingMessage(
  supabase: any, instance: string, data: Record<string, unknown>,
  key: { remoteJid?: string; remoteJidAlt?: string; participant?: string; participantAlt?: string; fromMe: boolean; id: string },
  supabaseUrl: string, supabaseServiceKey: string
) {
  const payloadKey = isRecord(data.key) ? data.key : null;
  const bestJid = resolveEventJid(key, payloadKey, data);
  const phone = normalizePhone(bestJid ?? undefined);
  if (!phone || bestJid?.includes('@g.us')) {
    console.log(`[INCOMING] Ignored message ${key.id}: unresolved sender`, { bestJid });
    return;
  }
  const message = data.message as Record<string, unknown> | undefined;
  const parsed = parseMessageContent(message, data);
  if (parsed.messageType === 'reaction') return;

  let { mediaUrl } = parsed;
  const { content, messageType } = parsed;

  // Texto sem conteúdo e sem mídia (undecryptable/protocol residual) viraria
  // linha fantasma vazia — mesmo guard que o caminho de saída já tem.
  if (!content && messageType === 'text' && !mediaUrl) {
    console.log(`[INCOMING] Ignored empty message ${key.id}`);
    return;
  }

  if (messageType === 'sticker') {
    mediaUrl = await handleStickerMedia(supabase, instance, data, message, key);
  }

  if (['image', 'video', 'audio', 'document'].includes(messageType)) {
    const msgId = key.id || `${Date.now()}`;
    const permanentUrl = await persistIncomingMedia(supabase, instance, data, messageType, msgId, mediaUrl);
    if (permanentUrl) mediaUrl = permanentUrl;
  }

  const connection = await getConnectionByInstance(supabase, instance);
  if (!connection) return;

  let contact = await getContactByPhone(supabase, phone, connection.id);

  if (!contact) {
    let avatarUrl: string | null = null;
    const picUrl = await fetchProfilePicFromApi(instance, phone);
    if (picUrl) avatarUrl = await persistProfilePicture(supabase, phone, picUrl);
    const { data: newContact, error: insertErr } = await supabase.from('contacts').insert({
      phone, name: (data.pushName as string) || phone, avatar_url: avatarUrl, whatsapp_connection_id: connection.id,
    }).select('id, avatar_url, assigned_to, name').single();
    if (insertErr && insertErr.code === '23505') {
      // Duplicate phone — contact exists with another connection; fetch with 9th digit variants
      const phonesVariants = generatePhoneVariants(phone);
      const { data: existing } = await supabase.from('contacts').select('id, avatar_url, assigned_to, name')
        .in('phone', phonesVariants).limit(1).maybeSingle();
      if (existing) {
        contact = existing;
        await supabase.from('contacts').update({ whatsapp_connection_id: connection.id, updated_at: new Date().toISOString() }).eq('id', existing.id);
        console.log(`[CONTACT] Relinked existing contact ${existing.id} to connection ${connection.id}`);
      }
    } else {
      contact = newContact;
    }
  } else if (!contact.avatar_url || contact.avatar_url.includes('pps.whatsapp.net')) {
    const picUrl = await fetchProfilePicFromApi(instance, phone);
    if (picUrl) {
      const avatarUrl = await persistProfilePicture(supabase, phone, picUrl);
      if (avatarUrl) await supabase.from('contacts').update({ avatar_url: avatarUrl }).eq('id', contact.id);
    }
  }

  if (!contact) return;

  const messageCreatedAt = (data.messageTimestamp as number)
    ? new Date((data.messageTimestamp as number) * 1000).toISOString() : new Date().toISOString();

  const { data: existingMessage } = await supabase.from('messages')
    .select('id, status, content').eq('external_id', key.id).maybeSingle();

  if (existingMessage?.id) {
    const preservedStatus = existingMessage.status && existingMessage.status !== 'received' ? existingMessage.status : 'received';
    const preservedContent = existingMessage.status === 'deleted' ? (existingMessage.content || '[Mensagem apagada]') : content;
    await supabase.from('messages').update({
      contact_id: contact.id, whatsapp_connection_id: connection.id, content: preservedContent,
      message_type: messageType, media_url: mediaUrl, sender: 'contact', created_at: messageCreatedAt, status: preservedStatus,
    }).eq('id', existingMessage.id);
    if (messageType === 'audio' && mediaUrl) await handleAudioTranscription(supabase, contact.id, existingMessage.id, mediaUrl, supabaseUrl, supabaseServiceKey);
    return;
  }

  const { data: insertedMessage, error: msgError } = await supabase.from('messages').insert({
    contact_id: contact.id, whatsapp_connection_id: connection.id, content,
    message_type: messageType, media_url: mediaUrl, sender: 'contact', external_id: key.id,
    status: 'received', created_at: messageCreatedAt,
  }).select('id').single();

  if (msgError) {
    console.error('Error inserting message:', { msgError, externalId: key.id, bestJid, phone, messageType, content });
    return;
  }
  if (messageType === 'audio' && mediaUrl && insertedMessage) await handleAudioTranscription(supabase, contact.id, insertedMessage.id, mediaUrl, supabaseUrl, supabaseServiceKey);
  if (messageType === 'text' && insertedMessage?.id && content) {
    void enrichIncomingLinkPreview(supabase, insertedMessage.id, content, supabaseUrl, supabaseServiceKey);
  }
}

// deno-lint-ignore no-explicit-any
export async function handleStickerMedia(
  supabase: any, instance: string, data: Record<string, unknown>,
  message: Record<string, unknown> | undefined, key: { id: string }
): Promise<string | null> {
  let mediaUrl: string | null = null;

  const uploadBase64Sticker = async (base64Data: string): Promise<string | null> => {
    try {
      const cleanB64 = base64Data.replace(/^data:[^;]+;base64,/, '');
      const binaryStr = atob(cleanB64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      if (bytes.length < 50) return null;
      const fileName = `sticker_${Date.now()}_${key.id.replace(/[^a-zA-Z0-9]/g, '')}.webp`;
      const { error: uploadErr } = await supabase.storage.from('whatsapp-media').upload(`stickers/${fileName}`, bytes, { contentType: 'image/webp', cacheControl: '31536000' });
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from('whatsapp-media').getPublicUrl(`stickers/${fileName}`);
        return urlData.publicUrl;
      }
      return null;
    } catch { return null; }
  };

  const b64Direct = (data.base64 as string) || (message?.base64 as string) ||
    ((message?.stickerMessage as Record<string, unknown>)?.base64 as string);
  if (b64Direct) mediaUrl = await uploadBase64Sticker(b64Direct);

  if (!mediaUrl) {
    const stickerNode = message?.stickerMessage as Record<string, unknown> | undefined;
    const directMediaUrl = (data.mediaUrl as string) || stickerNode?.mediaUrl as string || stickerNode?.URL as string || stickerNode?.url as string;
    if (directMediaUrl && directMediaUrl.startsWith('http')) {
      try {
        const resp = await fetch(directMediaUrl, { signal: AbortSignal.timeout(10000) });
        if (resp.ok) {
          const arrayBuf = await resp.arrayBuffer();
          const bytes = new Uint8Array(arrayBuf);
          if (bytes.length > 100) {
            const fileName = `sticker_${Date.now()}_${key.id.replace(/[^a-zA-Z0-9]/g, '')}.webp`;
            const { error: uploadErr } = await supabase.storage.from('whatsapp-media').upload(`stickers/${fileName}`, bytes, { contentType: 'image/webp', cacheControl: '31536000' });
            if (!uploadErr) { const { data: urlData } = supabase.storage.from('whatsapp-media').getPublicUrl(`stickers/${fileName}`); mediaUrl = urlData.publicUrl; }
          }
        }
      } catch (dlErr) { console.error('[STICKER] mediaUrl download error:', dlErr); }
    }
  }

  if (!mediaUrl) {
    try {
      const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
      const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
      if (evolutionUrl && evolutionKey) {
        const resp = await evoFetch(evolutionUrl.replace(/\/+$/, ''), evolutionKey,
          `/chat/getBase64FromMediaMessage/${instance}`,
          { message: { key: data.key, message: data.message }, convertToMp4: false },
          (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(15000) }));
        if (resp.ok) {
          const result = await resp.json();
          const media = extractBase64Media(result);
          if (media) mediaUrl = await uploadBase64Sticker(media.base64);
        }
      }
    } catch (apiErr) { console.error('[STICKER] API fetch error:', apiErr); }
  }

  if (mediaUrl) {
    try {
      const { data: existing } = await supabase.from('stickers').select('id').eq('image_url', mediaUrl).maybeSingle();
      if (!existing) {
        let category = 'recebidas';
        try {
          const classifyResp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/classify-sticker`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
            body: JSON.stringify({ image_url: mediaUrl }), signal: AbortSignal.timeout(20000),
          });
          if (classifyResp.ok) { const classifyResult = await classifyResp.json(); category = classifyResult.category || 'recebidas'; }
        } catch { /* classification failed, use default */ }
        await supabase.from('stickers').insert({ name: `Recebida ${new Date().toLocaleDateString('pt-BR')}`, image_url: mediaUrl, category, is_favorite: false, use_count: 0 });
      }
    } catch { /* save error */ }
  }

  return mediaUrl;
}

// deno-lint-ignore no-explicit-any
export async function handleAudioTranscription(supabase: any, _contactId: string, messageId: string, mediaUrl: string, supabaseUrl: string, supabaseServiceKey: string) {
  const { data: globalSetting } = await supabase.from('global_settings')
    .select('value').eq('key', 'auto_transcription_enabled').maybeSingle();
  if (globalSetting?.value === 'false') return;

  await supabase.from('messages').update({ transcription_status: 'processing' }).eq('id', messageId);

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/ai-transcribe-audio`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({ audioUrl: mediaUrl, messageId }),
    });

    if (response.ok) {
      const result = await response.json();
      await supabase.from('messages').update({ transcription: result.text, transcription_status: 'completed' }).eq('id', messageId);
    } else {
      await supabase.from('messages').update({ transcription_status: 'failed' }).eq('id', messageId);
    }
  } catch {
    await supabase.from('messages').update({ transcription_status: 'failed' }).eq('id', messageId);
  }
}
