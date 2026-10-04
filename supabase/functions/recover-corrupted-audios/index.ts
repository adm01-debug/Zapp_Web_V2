import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import {
  getCorsHeaders,
  handleCors,
  errorResponse,
  internalErrorResponse,
  Logger,
} from "../_shared/validation.ts";
import { evoFetch, extractBase64Media } from "../_shared/evolution-send.ts";

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
async function getMediaBase64(
  evolutionUrl: string,
  evolutionKey: string,
  instanceName: string,
  messageId: string,
): Promise<string | null> {
  try {
    const resp = await evoFetch(evolutionUrl.replace(/\/+$/, ""), evolutionKey,
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

/**
 * Dependências injetáveis para o teste RED/GREEN. O handler de produção resolve
 * tudo do ambiente; o teste injeta um client Supabase mockado para provar que a
 * chamada sem identidade e a de agente comum NÃO chegam a tocar em scan/Storage.
 */
interface RecoverDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: any;
  supabaseUrl?: string;
  serviceKey?: string;
  evolutionUrl?: string;
  evolutionKey?: string;
}

/**
 * Recupera áudios corrompidos (P1 R2-API-022 — autorização).
 *
 * Contrato de autorização (decisão t_d8505da9): o preflight CORS continua livre
 * (`handleCors` acima), mas toda execução exige JWT de admin/supervisor ANTES de
 * parsear `batch_size`/`offset`/`dry_run`, antes do scan e antes de qualquer
 * download/upload/update. Sem identidade → 401; usuário comum (agente) → 403.
 * Não há caminho automático/cron para esta rotina, então o guard é admin-only.
 */
export async function handleRecoverCorruptedAudios(
  req: Request,
  deps?: RecoverDeps,
): Promise<Response> {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const headers = { ...getCorsHeaders(req), "Content-Type": "application/json" };
  const log = new Logger("recover-corrupted-audios");

  const supabaseUrl = deps?.supabaseUrl ?? Deno.env.get("SUPABASE_URL")!;
  const serviceKey = deps?.serviceKey ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const evolutionUrl = deps?.evolutionUrl ?? Deno.env.get("EVOLUTION_API_URL")!;
  const evolutionKey = deps?.evolutionKey ?? Deno.env.get("EVOLUTION_API_KEY")!;

  const supabase = deps?.supabase ?? createClient(supabaseUrl, serviceKey);

  try {
    // ── Autorização (antes de qualquer payload/scan/efeito) ──
    // Execução manual exige JWT válido de admin/supervisor — não agente comum.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Missing Authorization bearer token", 401, req);
    }
    const token = authHeader.slice(7);

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return errorResponse("Unauthorized", 401, req);
    }

    const { data: isAdmin, error: roleError } = await supabase.rpc(
      "is_admin_or_supervisor",
      { _user_id: user.id },
    );
    if (roleError || isAdmin !== true) {
      return errorResponse("Only admins can run audio recovery", 403, req);
    }

    // Só agora o payload do chamador é parseado (a porta acima falha fechada).
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
    // E20 (plano multi-conexão): sem instance_id não é seguro adivinhar a
    // PRINCIPAL — buscaria a mídia na instância errada em vez de simplesmente
    // falhar o lote (capturado pelo catch de baixo, mesmo padrão do resto do arquivo).
    if (!conn?.instance_id) {
      throw new Error(`Conexão ${connId} sem instance_id — não é seguro recuperar áudio sem saber a instância de origem.`);
    }
    const instanceName = conn.instance_id;

    if (dry_run) {
      return new Response(JSON.stringify({
        dry_run: true, batch_size: messages.length, offset, instance: instanceName,
        sample_ids: messages.slice(0, 3).map((m: { external_id: string | null }) => m.external_id),
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

        const base64 = await getMediaBase64(evolutionUrl, evolutionKey, instanceName, msg.external_id!);
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

        const newUrl = `${supabaseUrl}/storage/v1/object/public/audio-messages/${storagePath}`;
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
    return internalErrorResponse(err, req);
  }
}

// O Deno.serve fica sob import.meta.main: importar este módulo num teste não
// pode subir um servidor na porta 8000 (mesmo padrão de get-call-recording).
if (import.meta.main) {
  Deno.serve((req) => handleRecoverCorruptedAudios(req));
}
