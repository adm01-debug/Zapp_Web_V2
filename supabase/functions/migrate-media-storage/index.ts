import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import {
  handleCors,
  jsonResponse,
  errorResponse,
  internalErrorResponse,
  Logger,
  requireEnv,
  enforceRateLimit,
  getClientIP,
} from "../_shared/validation.ts";
import {
  downloadMediaWithEgressPolicy,
  resolveMediaEgressUrl,
  type MediaEgressFetcher,
  type MediaEgressPolicy,
} from "../_shared/media-egress.ts";
import { evoFetch, extractBase64Media } from "../_shared/evolution-send.ts";

/**
 * R2-API-0XX (P0) — migração de mídia do CDN do WhatsApp para o Storage.
 *
 * Defeitos fechados:
 *   1. SSRF por host: o filtro de linhas era `media_url.like.%mmg.whatsapp.net%`
 *      e o download fazia `fetch(cdnUrl)` cru — `https://alvo.interno/?x=mmg.whatsapp.net`
 *      casava o LIKE e era buscado sem validar protocolo, host exato nem redirect.
 *   2. Sem teto de bytes: `arrayBuffer()` lia o corpo inteiro, sem limite.
 *   3. Papel largo: `is_admin_or_supervisor` autorizava supervisor a baixar em lote.
 *   4. Sem trava: dois cliques concorrentes disparavam 100 downloads (`upsert:true`).
 *
 * Regra agora:
 *   - só ADMIN (RPC `is_admin`); supervisor → 403;
 *   - uma execução por janela por admin (contador atômico persistente
 *     `consume_rate_limit` via `enforceRateLimit`) — o segundo clique é recusado
 *     ANTES de qualquer download;
 *   - cada `media_url` é validada antes da rede: https e hostname igual/`*.` de
 *     `mmg.whatsapp.net`/`pps.whatsapp.net`; o que não casar é contado como
 *     ignorado e NUNCA vira requisição;
 *   - download com `redirect: "manual"` revalidando cada salto e teto de 25 MB
 *     (por `Content-Length` e na leitura em fluxo);
 *   - execução (quem rodou + contagens, sem URLs completas) fica em `audit_logs`.
 */

/** Hosts exatos do CDN do WhatsApp (aceita subdomínio com ponto: `*.mmg.whatsapp.net`). */
export const MIGRATION_MEDIA_HOSTS = ["mmg.whatsapp.net", "pps.whatsapp.net"] as const;

/** Teto de bytes por arquivo baixado (o CDN serve vídeo/documento grande). */
export const MIGRATION_MEDIA_MAX_BYTES = 25 * 1024 * 1024;

/** Janela da trava de execução (uma migração por 5 min por admin). */
export const MIGRATION_LOCK_WINDOW_MS = 300_000;

/** Lote por execução (comportamento anterior preservado). */
export const MIGRATION_BATCH_LIMIT = 50;

/**
 * Política de egress FECHADA desta função: sem origem confiável alguma, só os
 * dois hosts do CDN. `trustedOrigins` vazio de propósito — o default do módulo
 * aceitaria `EVOLUTION_API_URL`/`SUPABASE_URL`, que não é mídia do WhatsApp.
 */
export const MIGRATION_EGRESS_POLICY: MediaEgressPolicy = {
  trustedOrigins: [],
  hostSuffixes: [...MIGRATION_MEDIA_HOSTS],
};

export interface MigrateCallerClient {
  auth: {
    getUser: () => PromiseLike<{ data: { user: { id: string } | null } | null; error: unknown }>;
  };
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
}

export type MigrateRateLimiter = (
  key: string,
  maxRequests: number,
  windowMs: number,
) => PromiseLike<{ allowed: boolean; remaining: number; persistent?: boolean }>;

/** Seams de injeção: nada toca rede/banco/env no teste. */
export interface MigrateMediaDeps {
  /** Client service-role, usado só DEPOIS da autorização (lê/escreve/faz upload). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: any;
  /** Client do chamador (anon + JWT): `auth.getUser` + `rpc("is_admin")`. */
  caller?: MigrateCallerClient;
  /** Fetcher do download de mídia (default: `fetch` global com `redirect:"manual"`). */
  fetcher?: MediaEgressFetcher;
  /** Rate limiter persistente (default: `enforceRateLimit`). */
  rateLimiter?: MigrateRateLimiter;
}

