import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse, errorResponse, Logger, requireEnv } from "../_shared/validation.ts";
import { evoFetch, extractBase64Media } from "../_shared/evolution-send.ts";

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const log = new Logger("migrate-media-storage");

  try {
    const supabaseUrl = requireEnv('SUPABASE_URL');
    const supabaseKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

    // Ferramenta administrativa: exige admin, nao apenas usuario logado.
    // verify_jwt=true so garante que ha um JWT valido; sem este guard,
    // qualquer atendente dispararia migracao de midia em lote.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorResponse('Authorization header required', 401, req);
    const supabaseUser = createClient(supabaseUrl, requireEnv('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) return errorResponse('Unauthorized', 401, req);
    const { data: isAdmin } = await supabaseUser.rpc('is_admin_or_supervisor', { _user_id: user.id });
    if (!isAdmin) return errorResponse('Only admins can run media migration', 403, req);

    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all active WhatsApp connections with instance IDs
    const { data: connections } = await supabase
      .from('whatsapp_connections')
      .select('id, instance_id')
      .eq('status', 'connected')
      .limit(10);

    const instanceMap = new Map<string, string>();
    for (const conn of connections || []) {
      if (conn.instance_id) instanceMap.set(conn.id, conn.instance_id);
    }

    // Find all messages with WhatsApp CDN URLs
    const { data: messages, error } = await supabase
      .from('messages')
      .select('id, media_url, message_type, external_id, contact_id, whatsapp_connection_id')
      .not('media_url', 'is', null)
      .or('media_url.like.%mmg.whatsapp.net%,media_url.like.%pps.whatsapp.net%')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      log.error('Query error', { error: error.message });
      return await migrateSimple(supabase, req, log);
    }

    if (!messages?.length) {
      log.done(200, { migrated: 0 });
      return jsonResponse({
        success: true, processed: 0, migrated: 0,
        message: 'Todas as mídias já estão no Storage permanente.'
      }, 200, req);
    }

    log.info(`Found ${messages.length} messages with CDN URLs to migrate`);

    let migrated = 0;
    let failed = 0;
    const details: string[] = [];

    for (const msg of messages) {
      try {
        let permanentUrl = await downloadAndUpload(supabase, msg.media_url, msg.message_type, msg.id, log);

        if (!permanentUrl && evolutionUrl && evolutionKey && msg.external_id) {
          log.info("CDN failed, trying API fallback", { messageId: msg.id });
          const connId = msg.whatsapp_connection_id;
          const instance = connId ? instanceMap.get(connId) : null;
          const instancesToTry = instance ? [instance] : Array.from(instanceMap.values());

          for (const inst of instancesToTry) {
            permanentUrl = await getBase64Fallback(
              supabase, evolutionUrl, evolutionKey, inst,
              msg.external_id, msg.message_type, msg.id, log
            );
            if (permanentUrl) break;
          }
        }

        if (permanentUrl) {
          await supabase.from('messages').update({ media_url: permanentUrl }).eq('id', msg.id);
          migrated++;
          details.push(`✅ ${msg.message_type} ${msg.id.substring(0, 8)}`);
        } else {
          failed++;
          details.push(`❌ ${msg.message_type} ${msg.id.substring(0, 8)} (irrecuperável)`);
        }
      } catch (err) {
        log.error(`Migration error for ${msg.id}`, { error: err instanceof Error ? err.message : String(err) });
        failed++;
        details.push(`❌ ${msg.message_type} ${msg.id.substring(0, 8)} (erro)`);
      }

      await new Promise(r => setTimeout(r, 300));
    }

    log.done(200, { migrated, failed });
    return jsonResponse({
      success: true,
      processed: messages.length,
      migrated,
      failed,
      details,
      message: migrated > 0
        ? `${migrated} mídias migradas para Storage permanente.`
        : `Nenhuma mídia pôde ser recuperada. ${failed} arquivos com URLs expiradas.`,
    }, 200, req);
  } catch (err: unknown) {
    log.error('Migration error', { error: err instanceof Error ? err.message : String(err) });
    log.done(500);
    return errorResponse(err instanceof Error ? err.message : 'Unknown error', 500, req);
  }
});

