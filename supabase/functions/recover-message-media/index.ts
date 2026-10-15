// recover-message-media — recuperação sob demanda de UMA mensagem de mídia cuja
// URL do CDN do WhatsApp venceu (cartões t_4ebeb0c4 e t_84d1a2fc).
//
// Contexto: o webhook (_shared/evolution-webhook-messages.ts) só troca a URL do
// CDN pela URL permanente do bucket quando `persistIncomingMedia` dá certo. Se
// falhar (reconexão, mídia grande, webhook sem base64), a mensagem fica com a
// URL do CDN, que expira em horas, e nada a recupera. Esta função é o pedido
// pontual do atendente: recebe `message_id`, rebaixa a mídia da Evolution pela
// chave da mensagem e grava a URL permanente.
//
// Contrato de resposta (sempre um corpo com `status`):
//   { status: 'ok',           media_url }  — recuperou agora
//   { status: 'ja_permanente', media_url }  — já estava no Storage; nada baixado
//   { status: 'indisponivel', motivo, tentar_apos? }
//                                            — não recuperável AGORA. O `motivo`
//                                              diz como quem consome (MR2) deve
//                                              reagir:
//        motivo: 'em_espera'         — limite de 10 min por mensagem ainda
//                                       ativo; `tentar_apos` traz os SEGUNDOS
//                                       que faltam. Botão desabilitado até lá.
//        motivo: 'falha_temporaria'  — rede/timeout/5xx/rede do WhatsApp fora
//                                       ou erro de gravação; vale tentar de
//                                       novo. Botão habilitado.
//        motivo: 'expirada'          — a mídia venceu de vez (404/410 ou mídia
//                                       sem chave/conexão de origem). Não há o
//                                       que recuperar. SEM botão.
//   { status: 'negado' }                   — sem autorização/acesso, payload
//                                            inválido ou tipo recusado
// Nenhum conteúdo de mensagem, telefone, token ou URL vencem em log; o `motivo`
// é uma palavra fechada do contrato, sem PII.
//
// Segurança: exige JWT (requireAuth, com a política de rede) e confere o acesso
// à MENSAGEM pela MESMA regra de RLS de `messages` — um client com o JWT do
// chamador tenta ler a linha; se a RLS esconde, é `negado`. O service_role só é
// usado DEPOIS dessa checagem (ler sob a RLS pode esconder a linha, mas não
// esconde campos; por isso releio com o service_role já autorizado a gravar).
//
// Idempotência/limite: se `media_url` já é caminho do Storage, devolve
// `ja_permanente` sem baixar. No máximo 1 tentativa por mensagem a cada 10 min,
// carimbadas em `messages.media_meta` (coluna de metadados JÁ existente, sem
// PII) — o carimbo é gravado ANTES da chamada externa, então a chamada não repete
// mesmo se a Evolution falhar.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import {
  handleCors,
  jsonResponse,
  internalErrorResponse,
  isValidUUID,
  Logger,
  requireAuth,
  createAuthedClient,
  requireEnv,
} from "../_shared/validation.ts";
import { evoFetch, extractBase64Media } from "../_shared/evolution-send.ts";
import { persistBase64Media } from "../_shared/evolution-media.ts";
import type { EvolutionDbClient } from "../_shared/evolution-types.ts";

// ─── Regras puras (testáveis sem rede/banco) ─────────────────────────────────

export const RECOVERY_COOLDOWN_MS = 10 * 60 * 1000;

/** Tipos de mídia que a recuperação atende (allowlist — o resto é recusado). */
export const RECOVERABLE_MEDIA_TYPES = ["image", "video", "audio", "document"] as const;

/**
 * Tipos que NUNCA tentam recuperar: recusa imediata, sem nenhuma chamada
 * externa. A allowlist acima já barra qualquer tipo fora dela; esta lista nomeia
 * os casos conhecidos (inclusive os que carregam mídia no payload, como `ptv` e
 * `viewOnce`, e os que não são mídia de arquivo) para documentar e testar.
 */
export const NON_RECOVERABLE_MESSAGE_TYPES = [
  "ptv",
  "viewOnce",
  "viewOnceMessage",
  "viewOnceMessageV2",
  "vcard",
  "contact",
  "location",
  "liveLocation",
  "reaction",
  "poll",
  "pollUpdate",
  "sticker",
  "ephemeral",
] as const;

/** Chave do carimbo de tentativa dentro de `messages.media_meta` (sem PII). */
export const ATTEMPT_META_KEY = "media_recovery_attempted_at";