export async function handleMigrateMediaStorage(
  req: Request,
  deps: MigrateMediaDeps = {},
): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("migrate-media-storage");

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    // ── Autorização (ANTES de cliente service-role e de qualquer download) ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Authorization header required", 401, req);

    const caller: MigrateCallerClient = deps.caller ?? createClient(
      supabaseUrl,
      requireEnv("SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );

    const { data: userData, error: userError } = await caller.auth.getUser();
    const userId = userData?.user?.id ?? null;
    if (userError || !userId) return errorResponse("Unauthorized", 401, req);

    // Só ADMIN baixa mídia em lote. Supervisor NÃO (era `is_admin_or_supervisor`).
    const { data: isAdmin, error: roleError } = await caller.rpc("is_admin", { _user_id: userId });
    if (roleError) {
      log.error("Role check failed", { error: roleError instanceof Error ? roleError.message : String(roleError) });
      return internalErrorResponse(roleError, req);
    }
    if (isAdmin !== true) {
      log.warn("Non-admin attempted media migration", { userId });
      return errorResponse("Only admins can run media migration", 403, req);
    }

    // ── Trava de execução + limite de uso (atômico, persistente) ──
    // `consume_rate_limit` faz `INSERT ... ON CONFLICT DO UPDATE`: o segundo
    // clique concorrente incrementa o mesmo contador e é recusado aqui, antes
    // de qualquer download. Sem rate limit local (isolate) como fonte de verdade.
    const rateLimiter = deps.rateLimiter ?? enforceRateLimit;
    const lock = await rateLimiter(`migrate-media-storage:run:${userId}`, 1, MIGRATION_LOCK_WINDOW_MS);
    if (!lock.allowed) {
      log.warn("Media migration already running", { userId });
      return errorResponse(
        "Uma migração já está em execução. Aguarde alguns minutos e tente novamente.",
        429,
        req,
      );
    }

    const supabase = deps.supabase ?? createClient(supabaseUrl, serviceRoleKey);
    const evolutionUrl = Deno.env.get("EVOLUTION_API_URL");
    const evolutionKey = Deno.env.get("EVOLUTION_API_KEY");

    const { data: connections } = await supabase
      .from("whatsapp_connections")
      .select("id, instance_id")
      .eq("status", "connected")
      .limit(10);

    const instanceMap = new Map<string, string>();
    for (const conn of connections || []) {
      if (conn.instance_id) instanceMap.set(conn.id, conn.instance_id);
    }

    // Prefiltro por PREFIXO do host canônico (antes era `%host%`, que casava
    // query string de qualquer host). A validação real é por linha, abaixo.
    const { data: messages, error } = await supabase
      .from("messages")
      .select("id, media_url, message_type, external_id, contact_id, whatsapp_connection_id")
      .not("media_url", "is", null)
      .or("media_url.like.https://mmg.whatsapp.net/%,media_url.like.https://pps.whatsapp.net/%")
      .order("created_at", { ascending: false })
      .limit(MIGRATION_BATCH_LIMIT);

    if (error) {
      log.error("Query error", { error: error.message });
      log.done(500);
      return errorResponse("Falha ao consultar mídias para migração", 500, req);
    }

    const batch = messages || [];
    let migrated = 0;
    let failed = 0;
    let ignored = 0;
    const details: string[] = [];

    for (const msg of batch) {
      // Valida o destino ANTES de qualquer requisição. O que não casar conta
      // como ignorado e nunca vira fetch.
      if (!resolveMediaEgressUrl(msg.media_url, MIGRATION_EGRESS_POLICY)) {
        ignored++;
        details.push(`⛔ ${msg.message_type} ${String(msg.id).substring(0, 8)} (host não permitido)`);
        continue;
      }

      try {
        let permanentUrl = await downloadAndUpload(
          supabase, msg.media_url, msg.message_type, msg.id, log, deps.fetcher,
        );

        if (!permanentUrl && evolutionUrl && evolutionKey && msg.external_id) {
          log.info("CDN failed, trying API fallback", { messageId: msg.id });
          const connId = msg.whatsapp_connection_id;
          const instance = connId ? instanceMap.get(connId) : null;
          const instancesToTry = instance ? [instance] : Array.from(instanceMap.values());

          for (const inst of instancesToTry) {
            permanentUrl = await getBase64Fallback(
              supabase, evolutionUrl, evolutionKey, inst,
              msg.external_id, msg.message_type, msg.id, log,
            );
            if (permanentUrl) break;
          }
        }

        if (permanentUrl) {
          await supabase.from("messages").update({ media_url: permanentUrl }).eq("id", msg.id);
          migrated++;
          details.push(`✅ ${msg.message_type} ${String(msg.id).substring(0, 8)}`);
        } else {
          failed++;
          details.push(`❌ ${msg.message_type} ${String(msg.id).substring(0, 8)} (irrecuperável)`);
        }
      } catch (err) {
        log.error(`Migration error for ${msg.id}`, { error: err instanceof Error ? err.message : String(err) });
        failed++;
        details.push(`❌ ${msg.message_type} ${String(msg.id).substring(0, 8)} (erro)`);
      }

      await new Promise((r) => setTimeout(r, 300));
    }

    // Auditoria: quem rodou e o resultado. Só contagens — sem URL completa.
    const { error: auditError } = await supabase.from("audit_logs").insert({
      user_id: userId,
      action: "media_migration",
      entity_type: "messages",
      details: { processed: batch.length, migrated, failed, ignored },
      ip_address: getClientIP(req),
    });
    if (auditError) {
      // A gravação em `messages` já persistiu; devolver 500 convidaria a um
      // re-run que a própria trava recusaria. Registra o alerta e segue.
      log.warn("Falha ao registrar auditoria da migração", {
        error: auditError instanceof Error ? auditError.message : String(auditError),
      });
    }

    log.done(200, { migrated, failed, ignored });
    return jsonResponse({
      success: true,
      processed: batch.length,
      migrated,
      failed,
      ignored,
      details,
      message: migrated > 0
        ? `${migrated} mídias migradas para Storage permanente.`
        : batch.length === 0
          ? "Todas as mídias já estão no Storage permanente."
          : `Nenhuma mídia pôde ser recuperada. ${failed} arquivos com URLs expiradas, ${ignored} com host não permitido.`,
    }, 200, req);
  } catch (err: unknown) {
    log.error("Migration error", { error: err instanceof Error ? err.message : String(err) });
    log.done(500);
    return internalErrorResponse(err, req);
  }
}