async function downloadAndUpload(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  cdnUrl: string,
  messageType: string,
  messageId: string,
  log: Logger,
): Promise<string | null> {
  try {
    const resp = await fetch(cdnUrl, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) {
      log.warn(`Download failed for ${messageId}`, { status: resp.status });
      return null;
    }

    const arrayBuf = await resp.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);
    if (bytes.length < 100) {
      log.warn(`File too small for ${messageId}`, { size: bytes.length });
      return null;
    }

    const contentType = resp.headers.get('content-type') || 'application/octet-stream';
    const ext = detectExtension(contentType, messageType);
    return await uploadToStorage(supabase, bytes, contentType, messageType, messageId, ext);
  } catch (err) {
    log.error(`Download error for ${messageId}`, { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

async function getBase64Fallback(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  evolutionUrl: string,
  evolutionKey: string,
  instance: string,
  externalId: string,
  messageType: string,
  messageId: string,
  log: Logger,
): Promise<string | null> {
  try {
    // v2: lookup por key.id. Evolution GO exige o waE2E.Message completo —
    // sem ele o GO recusa e a mídia é reportada como irrecuperável (GO_GAPS).
    const baseUrl = evolutionUrl.replace(/\/+$/, '');
    const resp = await evoFetch(baseUrl, evolutionKey,
      `/chat/getBase64FromMediaMessage/${instance}`,
      { message: { key: { id: externalId } }, convertToMp4: false },
      (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(15000) }));

    if (!resp.ok) {
      log.warn(`getBase64 API error for ${messageId}`, { status: resp.status });
      return null;
    }

    const result = await resp.json();
    const media = extractBase64Media(result);
    if (!media) return null;

    const raw = media.base64.includes(',') ? media.base64.split(',')[1] : media.base64;
    const binaryStr = atob(raw);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    if (bytes.length < 100) return null;

    const mimeType = media.mimetype || 'application/octet-stream';
    const ext = detectExtension(mimeType, messageType);
    return await uploadToStorage(supabase, bytes, mimeType, messageType, messageId, ext);
  } catch (err) {
    log.error(`getBase64 error for ${messageId}`, { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

function detectExtension(contentType: string, messageType: string): string {
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('mp4')) return 'mp4';
  if (contentType.includes('ogg') || contentType.includes('opus')) return 'ogg';
  if (contentType.includes('mpeg')) return 'mp3';
  if (contentType.includes('pdf')) return 'pdf';

  const defaults: Record<string, string> = { image: 'jpg', video: 'mp4', audio: 'ogg', document: 'bin' };
  return defaults[messageType] || 'bin';
}

async function uploadToStorage(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  bytes: Uint8Array,
  contentType: string,
  messageType: string,
  messageId: string,
  ext: string,
): Promise<string | null> {
  const safeId = messageId.replace(/[^a-zA-Z0-9]/g, '');
  const fileName = `${messageType}/${safeId}_${Date.now()}.${ext}`;
  const bucket = messageType === 'audio' ? 'audio-messages' : 'whatsapp-media';

  const { error: uploadErr } = await supabase.storage
    .from(bucket)
    .upload(fileName, bytes, { contentType, cacheControl: '31536000', upsert: true });

  if (uploadErr) {
    console.error(`[MIGRATE] Upload error:`, uploadErr);
    return null;
  }

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
  return urlData.publicUrl;
}

async function migrateSimple(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  req: Request,
  log: Logger,
): Promise<Response> {
  const { data: messages, error } = await supabase
    .from('messages')
    .select('id, media_url, message_type, external_id')
    .not('media_url', 'is', null)
    .or('media_url.like.%mmg.whatsapp.net%,media_url.like.%pps.whatsapp.net%')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  if (!messages?.length) {
    return jsonResponse({ success: true, processed: 0, migrated: 0, message: 'Nada a migrar.' }, 200, req);
  }

  let migrated = 0;
  let failed = 0;

  for (const msg of messages) {
    const url = await downloadAndUpload(supabase, msg.media_url, msg.message_type, msg.id, log);
    if (url) {
      await supabase.from('messages').update({ media_url: url }).eq('id', msg.id);
      migrated++;
    } else {
      failed++;
    }
    await new Promise(r => setTimeout(r, 300));
  }

  log.done(200, { migrated, failed });
  return jsonResponse({ success: true, processed: messages.length, migrated, failed }, 200, req);
}