export type RecoveryStatus = "ok" | "ja_permanente" | "indisponivel" | "negado";

/** Por que não foi possível recuperar agora (palavra fechada do contrato). */
export type RecoveryMotive = "em_espera" | "falha_temporaria" | "expirada";

export interface RecoveryRow {
  id: string;
  contact_id: string | null;
  message_type: string;
  external_id: string | null;
  whatsapp_connection_id: string | null;
  media_url: string | null;
  is_deleted: boolean | null;
  media_meta: Record<string, unknown> | null;
}

export interface RecoveryDecision {
  status: RecoveryStatus;
  /** Só quando `indisponivel`: como quem consome deve reagir. */
  motive?: RecoveryMotive;
  /** Só em `em_espera`: segundos que faltam para nova tentativa permitida. */
  tentarApos?: number;
  /** Só para log/diagnóstico; nunca volta no corpo da resposta. */
  reason?: string;
}

/** URL já no Storage permanente (bucket whatsapp-media/audio-messages). */
export function isPermanentStorageUrl(url: unknown): boolean {
  return typeof url === "string" && url.includes("/storage/v1/object/");
}

/** Tipo que a recuperação atende? Allowlist fechada. */
export function isRecoverableMediaType(type: unknown): boolean {
  return typeof type === "string" && (RECOVERABLE_MEDIA_TYPES as readonly string[]).includes(type);
}

/** Carimbo da última tentativa, lido de media_meta (sem PII). */
export function lastRecoveryAttemptAt(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const value = (meta as Record<string, unknown>)[ATTEMPT_META_KEY];
  return typeof value === "string" ? value : null;
}

/** Segundos restantes do limite de 10 min, ou 0 se já liberou. */
export function cooldownRemainingSeconds(attemptedAt: string | null, now: Date): number {
  if (!attemptedAt) return 0;
  const attemptedMs = Date.parse(attemptedAt);
  if (Number.isNaN(attemptedMs)) return 0;
  const remaining = RECOVERY_COOLDOWN_MS - (now.getTime() - attemptedMs);
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

/**
 * Decide o destino de UMA mensagem. Ordem fixa: recusa de tipo/apagada, já
 * permanente, tentativa recente (limite de 10 min → `em_espera`), e por fim os
 * pré-requisitos para tentar (chave externa + conexão de origem). Sem chave ou
 * sem conexão não há de onde baixar: é definitivo (`expirada`).
 */
export function classifyRecovery(row: RecoveryRow, now: Date): RecoveryDecision {
  if (!isRecoverableMediaType(row.message_type)) {
    return { status: "negado", reason: "tipo_nao_recuperavel" };
  }
  if (row.is_deleted === true) return { status: "negado", reason: "apagada" };
  if (isPermanentStorageUrl(row.media_url)) return { status: "ja_permanente" };

  const tentarApos = cooldownRemainingSeconds(lastRecoveryAttemptAt(row.media_meta), now);
  if (tentarApos > 0) {
    return { status: "indisponivel", motive: "em_espera", tentarApos, reason: "tentativa_recente" };
  }

  if (!row.external_id) {
    return { status: "indisponivel", motive: "expirada", reason: "sem_external_id" };
  }
  if (!row.whatsapp_connection_id) {
    return { status: "indisponivel", motive: "expirada", reason: "sem_conexao" };
  }
  return { status: "ok" };
}

// ─── Classificação da falha da Evolution ─────────────────────────────────────

export type EvolutionFailureKind = "expirada" | "falha_temporaria";

/**
 * Traduz a RESPOSTA da Evolution (status HTTP + corpo) num `motivo`. Regra:
 * só é definitivo (`expirada`) o que diz explicitamente que a mídia não existe
 * mais — 404/410, ou 400 com corpo de "expirou/não encontrada". Todo o resto
 * (5xx, 429, 403, 408, timeout, rede fora) é `falha_temporaria`: vale tentar de
 * novo. O limite de 10 min já impede repetição em rajada.
 */
export function classifyEvolutionFailure(status: number, body: unknown): EvolutionFailureKind {
  if (status === 404 || status === 410) return "expirada";
  if (status === 400) {
    const text = typeof body === "string" ? body : safeJson(body);
    if (/expir|vencid|not.?found|no.?media|media.?message/i.test(text)) return "expirada";
  }
  return "falha_temporaria";
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? "");
  } catch {
    return "";
  }
}

// ─── Portas (injetáveis para teste) ──────────────────────────────────────────

export interface RecoveryMedia {
  base64: string;
  mimetype: string;
}