async function downloadAndUpload(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  cdnUrl: string,
  messageType: string,
  messageId: string,
  log: Logger,
  fetcher?: MediaEgressFetcher,
): Promise<string | null> {
  const download = await downloadMediaWithEgressPolicy(cdnUrl, {
    policy: MIGRATION_EGRESS_POLICY,
    fetcher,
    maxBytes: MIGRATION_MEDIA_MAX_BYTES,
    timeoutMs: 15000,
    logTag: "MIGRATE",
  });
  if (!download) return null;

  if (download.bytes.length < 100) {
    log.warn(`File too small for ${messageId}`, { size: download.bytes.length });
    return null;
  }

  const contentType = download.contentType || "application/octet-stream";
  const ext = detectExtension(contentType, messageType);
  return await uploadToStorage(supabase, download.bytes, contentType, messageType, messageId, ext);
}

async function getBase64Fallback(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    const baseUrl = evolutionUrl.replace(/\/+$/, "");
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

    const raw = media.base64.includes(",") ? media.base64.split(",")[1] : media.base64;
    const binaryStr = atob(raw);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    if (bytes.length < 100) return null;

    const mimeType = media.mimetype || "application/octet-stream";
    const ext = detectExtension(mimeType, messageType);
    return await uploadToStorage(supabase, bytes, mimeType, messageType, messageId, ext);
  } catch (err) {
    log.error(`getBase64 error for ${messageId}`, { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

function detectExtension(contentType: string, messageType: string): string {
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("mp4")) return "mp4";
  if (contentType.includes("ogg") || contentType.includes("opus")) return "ogg";
  if (contentType.includes("mpeg")) return "mp3";
  if (contentType.includes("pdf")) return "pdf";

  const defaults: Record<string, string> = { image: "jpg", video: "mp4", audio: "ogg", document: "bin" };
  return defaults[messageType] || "bin";
}

async function uploadToStorage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  bytes: Uint8Array,
  contentType: string,
  messageType: string,
  messageId: string,
  ext: string,
): Promise<string | null> {
  const safeId = messageId.replace(/[^a-zA-Z0-9]/g, "");
  const fileName = `${messageType}/${safeId}.${ext}`;
  const bucket = messageType === "audio" ? "audio-messages" : "whatsapp-media";

  const { error: uploadErr } = await supabase.storage
    .from(bucket)
    .upload(fileName, bytes, { contentType, cacheControl: "31536000", upsert: true });

  if (uploadErr) {
    console.error(`[MIGRATE] Upload error:`, uploadErr);
    return null;
  }

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
  return urlData.publicUrl;
}

if (import.meta.main) {
  Deno.serve((req) => handleMigrateMediaStorage(req));
}
