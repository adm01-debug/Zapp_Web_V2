import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, handleCors, Logger } from "../_shared/validation.ts";
import { evoFetch, extractBase64Media } from "../_shared/evolution-send.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL")!;
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function isValidAudioBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const isOgg = bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53;
  const isMp3Id3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33;
  const isMp3Sync = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  const isWebm = bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  const isWav = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
  return isOgg || isMp3Id3 || isMp3Sync || isWebm || isWav;
}

// v2: lookup por key.id no store da API. Evolution GO exige o waE2E.Message
// completo (URL/mediaKey) — lookup só por id não tem equivalente (GO_GAPS),
// então na GO este utilitário só recupera o que ainda estiver acessível e
// reporta o resto como falha, sem quebrar.
async function getMediaBase64(instanceName: string, messageId: string): Promise<string | null> {
  try {
    const resp = await evoFetch(EVOLUTION_API_URL.replace(/\/+$/, ""), EVOLUTION_API_KEY,
      `/chat/getBase64FromMediaMessage/${instanceName}`,
      { message: { key: { id: messageId } }, convertToMp4: false });
    if (!resp.ok) return null;
    const data = await resp.json();
    const media = extractBase64Media(data);
    if (!media) return null;
    return media.base64.includes(",") ? media.base64.split(",")[1] : media.base64;
  } catch (err) {
    console.error(`Failed to fetch media for ${messageId}:`, err);
    return null;
  }
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const headers = { ...getCorsHeaders(req), "Content-Type": "application/json" };
  const log = new Logger("recover-corrupted-audios");

  try {
    const { batch_size = 20, offset = 0, dry_run = false } = await req.json().catch(() => ({}));

    const { data: messages, error: fetchErr } = await supabase
      .from("messages")
      .select("id, external_id, media_url, whatsapp_connection_id")
      .eq("message_type", "audio")
      .eq("sender", "contact")
      .not("external_id", "is", null)
      .not("media_url", "is", null)
      .like("media_url", "%audio-messages%")
      .order("created_at", { ascending: true })
      .range(offset, offset + batch_size - 1);

    if (fetchErr) throw fetchErr;

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ done: true, message: "No more audios to process", offset }), { headers });
    }

    const connId = messages[0].whatsapp_connection_id;
    const { data: conn } = await supabase
      .from("whatsapp_connections")
      .select("instance_id")
      .eq("id", connId)
      .single();
    const instanceName = conn?.instance_id || Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'PRINCIPAL';

    if (dry_run) {
      return new Response(JSON.stringify({
        dry_run: true, batch_size: messages.length, offset, instance: instanceName,
        sample_ids: messages.slice(0, 3).map((m) => m.external_id),
      }), { headers });
    }

    const results = { recovered: 0, failed: 0, skipped: 0, errors: [] as string[] };

    for (const msg of messages) {
      try {
        const existingUrl = msg.media_url;
        if (existingUrl) {
          try {
            const checkResp = await fetch(existingUrl);
            if (checkResp.ok) {
              const existingBytes = new Uint8Array(await checkResp.arrayBuffer());
              if (isValidAudioBytes(existingBytes)) { results.skipped++; continue; }
            }
          } catch { /* proceed to re-download */ }
        }

        const base64 = await getMediaBase64(instanceName, msg.external_id!);
        if (!base64) { results.failed++; results.errors.push(`${msg.external_id}: no base64 from API`); continue; }

        const binaryStr = atob(base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

        if (!isValidAudioBytes(bytes)) { results.failed++; results.errors.push(`${msg.external_id}: invalid audio bytes`); continue; }

        let contentType = "audio/ogg";
        let ext = "ogg";
        if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) { contentType = "audio/mpeg"; ext = "mp3"; }
        else if (bytes[0] === 0x1a && bytes[1] === 0x45) { contentType = "audio/webm"; ext = "webm"; }

        const storagePath = `audio/${msg.external_id}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from("audio-messages").upload(storagePath, bytes, { contentType, upsert: true });

        if (uploadErr) { results.failed++; results.errors.push(`${msg.external_id}: upload failed - ${uploadErr.message}`); continue; }

        const newUrl = `${SUPABASE_URL}/storage/v1/object/public/audio-messages/${storagePath}`;
        await supabase.from("messages").update({ media_url: newUrl }).eq("id", msg.id);
        results.recovered++;
      } catch (err) {
        results.failed++;
        results.errors.push(`${msg.external_id}: ${err instanceof Error ? err.message : "unknown error"}`);
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    log.done(200, { recovered: results.recovered, failed: results.failed });

    return new Response(JSON.stringify({
      ...results, batch_size: messages.length, offset, next_offset: offset + batch_size,
      errors: results.errors.slice(0, 10),
    }), { headers });
  } catch (err) {
    log.error("Error", { error: err instanceof Error ? err.message : String(err) });
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers });
  }
});