/** Resultado de uma descida à Evolution: bytes OU o motivo da falha. */
export type FetchOutcome =
  | { kind: "ok"; media: RecoveryMedia }
  | { kind: "falha"; motive: EvolutionFailureKind };

export interface RecoverPorts {
  /** Mesma regra de RLS de `messages`: o JWT vê a linha? */
  checkAccess(messageId: string): Promise<boolean>;
  loadMessage(messageId: string): Promise<RecoveryRow | null>;
  resolveInstance(connectionId: string): Promise<string | null>;
  fetchMedia(instance: string, externalId: string): Promise<FetchOutcome>;
  persistMedia(row: RecoveryRow, media: RecoveryMedia): Promise<string | null>;
  markAttempt(messageId: string, mergedMeta: Record<string, unknown>, previousAttemptAt: string | null): Promise<boolean>;
  saveMediaUrl(messageId: string, url: string, mimetype: string, messageType: string): Promise<boolean>;
}

export interface RecoverDeps {
  /** Autorização: devolve o usuário ou uma Response de negação. */
  authorize?: (req: Request) => Promise<{ userId: string } | Response>;
  ports?: RecoverPorts;
  /** Instante de referência (teste determinístico). */
  now?: Date;
}

const MESSAGE_SELECT =
  "id, contact_id, message_type, external_id, whatsapp_connection_id, media_url, is_deleted, media_meta";

function buildPorts(req: Request, deps: RecoverDeps): RecoverPorts {
  const service = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));
  return {
    async checkAccess(messageId) {
      // Fail-closed: qualquer erro na leitura autenticada nega acesso.
      try {
        const authed = await createAuthedClient(req);
        const { data, error } = await authed.from("messages").select("id").eq("id", messageId).maybeSingle();
        return !error && !!data;
      } catch {
        return false;
      }
    },
    async loadMessage(messageId) {
      const { data, error } = await service.from("messages").select(MESSAGE_SELECT).eq("id", messageId).maybeSingle();
      if (error) throw error;
      return (data as unknown as RecoveryRow | null) ?? null;
    },
    async resolveInstance(connectionId) {
      const { data, error } = await service.from("whatsapp_connections").select("instance_id").eq("id", connectionId).maybeSingle();
      if (error) return null;
      return (data?.instance_id as string | null) ?? null;
    },
    async fetchMedia(instance, externalId) {
      // Nada aqui escapa como exceção: rede/timeout/5xx viram `falha_temporaria`.
      try {
        const evolutionUrl = Deno.env.get("EVOLUTION_API_URL");
        const evolutionKey = Deno.env.get("EVOLUTION_API_KEY");
        if (!evolutionUrl || !evolutionKey) return { kind: "falha", motive: "falha_temporaria" };
        const baseUrl = evolutionUrl.replace(/\/+$/, "");
        const resp = await evoFetch(
          baseUrl,
          evolutionKey,
          `/chat/getBase64FromMediaMessage/${instance}`,
          { message: { key: { id: externalId } }, convertToMp4: false },
          (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(15000) }),
        );
        const result = await resp.json().catch(() => null);
        if (!resp.ok) return { kind: "falha", motive: classifyEvolutionFailure(resp.status, result) };
        const media = extractBase64Media(result);
        // 200 sem bytes: a Evolution respondeu mas não tem mais esta mídia.
        if (!media) return { kind: "falha", motive: "expirada" };
        return { kind: "ok", media };
      } catch {
        return { kind: "falha", motive: "falha_temporaria" };
      }
    },
    persistMedia: (row, media) =>
      persistBase64Media(service as unknown as EvolutionDbClient, media.base64, media.mimetype, row.message_type, row.id, row.contact_id ?? undefined),
    async markAttempt(messageId, mergedMeta, previousAttemptAt) {
      const attemptColumn = `media_meta->>${ATTEMPT_META_KEY}`;
      const query = service
        .from("messages")
        .update({ media_meta: mergedMeta }, { count: "exact" })
        .eq("id", messageId);
      const filtered = previousAttemptAt ? query.eq(attemptColumn, previousAttemptAt) : query.is(attemptColumn, null);
      const { error, count } = await filtered;
      return !error && count === 1;
    },
    async saveMediaUrl(messageId, url, mimetype, messageType) {
      const { error, count } = await service
        .from("messages")
        .update({ media_url: url, media_type: messageType, media_mimetype: mimetype || null }, { count: "exact" })
        .eq("id", messageId);
      return !error && count === 1;
    },
  };
}

