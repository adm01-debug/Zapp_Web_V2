// Message-specific handlers for evolution-webhook: incoming, outgoing, sticker, transcription
import { evoFetch, extractBase64Media, extractMessageId } from './evolution-send.ts';
import { attributeMultiplixReply, attributeTalkXReply } from "./talkx-reply.ts";
import { resolveInstanceToken } from "./evolution-instance-token.ts";
import {
  EFFECT_MESSAGE_SEND,
  enqueueEffectReconcile,
} from "./effect-reconcile.ts";

import {
  isRecord, normalizePhone, resolveEventJid,
  getConnectionByInstance, getContactByPhone, fetchProfilePicFromApi, persistProfilePicture,
} from "./evolution-helpers.ts";
import { persistMediaToStorage, persistMediaViaApi, persistBase64Media, parseMessageContent } from "./evolution-media.ts";
import { downloadMediaWithEgressPolicy, SMALL_MEDIA_DOWNLOAD_MAX_BYTES } from "./media-egress.ts";
import type { EvolutionDbClient, EvolutionRow } from "./evolution-types.ts";
import { capabilityFlagKeyForFunction } from "./ai-feature-flags.ts";

// ─────────────────────────────────────────────────────────────────────────────
// X030 — opt-out por palavra configurável + autoresposta pelo token da instância
//
// A lista fixa `TALKX_OPT_OUT_RE` (removida) foi substituída por
// `talkx_optout_keywords` (X029). O edge carrega as palavras ativas com cache
// de 5 min e casa pela MESMA normalização de `talkx_match_optout`; se a leitura
// não estiver disponível, a RPC autoritativa decide. A palavra casada vai em
// `reason` e a RPC `talkx_suppress_contact` (origem `auto_optout`) herda a
// campanha do envio mais recente — o edge NÃO resolve `campaign_id`.
// ─────────────────────────────────────────────────────────────────────────────

/** Palavra de opt-out vinda de `talkx_optout_keywords`. */
export interface OptOutKeyword {
  keyword: string;
  match_mode: "exact" | "contains";
}

// Cache L1 module-level (sobrevive entre invocações quentes do isolate), TTL
// 5 min — mesmo desenho do cache de conexão em evolution-helpers.ts. A leitura
// é barata mas roda a cada mensagem recebida; 5 min absorve os bursts.
const OPT_OUT_KEYWORDS_TTL_MS = 5 * 60 * 1_000;
let optOutKeywordsCache: { data: OptOutKeyword[]; expiresAt: number } | null = null;

/** Zera o cache (testes e troca de palavras em ambiente quente). */
export function resetOptOutKeywordCache(): void {
  optOutKeywordsCache = null;
}

// Espelha public.talkx_normalize_optout_text (X029): minúsculas, acentos latinos
// dobrados para ASCII e qualquer run de não-alfanumérico vira UM espaço simples,
// com trim. A paridade com a RPC é o contrato: o edge só decide o casamento
// porque aplica a MESMA normalização.
const OPT_OUT_ACCENTS = "áàâãäåéèêëíìîïóòôõöúùûüçñýÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ";
const OPT_OUT_ASCII = "aaaaaaeeeeiiiiooooouuuucnyaaaaaaeeeeiiiiooooouuuucny";

