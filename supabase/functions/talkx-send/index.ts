/**
 * Talk X — Humanized bulk messaging edge function
 * Simulates typing, personalized messages with {{nome}}, {{apelido}}, {{empresa}}, {{saudacao}}
 * Supports text + media (image, video, document, audio)
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, handleCors, Logger } from "../_shared/validation.ts";
import { evoFetch, extractMessageId } from "../_shared/evolution-send.ts";
import { DEFAULT_SCHEDULE_TIMEZONE, deliveryWindowStatus, parseBusinessHours } from "../_shared/talkx-window.ts";
import { pauseReasonForWindow } from "../_shared/talkx-resume-policy.ts";
import { resolvePrivateBucketUrl } from "../_shared/evolution-api-proxy.ts";
import { liveTalkXInstanceId } from "../_shared/talkx-delivery-connection.ts";
import { timingSafeEqual } from "../_shared/hmac-validation.ts";
import {
  getMediaEndpoint,
  newCorrelationId,
  personalize,
  randomBetween,
  sleep,
} from "../_shared/messaging/index.ts";

// F43: as duplicatas locais (`randomBetween`, `sleep`, `getMediaEndpoint`) foram
// removidas — vêm do kernel compartilhado. `personalize` (F37) segue reexportado,
// junto com `randomBetween`, para não quebrar os importadores deste módulo
// (index.test.ts importa ambos daqui).
export { personalize, randomBetween };

/** E49: sorteia variante A/B pelo peso. Retorna null se nao houver variantes. */
async function pickVariant(supabase: SupabaseClient, templateId: string): Promise<{ id: string; content: string; media_url: string | null; media_type: string | null } | null> {
  const { data: variants, error: varErr } = await supabase
    .from('talkx_template_variants')
    .select('id,content,media_url,media_type,weight')
    .eq('template_id', templateId);
  if (varErr) throw new Error(`variant_lookup_failed: ${varErr.message}`);
  if (!variants || variants.length === 0) return null;
  const total = variants.reduce((s: number, v: { weight: number }) => s + v.weight, 0);
  let roll = Math.random() * total;
  for (const v of variants) { roll -= v.weight; if (roll <= 0) return v; }
  return variants[variants.length - 1];
}