// ─── Handler ─────────────────────────────────────────────────────────────────

/** Recusa do contrato: corpo sempre `{ status: 'negado' }`. */
function negado(status: number, req: Request, log: Logger, reason: string): Response {
  log.done(status, { status: "negado", reason });
  return jsonResponse({ status: "negado" }, status, req);
}

/** Não recuperável agora: 200 com `status: indisponivel`, `motivo` e (em espera) `tentar_apos`. */
function indisponivel(req: Request, log: Logger, motive: RecoveryMotive, tentarApos?: number): Response {
  log.done(200, { status: "indisponivel", motivo: motive, tentarApos });
  const body: Record<string, unknown> = { status: "indisponivel", motivo: motive };
  if (tentarApos != null) body.tentar_apos = tentarApos;
  return jsonResponse(body, 200, req);
}

export async function handleRecoverMessageMedia(req: Request, deps: RecoverDeps = {}): Promise<Response> {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const log = new Logger("recover-message-media");
  const now = deps.now ?? new Date();

  try {
    // 1. Autorização (JWT + política de rede) ANTES de parsear payload.
    const auth = await (deps.authorize ?? requireAuth)(req);
    if (auth instanceof Response) {
      // 401 (sem/!token) vira o status do contrato; a negação de política de
      // rede (503/403) mantém o corpo original — fail-closed.
      if (auth.status === 401) return negado(401, req, log, "sem_autenticacao");
      return auth;
    }

    // 2. Payload: exatamente `message_id`.
    const body = await req.json().catch(() => ({}));
    const messageId = (body as { message_id?: unknown } | null)?.message_id;
    if (typeof messageId !== "string" || !isValidUUID(messageId)) {
      return negado(400, req, log, "message_id_invalido");
    }

    const ports = deps.ports ?? buildPorts(req, deps);

    // 3. Acesso à mensagem pela RLS de `messages`.
    if (!(await ports.checkAccess(messageId))) {
      return negado(403, req, log, "sem_acesso");
    }

    // 4. Linha completa (service_role, somente depois da checagem acima).
    let row: RecoveryRow | null;
    try {
      row = await ports.loadMessage(messageId);
    } catch {
      return indisponivel(req, log, "falha_temporaria");
    }
    if (!row) return negado(404, req, log, "mensagem_inexistente");

    const decision = classifyRecovery(row, now);
    if (decision.status === "negado") return negado(403, req, log, decision.reason ?? "recusado");
    if (decision.status === "ja_permanente") {
      log.done(200, { status: "ja_permanente" });
      return jsonResponse({ status: "ja_permanente", media_url: row.media_url }, 200, req);
    }
    if (decision.status === "indisponivel") {
      return indisponivel(req, log, decision.motive ?? "falha_temporaria", decision.tentarApos);
    }

    // 5. Carimba a tentativa ANTES do trabalho externo: o limite de 10 min vale
    //    mesmo se a Evolução não devolver bytes. Mescla o media_meta existente.
    const previousAttemptAt = lastRecoveryAttemptAt(row.media_meta);
    const mergedMeta: Record<string, unknown> = { ...(row.media_meta ?? {}), [ATTEMPT_META_KEY]: now.toISOString() };
    if (!(await ports.markAttempt(messageId, mergedMeta, previousAttemptAt))) {
      return indisponivel(req, log, "falha_temporaria");
    }

    const instance = await ports.resolveInstance(row.whatsapp_connection_id!);
    if (!instance) return indisponivel(req, log, "falha_temporaria");

    const outcome = await ports.fetchMedia(instance, row.external_id!).catch(() => null);
    if (!outcome || outcome.kind === "falha") {
      return indisponivel(req, log, outcome?.motive ?? "falha_temporaria");
    }
    const media = outcome.media;

    const url = await ports.persistMedia(row, media);
    if (!url) return indisponivel(req, log, "falha_temporaria");

    if (!(await ports.saveMediaUrl(messageId, url, media.mimetype, row.message_type))) {
      return indisponivel(req, log, "falha_temporaria");
    }
    log.done(200, { status: "ok" });
    return jsonResponse({ status: "ok", media_url: url }, 200, req);
  } catch (err) {
    log.error("Erro na recuperacao de midia", { error: err instanceof Error ? err.message : String(err) });
    log.done(500);
    return internalErrorResponse(err, req);
  }
}

// Deno.serve sob import.meta.main: importar o módulo num teste não sobe servidor.
if (import.meta.main) {
  Deno.serve((req) => handleRecoverMessageMedia(req));
}