export function normalizeOptOutText(text: string | null | undefined): string {
  const lower = (text ?? "").toLowerCase();
  let mapped = "";
  for (const ch of lower) {
    const idx = OPT_OUT_ACCENTS.indexOf(ch);
    mapped += idx >= 0 ? OPT_OUT_ASCII[idx] : ch;
  }
  return mapped.replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Lê as palavras ativas. Devolve a lista (possivelmente vazia) quando a leitura
 * funcionou e `null` quando NÃO foi possível decidir — aí a RPC decide.
 */
async function loadOptOutKeywords(
  supabase: EvolutionDbClient,
): Promise<OptOutKeyword[] | null> {
  const now = Date.now();
  if (optOutKeywordsCache && optOutKeywordsCache.expiresAt > now) {
    return optOutKeywordsCache.data;
  }
  try {
    const { data, error } = await supabase
      .from("talkx_optout_keywords")
      .select("keyword, match_mode")
      .eq("active", true);
    if (error || !Array.isArray(data)) {
      console.warn("[OPT-OUT] Falha ao ler talkx_optout_keywords:", error?.message);
      return null;
    }
    const list: OptOutKeyword[] = [];
    for (const row of data) {
      const keyword = row.keyword;
      if (typeof keyword !== "string" || keyword.length === 0) continue;
      list.push({
        keyword,
        match_mode: row.match_mode === "contains" ? "contains" : "exact",
      });
    }
    optOutKeywordsCache = { data: list, expiresAt: now + OPT_OUT_KEYWORDS_TTL_MS };
    return list;
  } catch (err) {
    console.warn(
      "[OPT-OUT] Erro ao ler talkx_optout_keywords:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/**
 * Casa com a MESMA regra de public.talkx_match_optout: `exact` tem prioridade,
 * depois `contains` por palavra inteira; empate desempata por comprimento da
 * palavra e ordem alfabética (igual ao ORDER BY da RPC). Devolve a palavra ou
 * null.
 */
function matchOptOutKeywordLocal(
  text: string,
  keywords: OptOutKeyword[],
): string | null {
  const norm = normalizeOptOutText(text);
  if (!norm) return null;
  let best: { keyword: string; exact: boolean; len: number } | null = null;
  for (const k of keywords) {
    const kn = normalizeOptOutText(k.keyword);
    if (!kn) continue;
    const exact = norm === kn;
    const contains = k.match_mode === "contains" && !exact &&
      (norm.startsWith(kn + " ") || norm.endsWith(" " + kn) || norm.includes(" " + kn + " "));
    if (!exact && !contains) continue;
    const cand = { keyword: k.keyword, exact, len: k.keyword.length };
    if (
      !best ||
      (cand.exact && !best.exact) ||
      (cand.exact === best.exact && cand.len > best.len) ||
      (cand.exact === best.exact && cand.len === best.len && cand.keyword < best.keyword)
    ) {
      best = cand;
    }
  }
  return best ? best.keyword : null;
}

/**
 * Resolve a palavra de opt-out do texto. Caminho normal: leitura cacheada das
 * palavras ativas. Quando ela não está disponível (leitura falhou), a RPC
 * autoritativa `talkx_match_optout` decide — "na dúvida, a RPC decide".
 */
async function resolveOptOutKeyword(
  supabase: EvolutionDbClient,
  text: string,
): Promise<string | null> {
  const keywords = await loadOptOutKeywords(supabase);
  if (keywords) return matchOptOutKeywordLocal(text, keywords);
  const { data, error } = await supabase.rpc("talkx_match_optout", { p_text: text });
  if (error) {
    console.warn("[OPT-OUT] talkx_match_optout falhou:", error.message);
    return null;
  }
  return typeof data === "string" && data.length > 0 ? data : null;
}

/**
 * X064: resposta de botão/lista cujo id é `talkx_optout` aciona o opt-out.
 * Cobre os shapes v2/Baileys e GO; devolve o id selecionado ou null.
 */
export function extractInteractiveResponseId(
  message: Record<string, unknown> | undefined,
): string | null {
  if (!isRecord(message)) return null;
  const read = (node: unknown, key: string): string | null => {
    if (!isRecord(node)) return null;
    const value = node[key];
    return typeof value === "string" && value.length > 0 ? value : null;
  };
  const button = read(message.buttonsResponseMessage, "selectedButtonId") ??
    read(message.buttonsResponseMessage, "selectedId");
  if (button) return button;
  const template = read(message.templateButtonReplyMessage, "selectedId");
  if (template) return template;
  const list = message.listResponseMessage;
  const listId = read(list, "selectedRowId") ??
    read(isRecord(list) ? list.singleSelectReply : null, "selectedRowId");
  if (listId) return listId;
  const interactive = message.interactiveResponseMessage;
  if (isRecord(interactive)) {
    const native = interactive.nativeFlowResponseMessage;
    if (isRecord(native)) {
      const params = native.paramsJson;
      if (typeof params === "string" && params) {
        try {
          const parsed = JSON.parse(params) as { id?: unknown; buttonId?: unknown };
          const id = typeof parsed?.id === "string"
            ? parsed.id
            : typeof parsed?.buttonId === "string"
            ? parsed.buttonId
            : null;
          if (id) return id;
        } catch { /* paramsJson não-JSON: ignora */ }
      }
      const id = read(native, "id");
      if (id) return id;
    }
  }
  return null;
}

const TALKX_OPTOUT_BUTTON_ID = "talkx_optout";

/** Lê `talkx_settings.optout_autoreply` (jsonb string). Vazio => sem autoresposta. */
async function loadOptOutAutoreply(
  supabase: EvolutionDbClient,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("talkx_settings")
      .select("value")
      .eq("key", "optout_autoreply")
      .maybeSingle();
    if (error) {
      console.warn("[OPT-OUT] Falha ao ler optout_autoreply:", error.message);
      return null;
    }
    const value = data?.value;
    return typeof value === "string" && value.trim() ? value : null;
  } catch (err) {
    console.warn(
      "[OPT-OUT] Erro ao ler optout_autoreply:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

// Resolve a mídia na ordem mais barata: base64 do próprio webhook (Evolution GO
// com WEBHOOKFILES=true; v2 com webhookBase64) → URL direta (CDN/MinIO) →
// download via API. Retorna a URL permanente no Storage ou null.
// deno-lint-ignore no-explicit-any
// Avatar apontando para o CDN do WhatsApp (URL expira) precisa ser re-buscado.
// Compara o hostname parseado, nao substring (CodeQL js/incomplete-url-substring-sanitization).
function isWhatsAppCdnUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host === 'pps.whatsapp.net' || host.endsWith('.pps.whatsapp.net');
  } catch {
    return false;
  }
}

async function persistIncomingMedia(
  supabase: EvolutionDbClient, instance: string, data: Record<string, unknown>,
  messageType: string, msgId: string, parsedUrl: string | null,
  contactId?: string,
): Promise<string | null> {
  const message = data.message as Record<string, unknown> | undefined;
  const webhookB64 = (data.base64 as string) || (message?.base64 as string);
  if (typeof webhookB64 === 'string' && webhookB64) {
    const fromB64 = await persistBase64Media(supabase, webhookB64, '', messageType, msgId, contactId);
    if (fromB64) return fromB64;
  }
  const directUrl = parsedUrl || (data.mediaUrl as string) || (message?.mediaUrl as string) || null;
  if (directUrl && directUrl.startsWith('http')) {
    const fromUrl = await persistMediaToStorage(supabase, directUrl, messageType, msgId, contactId);
    if (fromUrl) return fromUrl;
  }
  return await persistMediaViaApi(supabase, instance, data, messageType, msgId, contactId);
}

const URL_REGEX = /https?:\/\/[^\s<>"'`]+/i;

// Fire-and-forget OG enrichment for received messages.
// deno-lint-ignore no-explicit-any
async function enrichIncomingLinkPreview(
  supabase: EvolutionDbClient, messageId: string, content: string | null | undefined,
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

// ─────────────────────────────────────────────────────────────────────────────
// Mensagem de ausência (fora do horário comercial) — pipeline OFICIAL
//
// Quando chega uma mensagem NOVA do contato, a conexão está FORA do horário
// comercial (`is_within_business_hours`), a conexão tem `away_messages` ativa e
// a conversa NÃO tem atendente atribuído, o webhook envia a mensagem de
// ausência pela MESMA rota que o app usa:
//   INSERT idempotente em `messages` (client_message_id + status 'sending')
//   → `claim_outbound_message` (service_role) → provedor → `complete_outbound_message`.
// Nada de fetch solto: o envio usa `evoFetch` e o token da instância
// (`resolveInstanceToken`), exatamente como a edge `message-delivery`.
//
// Idempotência: o `client_message_id` é DETERMINÍSTICO por (contato, janela de
// cooldown) e quem deduplica é o UNIQUE `ux_messages_contact_client_message_id`
// — reprocessar o mesmo evento não reenvia. Cooldown: além da janela atual, a
// janela ANTERIOR também é conferida; assim o intervalo entre duas ausências
// nunca fica menor que o cooldown (a borda da janela não fura o limite).
//
// `agent_id` = dono da conexão (`whatsapp_connections.created_by`): o pipeline
// exige um perfil ATIVO (igual a `enqueue_outbound_message`) e uma mensagem de
// sistema não tem atendente humano. Sem dono/perfil ativo a ausência NÃO sai
// (fail-closed) — nunca se empresta o perfil de outra pessoa.
// ─────────────────────────────────────────────────────────────────────────────

/** Intervalo mínimo entre duas mensagens de ausência para o MESMO contato. */
export const AWAY_MESSAGE_COOLDOWN_HOURS = 12;
/** `delivery_claimed_by` — identifica o produtor no claim oficial. */
export const AWAY_MESSAGE_WORKER = "edge:evolution-webhook:away";

/** Índice da janela de cooldown (tamanho = cooldown) no relógio absoluto. */
export function awayWindowIndex(nowMs: number): number {
  return Math.floor(nowMs / (AWAY_MESSAGE_COOLDOWN_HOURS * 3_600_000));
}

/**
 * `client_message_id` determinístico (UUID) para (contato, janela). FNV-1a de
 * 32 bits em 4 pistas → 128 bits; dois isolates produzem o MESMO id para o
 * mesmo par, então o UNIQUE do banco — e não uma consulta prévia — é quem
 * deduplica o enfileiramento.
 */
export function awayClientMessageId(contactId: string, windowIndex: number): string {
  const semente = `${contactId}|away|${windowIndex}`;
  const hex: string[] = [];
  for (let pista = 0; pista < 4; pista++) {
    let h = (0x811c9dc5 ^ Math.imul(pista + 1, 0x9e3779b1)) >>> 0;
    for (let i = 0; i < semente.length; i++) {
      h ^= semente.charCodeAt(i) + pista;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    hex.push(h.toString(16).padStart(8, "0"));
  }
  const raw = hex.join("");
  // UUID de 128 bits com as marcas de versão/variante (id não-secreto).
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-4${raw.slice(13, 16)}-a${raw.slice(17, 20)}-${raw.slice(20, 32)}`;
}

/** Terminal sem reenvio para a linha claimada (igual à edge oficial). */
async function failAwayClaim(supabase: EvolutionDbClient, messageId: string, claimToken: string): Promise<void> {
  const { error } = await supabase.rpc("fail_outbound_message", {
    p_message_id: messageId,
    p_claim_token: claimToken,
    p_retryable: false,
  });
  if (error) console.error("[AWAY] fail_outbound_message:", error.code, error.message);
}

/** Efeito incerto (5xx/tempo/id ausente): reconciliação SOMENTE-LEITURA, sem reenvio. */
async function enqueueAwayReconcile(
  supabase: EvolutionDbClient,
  messageId: string,
  externalId: string | null,
): Promise<void> {
  try {
    await enqueueEffectReconcile({
      supabase,
      effect: EFFECT_MESSAGE_SEND,
      sourceTable: "messages",
      sourceId: messageId,
      externalId,
    });
  } catch (err) {
    console.error("[AWAY] reconcile enqueue failed:", err instanceof Error ? err.message : String(err));
  }
}

/**
 * Envia a mensagem de ausência da conexão ao contato, no máximo uma vez por
 * janela de cooldown. NUNCA lança: falha aqui é registrada e o processamento da
 * mensagem recebida segue (a ausência não pode derrubar o webhook).
 */
export async function sendAwayMessageIfNeeded(
  supabase: EvolutionDbClient,
  connectionId: string,
  contactId: string,
  assignedTo: string | null,
  nowMs: number = Date.now(),
): Promise<void> {
  try {
    // Conversa com atendente ativo: a ausência é exatamente o oposto disso.
    if (assignedTo) return;

    const { data: cfg, error: cfgErr } = await supabase.from("away_messages")
      .select("content, is_enabled").eq("whatsapp_connection_id", connectionId).maybeSingle();
    if (cfgErr) { console.warn("[AWAY] away_messages read failed:", cfgErr.message); return; }
    const content = typeof cfg?.content === "string" ? cfg.content.trim() : "";
    if (!cfg || cfg.is_enabled !== true || content.length === 0) return;

    const { data: aberto, error: bhErr } = await supabase.rpc("is_within_business_hours", {
      connection_id: connectionId,
    });
    if (bhErr) { console.warn("[AWAY] is_within_business_hours failed (fail-closed):", bhErr.message); return; }
    if (aberto === true) return; // dentro do horário comercial: não envia

    const janela = awayWindowIndex(nowMs);
    const clientMessageId = awayClientMessageId(contactId, janela);
    const { data: anteriores, error: priorErr } = await supabase.from("messages")
      .select("id").eq("contact_id", contactId)
      .in("client_message_id", [clientMessageId, awayClientMessageId(contactId, janela - 1)]).limit(1);
    if (priorErr) { console.warn("[AWAY] cooldown read failed (fail-closed):", priorErr.message); return; }
    if (Array.isArray(anteriores) && anteriores.length > 0) return; // cooldown ativo

    // Dono da conexão = agente responsável (o pipeline exige perfil ativo).
    const { data: conexao, error: conexaoErr } = await supabase.from("whatsapp_connections")
      .select("created_by").eq("id", connectionId).maybeSingle();
    if (conexaoErr) { console.warn("[AWAY] connection owner read failed:", conexaoErr.message); return; }
    const ownerId = typeof conexao?.created_by === "string" ? conexao.created_by : null;
    if (!ownerId) { console.warn("[AWAY] conexão sem dono — ausência não enviada (fail-closed)"); return; }
    const { data: dono, error: donoErr } = await supabase.from("profiles")
      .select("id").eq("id", ownerId).eq("is_active", true).maybeSingle();
    if (donoErr) { console.warn("[AWAY] owner profile read failed:", donoErr.message); return; }
    if (typeof dono?.id !== "string") { console.warn("[AWAY] dono sem perfil ativo — ausência não enviada"); return; }

    // 1) Enfileira no contrato oficial. O UNIQUE deduplica (sem consulta prévia).
    const { data: enfileirada, error: enqueueErr } = await supabase.from("messages").insert({
      contact_id: contactId,
      whatsapp_connection_id: connectionId,
      agent_id: ownerId,
      sender: "agent",
      content,
      message_type: "text",
      is_read: true,
      status: "sending",
      status_updated_at: new Date(nowMs).toISOString(),
      client_message_id: clientMessageId,
    }).select("id").maybeSingle();
    if (enqueueErr) {
      if (enqueueErr.code === "23505") return; // já enfileirada nesta janela (idempotente)
      console.warn("[AWAY] enqueue failed:", enqueueErr.code, enqueueErr.message);
      return;
    }
    const messageId = typeof enfileirada?.id === "string" ? enfileirada.id : null;
    if (!messageId) { console.warn("[AWAY] enqueue returned no id"); return; }

    // 2) Claim oficial: o webhook roda com a service key (auth.role() = service_role).
    const { data: claimedRows, error: claimErr } = await supabase.rpc("claim_outbound_message", {
      p_message_id: messageId,
      p_agent_id: ownerId,
      p_worker: AWAY_MESSAGE_WORKER,
      p_lease_seconds: 90,
    });
    const claim = (Array.isArray(claimedRows) ? claimedRows[0] : claimedRows) as EvolutionRow | null;
    const claimToken = typeof claim?.claim_token === "string" ? claim.claim_token : null;
    const instancia = typeof claim?.whatsapp_instance_name === "string" ? claim.whatsapp_instance_name : null;
    const telefone = typeof claim?.contact_phone === "string" ? claim.contact_phone : null;
    const texto = typeof claim?.content === "string" ? claim.content : null;
    if (claimErr || !claimToken || !instancia || !telefone || !texto) {
      console.warn("[AWAY] claim failed:", claimErr?.message ?? "sem linha claimável");
      return;
    }

    // 3) Provedor — mesmo sender e mesmo token da edge `message-delivery`.
    const evolutionUrl = Deno.env.get("EVOLUTION_API_URL")?.replace(/\/+$/, "");
    const evolutionKey = Deno.env.get("EVOLUTION_API_KEY") ?? "";
    if (!evolutionUrl || !evolutionKey) {
      console.error("[AWAY] EVOLUTION_API_URL/KEY ausentes — ausência não enviada");
      await failAwayClaim(supabase, messageId, claimToken);
      return;
    }

    let providerPostAttempted = false;
    let externalId: string | null = null;
    try {
      const instanceToken = await resolveInstanceToken(supabase, instancia);
      providerPostAttempted = true;
      const resp = await evoFetch(evolutionUrl, evolutionKey, `/message/sendText/${instancia}`, {
        number: telefone,
        text: texto,
      }, undefined, undefined, undefined, instanceToken ?? undefined);
      const raw = await resp.text();
      let providerData: unknown = null;
      try { providerData = raw ? JSON.parse(raw) : null; } catch { /* corpo do provedor inválido */ }

      if (!resp.ok) {
        await failAwayClaim(supabase, messageId, claimToken);
        if (resp.status >= 500) await enqueueAwayReconcile(supabase, messageId, null);
        console.warn("[AWAY] provedor recusou a ausência:", resp.status, messageId);
        return;
      }
      externalId = extractMessageId(providerData) ?? null;
      if (!externalId || externalId.length > 512) {
        await failAwayClaim(supabase, messageId, claimToken);
        await enqueueAwayReconcile(supabase, messageId, null);
        console.warn("[AWAY] provedor aceitou sem id — efeito incerto:", messageId);
        return;
      }
      const { data: concluida, error: completeErr } = await supabase.rpc("complete_outbound_message", {
        p_message_id: messageId,
        p_claim_token: claimToken,
        p_external_id: externalId,
        p_delivery_status: "sent",
      });
      const linha = (Array.isArray(concluida) ? concluida[0] : concluida) as EvolutionRow | null;
      if (completeErr || typeof linha?.id !== "string") {
        await failAwayClaim(supabase, messageId, claimToken);
        await enqueueAwayReconcile(supabase, messageId, externalId);
        console.warn("[AWAY] recibo não persistido:", completeErr?.code ?? "sem retorno");
        return;
      }
      console.log("[AWAY] mensagem de ausência enviada:", messageId, contactId);
    } catch (err) {
      await failAwayClaim(supabase, messageId, claimToken);
      if (providerPostAttempted) await enqueueAwayReconcile(supabase, messageId, externalId);
      console.warn("[AWAY] envio da ausência falhou:", err instanceof Error ? err.message : String(err));
    }
  } catch (err) {
    // A ausência NUNCA pode derrubar o processamento da mensagem recebida.
    console.error("[AWAY] erro inesperado:", err instanceof Error ? err.message : String(err));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Chatbot IA (L1) — disparo da resposta automática a partir da mensagem recebida
//
// O webhook é o ÚNICO chamador da edge `chatbot-l1`: depois de gravar a fala do
// cliente ele a aciona ASSINADA (HMAC-SHA256 do corpo cru em
// `x-webhook-signature`, mesmo contrato do `validateHmacRequest`) e a resposta do
// bot sai pelo MESMO pipeline oficial da mensagem de ausência:
//   INSERT em `messages` (client_message_id + status 'sending')
//   → `claim_outbound_message` (service_role) → provedor → `complete_outbound_message`.
//
// DESLIGADO POR PADRÃO, com DOIS portões independentes:
//   1. só conexão com fluxo `ai_l1` ATIVO responde (PK-06/PK-07);
//   2. a flag de capacidade `ai.capability.chatbot_l1` precisa existir com
//      `enabled = true`. Ausência da linha = DESLIGADO — ao contrário do padrão
//      do gate IA-009 (`readCapabilityFlag`), cuja ausência vale LIGADA: aqui a
//      resposta automática é nova e nada responde até o dono ligar de propósito.
//      Leitura que falha (erro do PostgREST/exceção) também FECHA.
//
// IDEMPOTÊNCIA por mensagem: o `client_message_id` é DETERMINÍSTICO por
// (contato, conexão, mensagem recebida). Antes de gastar IA o helper confere se
// já existe resposta com esse id — reentrega não consome provedor — e, mesmo na
// corrida, o UNIQUE `ux_messages_contact_client_message_id` é quem deduplica o
// enfileiramento; a consulta prévia nunca é a única garantia.
//
// SEM LAÇO: a resposta sai pelo provedor (pipeline de saída) e o gatilho só roda
// para mensagem RECEBIDA de TEXTO (`!key.fromMe` + `messageType === 'text'`) já
// persistida; a própria resposta do bot nunca reentra no webhook. Conversa com
// atendente atribuído e mensagem de opt-out não disparam.
//
// FALHA NÃO DERRUBA O WEBHOOK: qualquer erro aqui é registrado e o processamento
// da mensagem recebida segue (mesmo contrato da ausência).
// ─────────────────────────────────────────────────────────────────────────────

/** `delivery_claimed_by` — identifica o produtor no claim oficial da resposta do bot. */
export const CHATBOT_L1_WORKER = "edge:evolution-webhook:chatbot-l1";

/** Rota interna da edge de chatbot L1, montada da URL do projeto. */
export function chatbotL1Endpoint(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/chatbot-l1`;
}

/**
 * `client_message_id` determinístico (UUID) da resposta do bot para UMA mensagem
 * recebida. Mesmo esquema do `awayClientMessageId` (FNV-1a de 32 bits em 4
 * pistas → 128 bits): dois isolates produzem o MESMO id para a mesma mensagem, e
 * quem deduplica o enfileiramento é o UNIQUE do banco. A semente usa o id da
 * LINHA da mensagem recebida (sempre presente), não o `external_id` do provedor.
 */
export function chatbotReplyClientMessageId(
  contactId: string,
  connectionId: string,
  inboundMessageId: string,
): string {
  const semente = `${contactId}|chatbot-l1|${connectionId}|${inboundMessageId}`;
  const hex: string[] = [];
  for (let pista = 0; pista < 4; pista++) {
    let h = (0x811c9dc5 ^ Math.imul(pista + 1, 0x9e3779b1)) >>> 0;
    for (let i = 0; i < semente.length; i++) {
      h ^= semente.charCodeAt(i) + pista;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    hex.push(h.toString(16).padStart(8, "0"));
  }
  const raw = hex.join("");
  // UUID de 128 bits com as marcas de versão/variante (id não-secreto).
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-4${raw.slice(13, 16)}-a${raw.slice(17, 20)}-${raw.slice(20, 32)}`;
}

/** Assinatura HMAC-SHA256 (header `x-webhook-signature`) do corpo cru. */
async function assinarCorpoDoWebhook(corpo: string, segredo: string): Promise<string> {
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpo));
  const hex = Array.from(new Uint8Array(assinatura)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `sha256=${hex}`;
}

/**
 * Flag de capacidade do chatbot, com FALHA FECHADA e AUSÊNCIA = DESLIGADO.
 * Difere de `readCapabilityFlag` (IA-009, cuja ausência vale ligada) de propósito:
 * nada responde até existir a linha `enabled = true`. Erro de leitura fecha.
 */
export async function readChatbotL1Flag(supabase: EvolutionDbClient): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("feature_flags")
      .select("enabled")
      .eq("key", capabilityFlagKeyForFunction("chatbot-l1"))
      .maybeSingle();
    if (error) {
      console.warn("[CHATBOT-L1] leitura da flag falhou — tratado como DESLIGADO:", error.message);
      return false;
    }
    return data?.enabled === true;
  } catch (err) {
    console.warn(
      "[CHATBOT-L1] flag indisponivel — tratado como DESLIGADO:",
      err instanceof Error ? err.message : String(err),
    );
    return false;
  }
}

/** Terminal sem reenvio para a linha claimada da resposta do bot. */
async function failBotClaim(supabase: EvolutionDbClient, messageId: string, claimToken: string): Promise<void> {
  const { error } = await supabase.rpc("fail_outbound_message", {
    p_message_id: messageId,
    p_claim_token: claimToken,
    p_retryable: false,
  });
  if (error) console.error("[CHATBOT-L1] fail_outbound_message:", error.code, error.message);
}

/** Efeito incerto (5xx/tempo/id ausente): reconciliação SOMENTE-LEITURA, sem reenvio. */
async function enqueueBotReconcile(
  supabase: EvolutionDbClient,
  messageId: string,
  externalId: string | null,
): Promise<void> {
  try {
    await enqueueEffectReconcile({
      supabase,
      effect: EFFECT_MESSAGE_SEND,
      sourceTable: "messages",
      sourceId: messageId,
      externalId,
    });
  } catch (err) {
    console.error("[CHATBOT-L1] reconcile enqueue failed:", err instanceof Error ? err.message : String(err));
  }
}

/**
 * Enfileira a resposta do bot e a entrega pelo provedor — espelho do envio da
 * mensagem de ausência (mesmo contrato oficial, mesmo token de instância). NUNCA
 * lança: a resposta automática não pode derrubar o webhook.
 */
async function enviarRespostaDoBot(
  supabase: EvolutionDbClient,
  params: { contactId: string; connectionId: string; clientMessageId: string; texto: string },
): Promise<void> {
  try {
    // 1) Dono da conexão = agente responsável (o pipeline exige perfil ativo).
    const { data: conexao, error: conexaoErr } = await supabase.from("whatsapp_connections")
      .select("created_by").eq("id", params.connectionId).maybeSingle();
    if (conexaoErr) { console.warn("[CHATBOT-L1] connection owner read failed:", conexaoErr.message); return; }
    const ownerId = typeof conexao?.created_by === "string" ? conexao.created_by : null;
    if (!ownerId) { console.warn("[CHATBOT-L1] conexao sem dono — resposta nao enviada"); return; }
    const { data: dono, error: donoErr } = await supabase.from("profiles")
      .select("id").eq("id", ownerId).eq("is_active", true).maybeSingle();
    if (donoErr) { console.warn("[CHATBOT-L1] owner profile read failed:", donoErr.message); return; }
    if (typeof dono?.id !== "string") {
      console.warn("[CHATBOT-L1] dono sem perfil ativo — resposta nao enviada");
      return;
    }

    // 2) Enfileira no contrato oficial. O UNIQUE deduplica (sem consulta prévia).
    const { data: enfileirada, error: enqueueErr } = await supabase.from("messages").insert({
      contact_id: params.contactId,
      whatsapp_connection_id: params.connectionId,
      agent_id: ownerId,
      sender: "agent",
      content: params.texto,
      message_type: "text",
      is_read: true,
      status: "sending",
      status_updated_at: new Date().toISOString(),
      client_message_id: params.clientMessageId,
    }).select("id").maybeSingle();
    if (enqueueErr) {
      if (enqueueErr.code === "23505") return; // já enfileirada (corrida idempotente)
      console.warn("[CHATBOT-L1] enqueue failed:", enqueueErr.code, enqueueErr.message);
      return;
    }
    const messageId = typeof enfileirada?.id === "string" ? enfileirada.id : null;
    if (!messageId) { console.warn("[CHATBOT-L1] enqueue returned no id"); return; }

    // 3) Claim oficial: o webhook roda com a service key (auth.role() = service_role).
    const { data: claimedRows, error: claimErr } = await supabase.rpc("claim_outbound_message", {
      p_message_id: messageId,
      p_agent_id: ownerId,
      p_worker: CHATBOT_L1_WORKER,
      p_lease_seconds: 90,
    });
    const claim = (Array.isArray(claimedRows) ? claimedRows[0] : claimedRows) as EvolutionRow | null;
    const claimToken = typeof claim?.claim_token === "string" ? claim.claim_token : null;
    const instancia = typeof claim?.whatsapp_instance_name === "string" ? claim.whatsapp_instance_name : null;
    const telefone = typeof claim?.contact_phone === "string" ? claim.contact_phone : null;
    const texto = typeof claim?.content === "string" ? claim.content : null;
    if (claimErr || !claimToken || !instancia || !telefone || !texto) {
      console.warn("[CHATBOT-L1] claim failed:", claimErr?.message ?? "sem linha claimável");
      return;
    }

    // 4) Provedor — mesmo sender e mesmo token da edge `message-delivery`.
    const evolutionUrl = Deno.env.get("EVOLUTION_API_URL")?.replace(/\/+$/, "");
    const evolutionKey = Deno.env.get("EVOLUTION_API_KEY") ?? "";
    if (!evolutionUrl || !evolutionKey) {
      console.error("[CHATBOT-L1] EVOLUTION_API_URL/KEY ausentes — resposta nao enviada");
      await failBotClaim(supabase, messageId, claimToken);
      return;
    }

    let providerPostAttempted = false;
    let externalId: string | null = null;
    try {
      const instanceToken = await resolveInstanceToken(supabase, instancia);
      providerPostAttempted = true;
      const resp = await evoFetch(evolutionUrl, evolutionKey, `/message/sendText/${instancia}`, {
        number: telefone,
        text: texto,
      }, undefined, undefined, undefined, instanceToken ?? undefined);
      const raw = await resp.text();
      let providerData: unknown = null;
      try { providerData = raw ? JSON.parse(raw) : null; } catch { /* corpo do provedor inválido */ }

      if (!resp.ok) {
        await failBotClaim(supabase, messageId, claimToken);
        if (resp.status >= 500) await enqueueBotReconcile(supabase, messageId, null);
        console.warn("[CHATBOT-L1] provedor recusou a resposta:", resp.status, messageId);
        return;
      }
      externalId = extractMessageId(providerData) ?? null;
      if (!externalId || externalId.length > 512) {
        await failBotClaim(supabase, messageId, claimToken);
        await enqueueBotReconcile(supabase, messageId, null);
        console.warn("[CHATBOT-L1] provedor aceitou sem id — efeito incerto:", messageId);
        return;
      }
      const { data: concluida, error: completeErr } = await supabase.rpc("complete_outbound_message", {
        p_message_id: messageId,
        p_claim_token: claimToken,
        p_external_id: externalId,
        p_delivery_status: "sent",
      });
      const linha = (Array.isArray(concluida) ? concluida[0] : concluida) as EvolutionRow | null;
      if (completeErr || typeof linha?.id !== "string") {
        await failBotClaim(supabase, messageId, claimToken);
        await enqueueBotReconcile(supabase, messageId, externalId);
        console.warn("[CHATBOT-L1] recibo nao persistido:", completeErr?.code ?? "sem retorno");
        return;
      }
      console.log("[CHATBOT-L1] resposta enviada:", messageId, params.contactId);
    } catch (err) {
      await failBotClaim(supabase, messageId, claimToken);
      if (providerPostAttempted) await enqueueBotReconcile(supabase, messageId, externalId);
      console.warn("[CHATBOT-L1] envio da resposta falhou:", err instanceof Error ? err.message : String(err));
    }
  } catch (err) {
    // O envio do bot NUNCA pode derrubar o processamento da mensagem recebida.
    console.error("[CHATBOT-L1] erro inesperado no envio:", err instanceof Error ? err.message : String(err));
  }
}

/**
 * Portão da resposta automática. Decide se a mensagem recebida aciona a edge
 * `chatbot-l1` e, quando aciona, entrega a resposta pelo pipeline oficial.
 * NUNCA lança — falha aqui é registrada e o webhook segue.
 */
export async function triggerChatbotL1IfNeeded(
  supabase: EvolutionDbClient,
  params: {
    connectionId: string;
    contactId: string;
    inboundMessageId: string;
    content: string;
    assignedTo: string | null;
  },
  supabaseUrl: string,
): Promise<void> {
  try {
    // Conversa com atendente atribuído: o bot não responde.
    if (params.assignedTo) return;
    const textoRecebido = params.content.trim();
    if (textoRecebido.length === 0) return;

    const segredo = Deno.env.get("CHATBOT_L1_WEBHOOK_SECRET");
    if (!segredo) {
      console.warn("[CHATBOT-L1] CHATBOT_L1_WEBHOOK_SECRET ausente — gatilho nao disparado");
      return;
    }

    // Portão 2: flag de capacidade. Ausência/erro = desligado.
    if (!await readChatbotL1Flag(supabase)) return;

    // Portão 1: a conexão precisa de um fluxo `ai_l1` ATIVO.
    const { data: fluxo, error: fluxoErr } = await supabase.from("chatbot_flows")
      .select("id").eq("whatsapp_connection_id", params.connectionId)
      .eq("is_active", true).eq("trigger_type", "ai_l1").limit(1).maybeSingle();
    if (fluxoErr) { console.warn("[CHATBOT-L1] leitura do fluxo falhou (fail-closed):", fluxoErr.message); return; }
    if (!fluxo) return; // conexão sem fluxo ai_l1 ativo

    // Idempotência: reentrega da mesma mensagem não gasta IA nem reenvia.
    const clientMessageId = chatbotReplyClientMessageId(
      params.contactId,
      params.connectionId,
      params.inboundMessageId,
    );
    const { data: anteriores, error: priorErr } = await supabase.from("messages")
      .select("id").eq("contact_id", params.contactId)
      .eq("client_message_id", clientMessageId).limit(1);
    if (priorErr) {
      console.warn("[CHATBOT-L1] leitura de idempotencia falhou (fail-closed):", priorErr.message);
      return;
    }
    if (Array.isArray(anteriores) && anteriores.length > 0) return; // já respondida

    // Chamada ASSINADA à edge (HMAC do corpo cru).
    const corpo = JSON.stringify({
      contactId: params.contactId,
      message: textoRecebido,
      connectionId: params.connectionId,
    });
    const resp = await fetch(chatbotL1Endpoint(supabaseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-signature": await assinarCorpoDoWebhook(corpo, segredo),
      },
      body: corpo,
    });
    if (!resp.ok) {
      await resp.text().catch(() => "");
      console.warn("[CHATBOT-L1] edge recusou o gatilho:", resp.status);
      return;
    }
    const payload = await resp.json().catch(() => null) as { handled?: unknown; response?: unknown } | null;
    const resposta = typeof payload?.response === "string" ? payload.response.trim() : "";
    // Transferência para humano / nada a responder: o atendente assume.
    if (payload?.handled !== true || resposta.length === 0) return;

    await enviarRespostaDoBot(supabase, {
      contactId: params.contactId,
      connectionId: params.connectionId,
      clientMessageId,
      texto: resposta,
    });
  } catch (err) {
    console.error("[CHATBOT-L1] erro inesperado no gatilho:", err instanceof Error ? err.message : String(err));
  }
}

// deno-lint-ignore no-explicit-any
export async function handleOutgoingWhatsAppMessage(
  supabase: EvolutionDbClient, instance: string, data: Record<string, unknown>,
  key: { remoteJid?: string; remoteJidAlt?: string; participant?: string; participantAlt?: string; fromMe: boolean; id: string },
) {
  const externalId = key.id;

  const connection = await getConnectionByInstance(supabase, instance);
  if (!connection) return;

  // Escopado por whatsapp_connection_id/sender para bater com o indice unico
  // real (ux_messages_dedup). key.id do WhatsApp so eh garantidamente unico
  // por chat/dispositivo, nao globalmente -- sem o escopo, uma colisao entre
  // duas conexoes diferentes faria este pre-check achar a linha errada.
  const { data: existingMessage, error: dupCheckErr } = await supabase.from('messages')
    .select('id').eq('whatsapp_connection_id', connection.id).eq('sender', 'agent').eq('external_id', externalId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (dupCheckErr) { console.warn('[FROM_ME] maybeSingle concurrent dups:', dupCheckErr.code, externalId); }

  // E32: persistir par LID→JID em contact_identity_map quando ambos chegam no mesmo evento.
  // Executado antes do early-return de duplicata para garantir backfill mesmo em reprocessamentos.
  // Operação fire-and-forget: falha não impede o processamento da mensagem.
  void (async () => {
    try {
      const rawLid = key.remoteJid ?? '';
      const rawJid = key.remoteJidAlt;
      const isLidFormat = (s: string) => s.includes('@lid') || /^\d{14,15}$/.test(s.replace(/@.*/, ''));
      if (rawLid && rawJid && rawLid !== rawJid && isLidFormat(rawLid) && !isLidFormat(rawJid)) {
        const { error: mapErr } = await supabase.from('contact_identity_map').upsert(
          { lid: rawLid, jid: rawJid, last_seen: new Date().toISOString(), source: 'evolution-go' },
          { onConflict: 'lid', ignoreDuplicates: false }
        );
        if (mapErr) console.warn('[E32] contact_identity_map upsert failed:', mapErr.code, mapErr.message);
      }
    } catch (e) {
      console.warn('[E32] contact_identity_map unexpected error:', e);
    }
  })();

  if (existingMessage) return;

  const payloadKey = isRecord(data.key) ? data.key : null;
  const bestJid = resolveEventJid(key, payloadKey, data);

  const phone = normalizePhone(bestJid ?? undefined);
  if (!phone || bestJid?.includes('@g.us')) {
    console.log(`[FROM_ME] Ignored message ${externalId}: unresolved recipient`, { bestJid });
    return;
  }

  const contact = await getContactByPhone(supabase, phone, connection.id);
  if (!contact) return;

  const message = data.message as Record<string, unknown> | undefined;
  const parsed = parseMessageContent(message, data);
  if (parsed.messageType === 'reaction') return;
  if (!parsed.content && parsed.messageType === 'text') return;

  let { mediaUrl } = parsed;
  if (['image', 'video', 'audio', 'document'].includes(parsed.messageType)) {
    const msgId = key.id.replace(/[^a-zA-Z0-9]/g, '');
    const permanentUrl = await persistIncomingMedia(supabase, instance, data, parsed.messageType, msgId, mediaUrl, contact.id);
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

  // E08: upsert idempotente contra race condition de webhooks paralelos.
  // onConflict explicito e obrigatorio — sem ele o PostgREST usa a PK (id,
  // gerado novo a cada insert) como alvo do conflito e o DO NOTHING nunca
  // dispara. ux_messages_dedup (migration 20260901100002) e indice unico
  // nao-parcial em (whatsapp_connection_id, external_id, sender), entao o
  // conflito e inferivel.
  const { error: msgError } = await supabase.from('messages').upsert({
    contact_id: contact.id, whatsapp_connection_id: connection.id, content: parsed.content,
    message_type: parsed.messageType, media_url: mediaUrl, sender: 'agent', external_id: externalId,
    status: 'sent', created_at: messageCreatedAt, agent_id: contact.assigned_to || null,
  }, { onConflict: 'whatsapp_connection_id,external_id,sender', ignoreDuplicates: true });

  if (msgError) { console.error('[FROM_ME] Error inserting outgoing message:', msgError); return; }
  await supabase.from('contacts').update({ updated_at: new Date().toISOString() }).eq('id', contact.id);
}

// deno-lint-ignore no-explicit-any
export async function handleIncomingMessage(
  supabase: EvolutionDbClient, instance: string, data: Record<string, unknown>,
  key: { remoteJid?: string; remoteJidAlt?: string; participant?: string; participantAlt?: string; fromMe: boolean; id: string },
  supabaseUrl: string, supabaseServiceKey: string
) {
  const payloadKey = isRecord(data.key) ? data.key : null;
  const bestJid = resolveEventJid(key, payloadKey, data);

  // E32: persistir par LID→JID em contact_identity_map quando ambos chegam no mesmo evento.
  // Mensagens recebidas também carregam remoteJid/remoteJidAlt com LID e JID real.
  // Operação fire-and-forget: falha não impede o processamento da mensagem.
  void (async () => {
    try {
      const rawLid = key.remoteJid ?? '';
      const rawJid = key.remoteJidAlt;
      const isLidFormat = (s: string) => s.includes('@lid') || /^\d{14,15}$/.test(s.replace(/@.*/, ''));
      if (rawLid && rawJid && rawLid !== rawJid && isLidFormat(rawLid) && !isLidFormat(rawJid)) {
        const { error: mapErr } = await supabase.from('contact_identity_map').upsert(
          { lid: rawLid, jid: rawJid, last_seen: new Date().toISOString(), source: 'evolution-go' },
          { onConflict: 'lid', ignoreDuplicates: false }
        );
        if (mapErr) console.warn('[E32] contact_identity_map upsert failed:', mapErr.code, mapErr.message);
      }
    } catch (e) {
      console.warn('[E32] contact_identity_map unexpected error:', e);
    }
  })();

  const phone = normalizePhone(bestJid ?? undefined);
  if (!phone || bestJid?.includes('@g.us')) {
    console.log(`[INCOMING] Ignored message ${key.id}: unresolved sender`, { bestJid });
    return;
  }
  const message = data.message as Record<string, unknown> | undefined;
  const parsed = parseMessageContent(message, data);
  if (parsed.messageType === 'reaction') return;

  let { mediaUrl } = parsed;
  let { content } = parsed;
  const { messageType } = parsed;

  // X064/X030: resposta de botão/lista com id `talkx_optout` é uma mensagem útil
  // mesmo sem texto (o GO entrega só o id selecionado). Sem considerar o id, o
  // guard de vazio abaixo a descartaria antes de o opt-out ser avaliado.
  const interactiveResponseId = extractInteractiveResponseId(message);
  if (!content && interactiveResponseId) content = interactiveResponseId;

  // Texto sem conteúdo e sem mídia (undecryptable/protocol residual) viraria
  // linha fantasma vazia — mesmo guard que o caminho de saída já tem.
  if (!content && messageType === 'text' && !mediaUrl) {
    console.log(`[INCOMING] Ignored empty message ${key.id}`);
    return;
  }

  const connection = await getConnectionByInstance(supabase, instance);
  if (!connection) return;

  if (messageType === 'sticker') {
    mediaUrl = await handleStickerMedia(supabase, instance, data, message, key);
  }

  if (['image', 'video', 'audio', 'document'].includes(messageType)) {
    const msgId = key.id || `${Date.now()}`;
    const earlyContact = await getContactByPhone(supabase, phone, connection.id);
    const permanentUrl = await persistIncomingMedia(supabase, instance, data, messageType, msgId, mediaUrl, earlyContact?.id);
    if (permanentUrl) mediaUrl = permanentUrl;
  }

  const messageCreatedAt = (data.messageTimestamp as number)
    ? new Date((data.messageTimestamp as number) * 1000).toISOString() : new Date().toISOString();

  // Uma transacao (migration 20260905050000): find-or-create do contato com
  // variantes do 9o digito e relink de conexao + upsert idempotente da mensagem
  // (ux_messages_dedup, preservando status/conteudo de mensagem apagada).
  // Antes eram 3-5 round-trips sem atomicidade; falha no meio deixava contato
  // sem mensagem ou relink parcial.
  const { data: txRows, error: txError } = await supabase.rpc('ingest_inbound_message', {
    p_connection_id: connection.id,
    p_phone: phone,
    p_push_name: (data.pushName as string) || null,
    p_content: content,
    p_message_type: messageType,
    p_media_url: mediaUrl,
    p_external_id: key.id,
    p_created_at: messageCreatedAt,
  });
  if (txError) {
    console.error('[INCOMING] ingest_inbound_message failed:', { code: txError.code, message: txError.message, externalId: key.id, bestJid, phone, messageType });
    return;
  }
  const tx = (Array.isArray(txRows) ? txRows[0] : txRows) as {
    contact_id: string; contact_name: string | null; assigned_to: string | null; avatar_url: string | null;
    contact_created: boolean; message_id: string | null; outcome: 'inserted' | 'updated' | 'duplicate';
  } | null;
  if (!tx?.contact_id) {
    console.error('[INCOMING] ingest_inbound_message returned no contact', { externalId: key.id, phone });
    return;
  }

  // Avatar fica fora da transacao: chamada externa a Evolution GO.
  if (tx.contact_created || !tx.avatar_url || isWhatsAppCdnUrl(tx.avatar_url)) {
    const picUrl = await fetchProfilePicFromApi(instance, phone);
    if (picUrl) {
      const avatarUrl = await persistProfilePicture(supabase, phone, picUrl);
      if (avatarUrl) await supabase.from('contacts').update({ avatar_url: avatarUrl }).eq('id', tx.contact_id);
    }
  }

  if (tx.outcome === 'duplicate' || !tx.message_id) {
    console.warn(`[INCOMING] Duplicate silently ignored (race condition): ${key.id}`);
    return;
  }

  if (messageType === 'audio' && mediaUrl) await handleAudioTranscription(supabase, tx.contact_id, tx.message_id, mediaUrl, supabaseUrl, supabaseServiceKey);
  if (tx.outcome === 'inserted' && messageType === 'text' && content) {
    void enrichIncomingLinkPreview(supabase, tx.message_id, content, supabaseUrl, supabaseServiceKey);
  }
  // X030: opt-out por palavra configurada (talkx_optout_keywords, casada com a
  // MESMA normalização da RPC) OU por resposta de botão/lista com id
  // `talkx_optout` (X064). Avaliado só para mensagem recebida (nunca a nossa).
  const optOutKeyword = key.fromMe
    ? null
    : interactiveResponseId === TALKX_OPTOUT_BUTTON_ID
    ? TALKX_OPTOUT_BUTTON_ID
    : messageType === 'text' && content
    ? await resolveOptOutKeyword(supabase, content)
    : null;

  // E57: opt-out automatico por palavra-chave (gateado por campanha recente 30 dias)
  if (optOutKeyword && (tx.outcome === 'inserted' || tx.outcome === 'updated') && tx.contact_id) {
    // Fix P1: usar phone resolvido via bestJid/normalizePhone (ja disponivel no escopo da funcao pai)
    const resolvedPhone = phone ?? ((key.remoteJid ?? '').split('@')[0].replace(/\D/g, ''));
    if (resolvedPhone && resolvedPhone.length >= 8) {
      // Gate: verificar se ha campanha recente (30 dias) para o contato
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentSend } = await supabase.from('talkx_recipients')
        .select('id').eq('contact_id', tx.contact_id)
        .not('sent_at', 'is', null).gte('sent_at', cutoff).limit(1);
      if (recentSend && recentSend.length > 0) {
        // X030: a palavra casada vai em `reason`; a campanha NÃO é resolvida na
        // edge — a RPC talkx_suppress_contact (origem auto_optout) herda a
        // campanha do envio mais recente quando p_campaign_id é omitido.
        const { data: newId, error: suppErr } = await supabase.rpc('talkx_suppress_contact', {
          p_contact_id: tx.contact_id,
          p_phone: resolvedPhone,
          p_reason: 'Opt-out via mensagem: ' + optOutKeyword,
          p_reason_code: 'opt_out',
          p_origin: 'auto_optout',
          p_source_message_id: tx.message_id ?? null,
        });
        if (newId) {
          console.warn('[OPT-OUT] ' + resolvedPhone + ' adicionado a talkx_blacklist (' + optOutKeyword + ')');
          // E59: mensagem de confirmacao. O texto vem de
          // talkx_settings.optout_autoreply e sai pelo token da INSTANCIA que
          // recebeu a mensagem (resolvido no Vault via get_instance_token).
          try {
            const evolutionUrl = Deno.env.get('EVOLUTION_API_URL')?.replace(/\/+$/, '');
            const evolutionKey = Deno.env.get('EVOLUTION_API_KEY') ?? '';
            const autoReply = await loadOptOutAutoreply(supabase);
            if (evolutionUrl && autoReply) {
              const { data: tokenData } = await supabase.rpc('get_instance_token', { p_instance_id: instance });
              const instanceToken = typeof tokenData === 'string' && tokenData.length > 0 ? tokenData : null;
              if (!instanceToken) {
                console.warn('[OPT-OUT] Token da instancia ausente — confirmacao nao enviada (' + instance + ')');
              } else {
                // R2-API-008: o Response do evoFetch precisa ser inspecionado antes de
                // anunciar envio. Um 4xx/5xx não pode virar "Confirmacao enviada" no log:
                // o contato não recebeu nada. O timeout cobre a espera pela resposta e o
                // corpo é consumido para o registro (evidência do provedor).
                const resp = await evoFetch(evolutionUrl, evolutionKey, '/message/sendText/' + instance, {
                  number: resolvedPhone,
                  text: autoReply,
                  delay: 500,
                }, undefined, undefined, AbortSignal.timeout(15000), instanceToken);
                if (resp.ok) {
                  console.warn(
                    '[OPT-OUT] Confirmacao enviada (accepted, status ' + resp.status + ') para ' + resolvedPhone,
                  );
                } else {
                  const detalhe = (await resp.text().catch(() => '')).slice(0, 200);
                  console.warn(
                    '[OPT-OUT] Confirmacao RECUSADA pelo provedor (rejected, status ' + resp.status + ') para ' +
                      resolvedPhone + (detalhe ? ' — ' + detalhe : ''),
                  );
                }
              }
            }
          } catch (notifErr) {
            // R2-API-008: sem resposta HTTP (timeout, DNS, rede) o desfecho é `unknown`
            // — não dá para afirmar que a confirmação saiu.
            console.warn(
              '[OPT-OUT] Confirmacao sem resposta do provedor (unknown):',
              notifErr instanceof Error ? notifErr.message : String(notifErr),
            );
          }
        } else if (!suppErr) {
          console.warn('[OPT-OUT] ' + resolvedPhone + ' ja suprimido (idempotente): confirmacao nao reenviada');
        } else {
          console.warn('[OPT-OUT] Falha:', suppErr?.message);
        }
      } else {
        console.warn('[OPT-OUT] Ignorado (sem campanha recente) para ', resolvedPhone);
      }
    }
  }

  // E88/X028: atribuir resposta TalkX, exceto opt-out. O handler AGUARDA a RPC
  // (attribute_talkx_reply) — não é mais fire-and-forget: o efeito no banco precisa
  // estar garantido antes de o webhook responder, senão uma resposta podia ser
  // perdida se a função fosse congelada logo após o retorno. O telefone resolvido
  // (bestJid/normalizePhone) cobre o contato que chegou por outro contact_id (LID).
  // X030: a MESMA mensagem de opt-out (palavra OU botão) não conta como resposta.
  if (tx.outcome === 'inserted' && !key.fromMe && tx.contact_id && tx.message_id) {
    if (!optOutKeyword) {
      await attributeTalkXReply(supabase, tx.contact_id, phone ?? null, tx.message_id);
      // F62: a MESMA resposta tambem fecha o item do Multiplix. A citacao (quando existe)
      // e o unico jeito de saber QUAL envio gerou a resposta — sem ela a atribuicao e por
      // janela + numero e a funcao grava `inferred` em vez de `linked`. Por isso a citacao
      // e extraida aqui e passada adiante: a diferenca entre as duas e o que o operador ve.
      // O vinculo e por TELEFONE: `multiplix_recipients` nao tem contact_id (guarda
      // `destino_e164`). `phone` ja vem normalizado no escopo desta funcao (bestJid).
      if (phone) {
        void attributeMultiplixReply(
          supabase,
          phone,
          tx.message_id,
          extractQuotedExternalId(data),
        );
      }
    }

    // Mensagem de ausência (fora do horário comercial): sai pela mesma rota do
    // app (pipeline oficial). Não dispara para mensagem de opt-out — o contato
    // acabou de pedir para sair — nem quando há atendente atribuído (checado
    // dentro do próprio helper).
    if (!optOutKeyword) {
      await sendAwayMessageIfNeeded(
        supabase,
        connection.id,
        tx.contact_id,
        tx.assigned_to ?? null,
        Date.now(),
      );
    }

    // Chatbot IA (L1): resposta automática da conexão que tem fluxo `ai_l1`
    // ativo e a flag `ai.capability.chatbot_l1` ligada. Só mensagem de TEXTO com
    // conteúdo (o contrato da edge exige `message` não-vazio) e fora do opt-out
    // (o contato acabou de pedir para sair). NUNCA lança: falha aqui não pode
    // derrubar o processamento da mensagem recebida.
    if (!optOutKeyword && messageType === 'text' && typeof content === 'string' && content.trim()) {
      await triggerChatbotL1IfNeeded(supabase, {
        connectionId: connection.id,
        contactId: tx.contact_id,
        inboundMessageId: tx.message_id,
        content,
        assignedTo: tx.assigned_to ?? null,
      }, supabaseUrl);
    }
  }
}

/**
 * F62: extrai o `external_id` da mensagem CITADA, quando o contato responde quotando.
 *
 * O `stanzaId` do `contextInfo` e o id da mensagem original — o mesmo que gravamos em
 * `multiplix_delivery_items.external_id` no envio. O `contextInfo` nao fica no topo: ele
 * vive DENTRO do tipo da mensagem (`extendedTextMessage`, `imageMessage`, `audioMessage`...),
 * entao e preciso descer um nivel por tipo. Casa tambem `stanzaID` (grafia do Go).
 * Devolve null quando nao ha citacao utilizavel — e ai a atribuicao cai em `inferred`.
 */
// deno-lint-ignore no-explicit-any
function extractQuotedExternalId(data: any): string | null { // eslint-disable-line @typescript-eslint/no-explicit-any
  const message = isRecord(data?.message) ? data.message : null;
  if (!message) return null;
  for (const value of Object.values(message)) {
    if (!isRecord(value)) continue;
    const ctx = value.contextInfo;
    if (!isRecord(ctx)) continue;
    const stanza = ctx.stanzaId ?? ctx.stanzaID;
    if (typeof stanza === 'string' && stanza.trim()) return stanza.trim();
  }
  return null;
}

// deno-lint-ignore no-explicit-any
export async function handleStickerMedia(
  supabase: EvolutionDbClient, instance: string, data: Record<string, unknown>,
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
      const fileName = `sticker_${key.id.replace(/[^a-zA-Z0-9]/g, '')}.webp`;
      const { error: uploadErr } = await supabase.storage.from('whatsapp-media').upload(`stickers/${fileName}`, bytes, { contentType: 'image/webp', cacheControl: '31536000', upsert: true });
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
        // R2-API-009: mediaUrl do payload passa pela política de egress antes
        // de qualquer fetch (destino validado, redirect revalidado, teto de bytes).
        const download = await downloadMediaWithEgressPolicy(directMediaUrl, {
          maxBytes: SMALL_MEDIA_DOWNLOAD_MAX_BYTES, timeoutMs: 10000, logTag: 'STICKER',
        });
        const bytes = download?.bytes;
        if (bytes && bytes.length > 100) {
          const fileName = `sticker_${key.id.replace(/[^a-zA-Z0-9]/g, '')}.webp`;
          const { error: uploadErr } = await supabase.storage.from('whatsapp-media').upload(`stickers/${fileName}`, bytes, { contentType: 'image/webp', cacheControl: '31536000', upsert: true });
          if (!uploadErr) { const { data: urlData } = supabase.storage.from('whatsapp-media').getPublicUrl(`stickers/${fileName}`); mediaUrl = urlData.publicUrl; }
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
export async function handleAudioTranscription(supabase: EvolutionDbClient, _contactId: string, messageId: string, mediaUrl: string, supabaseUrl: string, supabaseServiceKey: string) {
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
      // A Edge responde `{ transcription }` (NÃO `text`): ler `result.text`
      // gravava `undefined` como `completed` — o selo "Transcrito" não aparecia e
      // a transcrição paga era perdida. O texto só vira `completed` se existir;
      // resposta vazia (fallback de formato) é `failed`, nunca "completed vazio".
      const result = await response.json() as { transcription?: unknown };
      const text = typeof result?.transcription === "string"
        ? result.transcription.trim()
        : "";
      if (text) {
        await supabase.from('messages').update({ transcription: text, transcription_status: 'completed' }).eq('id', messageId);
      } else {
        await supabase.from('messages').update({ transcription_status: 'failed' }).eq('id', messageId);
      }
    } else {
      await supabase.from('messages').update({ transcription_status: 'failed' }).eq('id', messageId);
    }
  } catch {
    await supabase.from('messages').update({ transcription_status: 'failed' }).eq('id', messageId);
  }
}
