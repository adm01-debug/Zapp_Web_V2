// Message-specific handlers for evolution-webhook: incoming, outgoing, sticker, transcription
import { evoFetch, extractBase64Media } from './evolution-send.ts';
import { attributeMultiplixReply, attributeTalkXReply } from "./talkx-reply.ts";

import {
  isRecord, normalizePhone, resolveEventJid,
  getConnectionByInstance, getContactByPhone, fetchProfilePicFromApi, persistProfilePicture,
} from "./evolution-helpers.ts";
import { persistMediaToStorage, persistMediaViaApi, persistBase64Media, parseMessageContent } from "./evolution-media.ts";
import { downloadMediaWithEgressPolicy, SMALL_MEDIA_DOWNLOAD_MAX_BYTES } from "./media-egress.ts";
import type { EvolutionDbClient } from "./evolution-types.ts";

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
                await evoFetch(evolutionUrl, evolutionKey, '/message/sendText/' + instance, {
                  number: resolvedPhone,
                  text: autoReply,
                  delay: 500,
                }, undefined, undefined, undefined, instanceToken);
                console.warn('[OPT-OUT] Confirmacao enviada para', resolvedPhone);
              }
            }
          } catch (notifErr) {
            console.warn('[OPT-OUT] Falha ao enviar confirmacao:', notifErr instanceof Error ? notifErr.message : String(notifErr));
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
      const result = await response.json();
      await supabase.from('messages').update({ transcription: result.text, transcription_status: 'completed' }).eq('id', messageId);
    } else {
      await supabase.from('messages').update({ transcription_status: 'failed' }).eq('id', messageId);
    }
  } catch {
    await supabase.from('messages').update({ transcription_status: 'failed' }).eq('id', messageId);
  }
}