export async function handleTalkxSend(
  req: Request,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _injected?: { supabase?: any; serviceKey?: string },
): Promise<Response> {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const headers = { ...getCorsHeaders(req), "Content-Type": "application/json" };
  const log = new Logger("talkx-send");
  // F43: UM correlation_id por request, propagado ao log estruturado.
  // Opaco de proposito: nao deriva de telefone, nome ou conteudo.
  const correlationId = newCorrelationId();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = _injected?.serviceKey ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const evolutionUrl = Deno.env.get("EVOLUTION_API_URL")!;
    const evolutionKey = Deno.env.get("EVOLUTION_API_KEY")!;

    const supabase = _injected?.supabase ?? createClient(supabaseUrl, serviceKey);

    // Auth: service-role key (scheduler/server-side) OR user JWT with admin/manager role.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }
    const token = authHeader.slice(7);
    // Comparação constant-time: `===` retorna cedo no primeiro byte diferente e vaza timing.
    const isServiceKey = timingSafeEqual(token, serviceKey);
    // V12: ator da transição — perfil do JWT (quando não é service key) ou null (worker).
    let actorId: string | null = null;
    if (!isServiceKey) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
      }
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["admin", "supervisor"])
        .maybeSingle();
      if (!roleData) {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
      }
      actorId = user.id;
    }

    const body = await req.json();
    const { campaignId, action, reason } = body;

    // E47: action test --- envia template de teste para um numero
    if (action === "test") {
      // customVariables (nomes) e aceito no corpo por retrocompatibilidade com o
      // frontend, mas nao e mais necessario: qualquer placeholder sem valor real
      // vira "[nome]" automaticamente (ver personalize()).
      const { templateContent, mediaUrl, mediaType, phone } = body as {
        templateContent: string;
        mediaUrl?: string | null;
        mediaType?: string | null;
        phone: string;
        customVariables?: string[];
      };
      if (!templateContent || !phone) {
        return new Response(JSON.stringify({ error: "templateContent e phone obrigatorios" }), { status: 400, headers });
      }
      // Buscar conexao WhatsApp padrao (primeira ativa)
      const { data: conn } = await supabase
        .from("whatsapp_connections").select("status, instance_id").eq("status", "connected").limit(1).single();
      const testInstanceId = liveTalkXInstanceId(conn);
      if (!testInstanceId) {
        return new Response(JSON.stringify({ error: "Nenhuma conexao WhatsApp ativa" }), { status: 400, headers });
      }
      // Personalizar com dados ficticios para preview
      const dummyContact = { name: "Joao Silva", nickname: "Joao", company: "Empresa Teste" };
      let personalizedText: string;
      try {
        personalizedText = personalize(templateContent, dummyContact);
      } catch (e) {
        return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Placeholder invalido" }), { status: 400, headers });
      }
      const cleanPhone = phone.replace(/\D/g, "");
      try {
        let sendRes: Response;
        if (mediaUrl && mediaType) {
          const isAudio = mediaType === "audio";
          sendRes = await evoFetch(
            evolutionUrl,
            evolutionKey,
            `/message/${isAudio ? "sendWhatsAppAudio" : "sendMedia"}/${testInstanceId}`,
            isAudio
              ? { number: cleanPhone, audio: mediaUrl }
              : { number: cleanPhone, mediatype: mediaType, media: mediaUrl, caption: personalizedText },
          );
        } else {
          sendRes = await evoFetch(evolutionUrl, evolutionKey, `/message/sendText/${testInstanceId}`, {
            number: cleanPhone, text: personalizedText,
          });
        }
        if (!sendRes.ok) {
          const body = await sendRes.text().catch(() => '');
          return new Response(JSON.stringify({ error: `Evolution retornou ${sendRes.status}: ${body}` }), { status: 502, headers });
        }
        const providerResult = await sendRes.json().catch(() => null);
        const providerMessageId = extractMessageId(providerResult);
        if (!providerMessageId || providerMessageId.length > 512) {
          return new Response(JSON.stringify({ error: "Evolution não confirmou um identificador de entrega" }), { status: 502, headers });
        }
        return new Response(JSON.stringify({ success: true, provider_message_id: providerMessageId }), { headers });
      } catch (e) {
        return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro ao enviar" }), { status: 500, headers });
      }
    }

    // V19: retry manual de um destinatário terminal (failed/outcome_unknown).
    // Não reenvia cego: revalida a supressão e o RPC respeita attempt_count < 3.
    if (action === "retry") {
      const { recipientId } = body as { recipientId?: string };
      if (!recipientId) {
        return new Response(JSON.stringify({ error: "recipientId required" }), { status: 400, headers });
      }
      const { data: retryRecipient, error: retryLookupError } = await supabase
        .from("talkx_recipients")
        .select("id, contact_id, status, attempt_count")
        .eq("id", recipientId)
        .single();
      if (retryLookupError || !retryRecipient) {
        return new Response(JSON.stringify({ error: "Recipient not found" }), { status: 404, headers });
      }
      if (!["failed", "outcome_unknown"].includes(retryRecipient.status as string)) {
        return new Response(JSON.stringify({ error: "Recipient not retryable" }), { status: 409, headers });
      }
      const { data: suppressed, error: suppressionError } = await supabase.rpc("talkx_recipient_is_suppressed", {
        p_contact_id: retryRecipient.contact_id,
        p_phone: null,
      });
      if (suppressionError) {
        return new Response(JSON.stringify({ error: suppressionError.message }), { status: 500, headers });
      }
      if (suppressed === true) {
        return new Response(JSON.stringify({ success: false, reason: "suppressed" }), { headers });
      }
      const { data: retried, error: retryError } = await supabase.rpc("retry_talkx_recipient", {
        p_recipient_id: recipientId,
      });
      if (retryError) {
        return new Response(JSON.stringify({ error: retryError.message }), { status: 409, headers });
      }
      return new Response(JSON.stringify({ success: retried === true }), { headers });
    }

    if (!campaignId) {
      return new Response(JSON.stringify({ error: "campaignId required" }), { status: 400, headers });
    }

    const campaignAction = action ?? "start";

    // Pause/cancel share the same locked database transition used by start.
    // An update without this lock could resurrect a campaign cancelled by a
    // concurrent request between its read and write.
    if (campaignAction === "pause" || campaignAction === "cancel") {
      const { data, error } = await supabase.rpc("transition_talkx_campaign", {
        p_campaign_id: campaignId,
        p_action: campaignAction,
        p_actor_id: actorId,
        p_pause_reason: reason ?? null,
      });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 409, headers });
      }
      const transition = Array.isArray(data) ? data[0] : data;
      return new Response(JSON.stringify({ success: true, status: transition?.current_status }), { headers });
    }

    if (campaignAction !== "start") {
      return new Response(JSON.stringify({ error: "Invalid campaign action" }), { status: 400, headers });
    }

    // Get campaign
    const { data: initialCampaign, error: campErr } = await supabase
      .from("talkx_campaigns").select("*").eq("id", campaignId).single();

    if (campErr || !initialCampaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), { status: 404, headers });
    }
    let campaign = initialCampaign;
    // V20: horário comercial + limite diário por conexão (talkx_settings)
    let businessHours: { start?: string; end?: string; days?: number[] } | null = null;
    let dailyLimit = 0;
    {
      const { data: settingsRows, error: settingsErr } = await supabase
        .from("talkx_settings").select("key, value")
        .in("key", ["business_hours", "daily_limit_per_connection"]);
      if (!settingsErr) {
        for (const row of (settingsRows ?? []) as { key: string; value: string }[]) {
          if (row.key === "business_hours") {
            const parsed = parseBusinessHours(row.value);
            if (parsed) businessHours = parsed;
          } else if (row.key === "daily_limit_per_connection") {
            const n = Number(row.value);
            if (Number.isFinite(n) && n > 0) dailyLimit = n;
          }
        }
      }
    }
    let sentTodayTotal = 0;
    if (dailyLimit > 0) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data: connCampaigns } = await supabase.from("talkx_campaigns")
        .select("id").eq("whatsapp_connection_id", campaign.whatsapp_connection_id);
      const connIds = ((connCampaigns ?? []) as { id: string }[]).map((c) => c.id);
      if (connIds.length > 0) {
        const { count } = await supabase.from("talkx_recipients")
          .select("id", { count: "exact", head: true })
          .in("campaign_id", connIds).gte("sent_at", todayStart.toISOString());
        sentTodayTotal = typeof count === "number" ? count : 0;
      }
    }
    // Get WhatsApp connection instance
    const { data: connection } = await supabase
      .from("whatsapp_connections").select("status, instance_id")
      .eq("id", campaign.whatsapp_connection_id).eq("status", "connected").single();

    const initialInstanceId = liveTalkXInstanceId(connection);
    if (!initialInstanceId) {
      // E91: conexão perdida — pausa automática da campanha
      try {
        await supabase.rpc("transition_talkx_campaign", {
          p_campaign_id: campaignId,
          p_action: "pause",
          p_pause_reason: "connection_lost",
        });
      } catch { /* já pausada ou outro estado — ignora */ }
      // V19: evento connection_failed alimenta a timeline ("Falha de conexão").
      await supabase.from("talkx_campaign_events").insert({
        campaign_id: campaignId,
        event_type: "connection_failed",
        message: "Falha de conexão",
      }).catch(() => {});
      return new Response(JSON.stringify({ error: "WhatsApp connection lost: campaign paused" }), { status: 409, headers });
    }

    // Enforce delivery limits in the selected IANA timezone before the locked
    // transition. An invalid legacy timezone fails closed instead of falling
    // back to Brasília and sending at an unintended local hour.
    const windowStatus = deliveryWindowStatus(campaign, undefined, businessHours);
    if (!windowStatus.allowed) {
      return new Response(JSON.stringify({ ok: false, reason: windowStatus.reason, next_window: windowStatus.next_window }), { headers });
    }

    // The transition RPC locks the campaign row and revalidates the state and
    // minimum launch invariants immediately before any recipient can be claimed.
    const { error: transitionError } = await supabase.rpc("transition_talkx_campaign", {
      p_campaign_id: campaignId,
      p_action: "start",
      p_actor_id: actorId,
    });
    if (transitionError) {
      return new Response(JSON.stringify({ error: transitionError.message }), { status: 409, headers });
    }

    // Get pending recipients with contact info
    const { data: recipients, error: recipientsError } = await supabase
      .from("talkx_recipients")
      .select("*, contacts:contact_id(name, nickname, phone, company)")
      .eq("campaign_id", campaignId)
      .in("status", ["pending", "sending"])
      // E91: exclui recipients cujo retry_after ainda não venceu
      .or("retry_after.is.null,retry_after.lte." + new Date().toISOString())
      .order("created_at");
    if (recipientsError) throw new Error(`talkx_recipients_lookup_failed: ${recipientsError.message}`);

    // E90: link rastreável referenciado por {{link}} no template. Uma campanha
    // pode ter mais de um link cadastrado; o placeholder é único, então usamos
    // o mais antigo como canônico em vez de deixar o {{link}} sem substituição.
    const { data: trackingLink } = await supabase
      .from("talkx_links")
      .select("slug")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const trackingUrlFor = (recipientId: string) =>
      trackingLink?.slug
        ? `${supabaseUrl}/functions/v1/talkx-link?s=${encodeURIComponent(trackingLink.slug)}&r=${encodeURIComponent(recipientId)}`
        : undefined;

    // Valor real de variável customizada (ex.: {{cargo}}) vem de
    // contact_custom_fields, por contato — nunca do template. Antes, o valor
    // "resolvido" era sempre o nome da variável entre colchetes (`[cargo]`),
    // nunca o dado de verdade; e campanha sem template salvo (template_id
    // null) derrubava 100% dos destinatários com unknown_placeholder. Busca
    // única em lote para todos os contact_id da leva atual, não por
    // destinatário.
    const recipientContactIds = Array.from(
      new Set((recipients || []).map((r: { contact_id?: string | null }) => r.contact_id).filter((id: unknown): id is string => typeof id === "string")),
    );
    const customFieldsByContact = new Map<string, Record<string, string>>();
    if (recipientContactIds.length > 0) {
      // .in() serializa cada contact_id (UUID) na URL da requisição — uma leva
      // grande (ex.: 1000 destinatários) geraria ~37KB só de filtro, arriscando
      // rejeição por tamanho de URL no gateway antes mesmo de paginar o
      // resultado (achado do review). Delimita por lote de IDs.
      const CUSTOM_FIELDS_ID_CHUNK_SIZE = 200;
      // PostgREST limita a 1000 linhas por chamada — leva com muitos contatos x
      // campos customizados perderia linhas em silêncio sem paginar (achado do
      // review).
      const CUSTOM_FIELDS_PAGE_SIZE = 1000;
      for (let idOffset = 0; idOffset < recipientContactIds.length; idOffset += CUSTOM_FIELDS_ID_CHUNK_SIZE) {
        const idChunk = recipientContactIds.slice(idOffset, idOffset + CUSTOM_FIELDS_ID_CHUNK_SIZE);
        for (let offset = 0; ; offset += CUSTOM_FIELDS_PAGE_SIZE) {
          // .range() sem .order() não garante ordenação estável entre chamadas —
          // páginas poderiam se sobrepor ou pular linhas (achado do review).
          // Ordena por "field_name" (não só "id"): o índice único de
          // (contact_id, field_name) é case-sensitive, então um contato com
          // "CPF" e "cpf" tem duas linhas reais — o "last write wins" do bucket
          // abaixo precisa escolher a mesma linha que o preview do wizard
          // (useContactCustomFields -> ContactService.fetchCustomFields, que
          // também ordena por field_name), senão o preview mostraria um valor
          // e o envio real mandaria outro (achado do review). "id" entra só
          // como desempate determinístico entre páginas.
          const { data: customFieldRows, error: customFieldsError } = await supabase
            .from("contact_custom_fields")
            .select("contact_id, field_name, field_value")
            .in("contact_id", idChunk)
            .order("field_name", { ascending: true })
            .order("id", { ascending: true })
            .range(offset, offset + CUSTOM_FIELDS_PAGE_SIZE - 1);
          if (customFieldsError) throw new Error(`contact_custom_fields_lookup_failed: ${customFieldsError.message}`);
          for (const row of customFieldRows ?? []) {
            // Campo customizado sem valor preenchido (field_value null) deve cair
            // no fallback "[variavel]" do personalize(), não virar string vazia
            // silenciosa (achado do review).
            if (row.field_value == null) continue;
            // Object.create(null) (não {}): um campo chamado "__proto__" num
            // objeto comum invoca o setter de protótipo em vez de virar
            // propriedade enumerável — o valor real nunca apareceria em
            // Object.entries() (achado do review).
            const bucket = customFieldsByContact.get(row.contact_id) ?? (Object.create(null) as Record<string, string>);
            bucket[row.field_name] = row.field_value;
            customFieldsByContact.set(row.contact_id, bucket);
          }
          if (!customFieldRows || customFieldRows.length < CUSTOM_FIELDS_PAGE_SIZE) break;
        }
      }
    }

    // Check against the source of truth for every recipient. This makes a
    // phone-only, formatted legacy opt-out equivalent to the contact phone
    // and lets us repeat the check immediately before a provider POST.
    const isRecipientSuppressed = async (contactId: string | null, phone: string | null) => {
      const { data, error } = await supabase.rpc("talkx_recipient_is_suppressed", {
        p_contact_id: contactId,
        p_phone: phone,
      });
      if (error || typeof data !== "boolean") {
        throw new Error(`talkx_suppression_check_failed: ${error?.message ?? "invalid_response"}`);
      }
      return data;
    };

    let sentCount = campaign.sent_count || 0;
    let failedCount = campaign.failed_count || 0;
    let blacklistedCount = 0;
    let outcomeUnknownCount = 0;
    let processedCount = 0; // E78: reler parametros a cada RELOAD_EVERY envios
    const RELOAD_EVERY = 20;
    // Cada invocação só pode enviar depois de reivindicar o destinatário no
    // Postgres. O lease impede que dois workers concorrentes disparem para o
    // mesmo contato; uma execução morta expira e pode ser recuperada.
    const workerId = `talkx-send:${crypto.randomUUID()}`;
    // whatsapp-media e bucket privado: a GO so baixa via signed URL (TTL 300s). Uma
    // assinatura serve varios destinatarios; reassina depois de 240s porque campanhas
    // com typingDelay por envio passam do TTL.
    let signedMedia: { url: string; at: number } | null = null;
    const mediaForSend = async () => {
      if (!signedMedia || Date.now() - signedMedia.at > 240_000) {
        signedMedia = { url: await resolvePrivateBucketUrl(supabase, campaign.media_url, undefined, supabaseUrl), at: Date.now() };
      }
      return signedMedia.url;
    };

    for (const recipient of recipients || []) {
      // Re-read the state and send limits before each claim. A single initial
      // check is not enough when a campaign crosses a local-time boundary.
      const { data: currentCampaign, error: currentCampaignError } = await supabase
        .from("talkx_campaigns")
        .select("status, send_interval_min, send_interval_max, typing_delay_min, typing_delay_max, send_window_start, send_window_end, business_hours_only, speed_profile, schedule_timezone")
        .eq("id", campaignId).single();
      if (currentCampaignError) throw new Error(`talkx_campaign_state_lookup_failed: ${currentCampaignError.message}`);
      if (currentCampaign?.status !== "sending") break;
      campaign = { ...campaign, ...currentCampaign };
      const currentWindowStatus = deliveryWindowStatus(campaign, undefined, businessHours);
      if (!currentWindowStatus.allowed) {
        // V03: grava POR QUE pausou — sem isso a retomada automática não tinha
        // como distinguir pausa da janela de pausa do operador.
        const { error: pauseError } = await supabase.rpc("transition_talkx_campaign", {
          p_campaign_id: campaignId,
          p_action: "pause",
          p_pause_reason: pauseReasonForWindow(currentWindowStatus),
        });
        if (pauseError) throw new Error(`talkx_campaign_auto_pause_failed: ${pauseError.message}`);
        break;
      }

      // V20: limite diário por conexão — pausa com motivo diário (scheduler
      // retoma no dia seguinte via AUTO_RESUME_REASONS).
      if (dailyLimit > 0 && sentTodayTotal >= dailyLimit) {
        const { error: dlPauseError } = await supabase.rpc("transition_talkx_campaign", {
          p_campaign_id: campaignId,
          p_action: "pause",
          p_pause_reason: "daily_limit",
        });
        if (dlPauseError) throw new Error(`talkx_daily_limit_pause_failed: ${dlPauseError.message}`);
        break;
      }

      const { data: claimRows, error: claimError } = await supabase.rpc("claim_talkx_recipient", {
        p_campaign_id: campaignId,
        p_recipient_id: recipient.id,
        p_worker: workerId,
        p_lease_seconds: 90,
      });
      if (claimError) throw new Error(`talkx_recipient_claim_failed: ${claimError.message}`);
      const claim = Array.isArray(claimRows) ? claimRows[0] : null;
      // Outro worker já concluiu ou ainda possui o lease deste destinatário.
      if (!claim?.claim_token) continue;

      const contact = recipient.contacts as Record<string, unknown>;
      const recipientPhone = (contact?.phone as string | undefined)?.replace(/\D/g, '');
      if (await isRecipientSuppressed(recipient.contact_id as string | null, recipientPhone ?? null)) {
        const { error: completionError } = await supabase.rpc("complete_talkx_recipient", {
          p_recipient_id: recipient.id,
          p_claim_token: claim.claim_token,
          p_status: "skipped",
          p_error_message: "Contato na lista negra (opt-out)",
        });
        if (completionError) throw new Error(`talkx_recipient_completion_failed: ${completionError.message}`);
        blacklistedCount++;
        continue;
      }
      if (!contact?.phone) {
        const { error: completionError } = await supabase.rpc("complete_talkx_recipient", {
          p_recipient_id: recipient.id,
          p_claim_token: claim.claim_token,
          p_status: "skipped",
          p_error_message: "Sem número de telefone",
        });
        if (completionError) throw new Error(`talkx_recipient_completion_failed: ${completionError.message}`);
        continue;
      }

      // Persist the actual message selected for this recipient before a
      // provider call. A mutable template variant must never change what a
      // retry, audit export, or delayed worker would send later.
      const recipientRecord = recipient as Record<string, unknown>;
      const hasSnapshot = typeof recipientRecord.message_snapshot_at === "string"
        && typeof recipientRecord.personalized_message === "string"
        && recipientRecord.personalized_message.trim().length > 0;
      let personalizedMsg: string;
      let effectiveMediaUrl: string | null;
      let effectiveMediaType: string | null;

      if (hasSnapshot) {
        personalizedMsg = recipientRecord.personalized_message as string;
        effectiveMediaUrl = typeof recipientRecord.media_url_snapshot === "string"
          ? recipientRecord.media_url_snapshot
          : null;
        effectiveMediaType = typeof recipientRecord.media_type_snapshot === "string"
          ? recipientRecord.media_type_snapshot
          : null;
      } else {
        const existingVid = typeof recipientRecord.variant_id === "string" ? recipientRecord.variant_id : null;
        const legacyPersonalizedMessage = typeof recipientRecord.personalized_message === "string"
          && recipientRecord.personalized_message.trim().length > 0
          ? recipientRecord.personalized_message
          : null;
        let variant: { id: string; content: string; media_url: string | null; media_type: string | null; weight?: number } | null = null;
        if (existingVid) {
          const { data: vData, error: vErr } = await supabase
            .from('talkx_template_variants').select('id,content,media_url,media_type,weight')
            .eq('id', existingVid).single();
          if (vErr || !vData) {
            // A legacy worker may already have persisted the exact text. In
            // that case retain it; otherwise fail closed rather than silently
            // fall back to a changed campaign template.
            if (!legacyPersonalizedMessage) {
              throw new Error(`talkx_variant_snapshot_source_unavailable: ${vErr?.message ?? "variant_not_found"}`);
            }
          } else {
            variant = vData;
          }
        } else if (campaign.template_id) {
          variant = await pickVariant(supabase, campaign.template_id);
        }

        const contentToSend = legacyPersonalizedMessage ?? variant?.content ?? campaign.message_template;
        const candidateMediaUrl = variant?.media_url ?? campaign.media_url ?? null;
        const candidateMediaType = variant?.media_type ?? campaign.media_type ?? null;
        if ((candidateMediaUrl === null) !== (candidateMediaType === null)) {
          throw new Error("talkx_invalid_media_snapshot_source");
        }
        let calculatedMessage: string;
        const customValues = customFieldsByContact.get(recipient.contact_id as string) ?? {};
        try {
          calculatedMessage = legacyPersonalizedMessage ?? personalize(
            contentToSend,
            contact as { name: string; nickname?: string; company?: string },
            customValues,
            typeof campaign.schedule_timezone === "string" ? campaign.schedule_timezone : DEFAULT_SCHEDULE_TIMEZONE,
            trackingUrlFor(recipient.id as string),
          );
        } catch (e) {
          // Placeholder desconhecido no roteiro: falha permanente deste destinatário (não do
          // provedor, nenhum POST foi feito). Não pode derrubar o lote inteiro nem deixar
          // "{{...}}" vazar para a mensagem real dos demais destinatários já processados.
          const { error: completionError } = await supabase.rpc("complete_talkx_recipient", {
            p_recipient_id: recipient.id,
            p_claim_token: claim.claim_token,
            p_status: "failed",
            p_error_message: e instanceof Error ? e.message : "Erro ao montar mensagem",
          });
          if (completionError) throw new Error(`talkx_recipient_completion_failed: ${completionError.message}`);
          failedCount++;
          processedCount++;
          continue;
        }
        const { data: snapshotRows, error: snapshotError } = await supabase.rpc("persist_talkx_recipient_message_snapshot", {
          p_recipient_id: recipient.id,
          p_claim_token: claim.claim_token,
          p_personalized_message: calculatedMessage,
          p_media_url: candidateMediaUrl,
          p_media_type: candidateMediaType,
          p_variant_id: variant?.id ?? existingVid,
        });
        if (snapshotError) throw new Error(`talkx_message_snapshot_failed: ${snapshotError.message}`);
        const snapshot = Array.isArray(snapshotRows) ? snapshotRows[0] as Record<string, unknown> | undefined : undefined;
        if (!snapshot || typeof snapshot.personalized_message !== "string") {
          throw new Error("talkx_message_snapshot_invalid_response");
        }
        personalizedMsg = snapshot.personalized_message;
        effectiveMediaUrl = typeof snapshot.media_url_snapshot === "string" ? snapshot.media_url_snapshot : null;
        effectiveMediaType = typeof snapshot.media_type_snapshot === "string" ? snapshot.media_type_snapshot : null;
      }
      if ((effectiveMediaUrl === null) !== (effectiveMediaType === null)) {
        throw new Error("talkx_invalid_persisted_media_snapshot");
      }
      const recipientHasMedia = effectiveMediaUrl !== null && effectiveMediaType !== null;

      let providerPostAttempted = false;
      // Precisa viver fora do try: o catch chama clearTimeout(sendTimeout) para
      // qualquer erro dentro do try, inclusive os lançados antes da linha que
      // cria o timeout — declarado como `const` dentro do try, essa variável
      // não existia no escopo do catch (ReferenceError em runtime a cada erro
      // pré-dispatch, mascarando o erro original em vez de acionar o backoff).
      let sendTimeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const phone = (contact.phone as string).replace(/\D/g, "");
        const typingDelay = randomBetween(campaign.typing_delay_min, campaign.typing_delay_max);

        try {
          await evoFetch(evolutionUrl, evolutionKey,
            `/chat/updatePresence/${initialInstanceId}`,
            { number: phone, presence: "composing" });
        } catch { /* Presence update is best-effort */ }

        await sleep(typingDelay);

        // Pause/cancel can race with the presence update or typing delay. Do
        // not begin a provider POST after the campaign has left `sending`.
        const { data: beforeSend, error: beforeSendError } = await supabase
          .from("talkx_campaigns")
          .select("status, send_window_start, send_window_end, business_hours_only, schedule_timezone")
          .eq("id", campaignId).single();
        if (beforeSendError) throw new Error(`talkx_campaign_state_lookup_failed: ${beforeSendError.message}`);
        const beforeSendWindowStatus = beforeSend ? deliveryWindowStatus(beforeSend, undefined, businessHours) : { allowed: false as const, reason: "campaign_not_found" };
        const { data: beforeSendConnection, error: beforeSendConnectionError } = await supabase
          .from("whatsapp_connections")
          .select("status, instance_id")
          .eq("id", campaign.whatsapp_connection_id)
          .maybeSingle();
        if (beforeSendConnectionError) throw new Error(`talkx_connection_state_lookup_failed: ${beforeSendConnectionError.message}`);
        const beforeSendInstanceId = liveTalkXInstanceId(beforeSendConnection);
        if (beforeSend?.status !== "sending" || !beforeSendWindowStatus.allowed || !beforeSendInstanceId) {
          if (beforeSend?.status === "sending") {
            // V03: mesmo cuidado do mid-loop — o motivo gravado diz se a pausa
            // foi da janela ou da conexão (era nulo nos dois casos).
            const autoPauseReason = !beforeSendWindowStatus.allowed
              ? pauseReasonForWindow(beforeSendWindowStatus)
              : "connection_lost";
            const { error: pauseError } = await supabase.rpc("transition_talkx_campaign", {
              p_campaign_id: campaignId,
              p_action: "pause",
              p_pause_reason: autoPauseReason,
            });
            if (pauseError) throw new Error(`talkx_campaign_auto_pause_failed: ${pauseError.message}`);
            if (autoPauseReason === "connection_lost") {
              await supabase.from("talkx_campaign_events").insert({
                campaign_id: campaignId,
                event_type: "connection_failed",
                message: "Falha de conexão",
              }).catch(() => {});
            }
          }
          if (!beforeSendInstanceId) {
            log.warn("Campanha pausada: conexão WhatsApp indisponível antes do envio", { correlationId, campaignId });
          }
          const { data: released, error: releaseError } = await supabase.rpc("release_talkx_recipient_claim", {
            p_recipient_id: recipient.id,
            p_claim_token: claim.claim_token,
          });
          if (releaseError || released !== true) {
            throw new Error(`talkx_recipient_claim_release_failed: ${releaseError?.message ?? "claim_not_owned"}`);
          }
          break;
        }

        // A contact may opt out after this worker claimed its lease, while it
        // was waiting for the humanized typing delay. Recheck the normalized,
        // server-side predicate immediately before a provider request.
        if (await isRecipientSuppressed(recipient.contact_id as string | null, recipientPhone ?? null)) {
          const { error: completionError } = await supabase.rpc("complete_talkx_recipient", {
            p_recipient_id: recipient.id,
            p_claim_token: claim.claim_token,
            p_status: "skipped",
            p_error_message: "Contato na lista negra (opt-out)",
          });
          if (completionError) throw new Error(`talkx_recipient_completion_failed: ${completionError.message}`);
          blacklistedCount++;
          continue;
        }

        let sendResponse: Response;
        const markProviderDispatch = async () => {
          const { error } = await supabase.rpc("mark_talkx_recipient_dispatch_started", {
            p_recipient_id: recipient.id,
            p_claim_token: claim.claim_token,
          });
          if (error) throw new Error(`talkx_provider_dispatch_mark_failed: ${error.message}`);
        };

        // E91: timeout de segurança por envio
        const abortCtrl = new AbortController();
        sendTimeout = setTimeout(() => abortCtrl.abort(), 20_000);

        if (recipientHasMedia) {
          const mediaEndpoint = getMediaEndpoint(effectiveMediaType!);
          const mediaSource = (effectiveMediaUrl !== campaign.media_url)
            ? await resolvePrivateBucketUrl(supabase, effectiveMediaUrl!, undefined, supabaseUrl)
            : await mediaForSend();
          await markProviderDispatch();
          providerPostAttempted = true;
          sendResponse = await evoFetch(evolutionUrl, evolutionKey,
            `/message/${mediaEndpoint}/${beforeSendInstanceId}`,
            effectiveMediaType === "audio"
              ? { number: phone, audio: mediaSource, delay: 0 }
              : { number: phone, mediatype: effectiveMediaType!, media: mediaSource, caption: personalizedMsg, delay: 0 },
            undefined, undefined, abortCtrl.signal,
          );
        } else {
          await markProviderDispatch();
          providerPostAttempted = true;
          sendResponse = await evoFetch(evolutionUrl, evolutionKey,
            `/message/sendText/${beforeSendInstanceId}`,
            { number: phone, text: personalizedMsg, delay: 0 },
            undefined, undefined, abortCtrl.signal,
          );
        }
        clearTimeout(sendTimeout);

        // POST retries are unsafe without a provider idempotency contract. A
        // 5xx/connection/parser ambiguity keeps the lease for reconciliation
        // instead of classifying or resending a message blindly.
        if (sendResponse.status >= 500) {
          throw new Error(`talkx_provider_outcome_unknown: HTTP ${sendResponse.status}`);
        }
        let sendResult: Record<string, unknown>;
        try {
          sendResult = await sendResponse.json();
        } catch {
          throw new Error("talkx_provider_outcome_unknown: invalid_response_body");
        }

        const providerMessageId = extractMessageId(sendResult);
        if (sendResponse.ok && !sendResult.error && providerMessageId && providerMessageId.length <= 512) {
          sentCount++;
          sentTodayTotal++;
          const { error: completionError } = await supabase.rpc("record_talkx_recipient_sent", {
            p_recipient_id: recipient.id,
            p_claim_token: claim.claim_token,
            p_external_id: providerMessageId,
          });
          if (completionError) throw new Error(`talkx_recipient_completion_failed: ${completionError.message}`);
        } else if (sendResponse.ok && !sendResult.error) {
          throw new Error("talkx_provider_outcome_unknown: missing_provider_message_id");
        } else {
          failedCount++;
          const { error: completionError } = await supabase.rpc("complete_talkx_recipient", {
            p_recipient_id: recipient.id,
            p_claim_token: claim.claim_token,
            p_status: "failed",
            p_error_message: String(sendResult?.message || sendResult?.error || "Erro ao enviar"),
          });
          if (completionError) throw new Error(`talkx_recipient_completion_failed: ${completionError.message}`);
        }
      } catch (err) {
        clearTimeout(sendTimeout);
        // E91: erro antes do POST ao provedor — pode reagendar com backoff
        if (!providerPostAttempted) {
          const backoffMs = [30_000, 120_000, 600_000];
          const attemptSoFar = typeof (recipient as Record<string, unknown>).attempt_count === 'number'
            ? (recipient as Record<string, unknown>).attempt_count as number
            : 0;
          const delayMs = backoffMs[Math.min(attemptSoFar, backoffMs.length - 1)];
          const retryAfter = new Date(Date.now() + delayMs).toISOString();
          const reason = err instanceof Error ? err.message : "pre_dispatch_error";
          const { data: schedResult } = await supabase.rpc("reschedule_talkx_recipient", {
            p_recipient_id: recipient.id,
            p_claim_token: claim.claim_token,
            p_retry_after: retryAfter,
            p_error_message: reason.slice(0, 500),
          });
          if (schedResult?.action === 'dead_lettered') failedCount++;
          processedCount++;
          const interval = randomBetween(campaign.send_interval_min, campaign.send_interval_max);
          await sleep(interval);
          continue;
        }
        // A chamada ao provedor pode ter sido aceita quando a confirmação no
        // banco falhou. Ela nunca pode voltar automaticamente para `pending`:
        // ao expirar o lease, isso permitiria um segundo POST ao mesmo número.
        if (providerPostAttempted) {
          const reason = err instanceof Error ? err.message : "request_failed";
          const attemptSoFar = typeof (recipient as Record<string, unknown>).attempt_count === 'number'
            ? (recipient as Record<string, unknown>).attempt_count as number
            : 0;
          log.warn("Destinatário em quarentena (outcome_unknown)", { correlationId, campaignId, recipient_id: recipient.id, attempt: attemptSoFar });
          const { error: quarantineError } = await supabase.rpc("complete_talkx_recipient", {
            p_recipient_id: recipient.id,
            p_claim_token: claim.claim_token,
            p_status: "outcome_unknown",
            p_error_message: `Provider outcome unknown: ${reason}`.slice(0, 1000),
          });
          if (quarantineError) {
            // Do not lie about the outcome. A failed quarantine keeps the
            // lease intact, so it remains visible instead of being retried in
            // the same invocation.
            throw new Error(`talkx_recipient_quarantine_failed: ${quarantineError.message}`);
          }
          outcomeUnknownCount++;
          processedCount++;
          const interval = randomBetween(campaign.send_interval_min, campaign.send_interval_max);
          await sleep(interval);
          continue;
        }
        failedCount++;
        const { error: completionError } = await supabase.rpc("complete_talkx_recipient", {
          p_recipient_id: recipient.id,
          p_claim_token: claim.claim_token,
          p_status: "failed",
          p_error_message: err instanceof Error ? err.message : "Erro desconhecido",
        });
        if (completionError) throw new Error(`talkx_recipient_failure_completion_failed: ${completionError.message}`);
      }

      processedCount++;
      // E78: reler parametros de campanha a cada RELOAD_EVERY envios
      if (processedCount % RELOAD_EVERY === 0) {
        const { data: fresh } = await supabase
          .from("talkx_campaigns")
          .select("send_interval_min, send_interval_max, typing_delay_min, typing_delay_max, send_window_start, send_window_end, business_hours_only, speed_profile, schedule_timezone")
          .eq("id", campaignId).single();
        if (fresh) {
          campaign = { ...campaign, ...fresh };
          // Recheck the campaign's own IANA window after configuration reload.
          // The locked transition preserves a concurrent manual pause/cancel.
          const refreshedWindowStatus = deliveryWindowStatus(campaign, undefined, businessHours);
          if (!refreshedWindowStatus.allowed) {
            log.warn('Campanha pausada automaticamente: fora da janela de envio', { correlationId, campaignId });
            const { error: pauseError } = await supabase.rpc("transition_talkx_campaign", {
              p_campaign_id: campaignId,
              p_action: "pause",
              p_pause_reason: pauseReasonForWindow(refreshedWindowStatus),
            });
            if (pauseError) throw new Error(`talkx_campaign_auto_pause_failed: ${pauseError.message}`);
            break;
          }
        }
      }
      const sendInterval = randomBetween(campaign.send_interval_min, campaign.send_interval_max);
      await sleep(sendInterval);
    }

    const { data: completed, error: completionError } = await supabase.rpc(
      "complete_talkx_campaign_if_drained",
      { p_campaign_id: campaignId },
    );
    if (completionError) throw new Error(`talkx_campaign_completion_failed: ${completionError.message}`);

    log.done(200, { correlationId, campaignId, sent: sentCount, failed: failedCount, outcomeUnknown: outcomeUnknownCount });

    return new Response(
      JSON.stringify({
        success: true, sent: sentCount, failed: failedCount,
        total: (recipients || []).length,
        blacklisted: blacklistedCount,
        outcome_unknown: outcomeUnknownCount,
        completed: completed === true,
      }),
      { headers }
    );
  } catch (err) {
    log.error("Talk X error", { correlationId, error: err instanceof Error ? err.message : String(err) });
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers }
    );
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleTalkxSend(req));
}
