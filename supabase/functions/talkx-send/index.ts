/**
 * Talk X — Humanized bulk messaging edge function
 * Simulates typing, personalized messages with {{nome}}, {{apelido}}, {{empresa}}, {{saudacao}}
 * Supports text + media (image, video, document, audio)
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { getCorsHeaders, handleCors, Logger } from "../_shared/validation.ts";
import { evoFetch, extractMessageId } from "../_shared/evolution-send.ts";
import { DEFAULT_SCHEDULE_TIMEZONE, deliveryWindowStatus, parseBusinessHours } from "../_shared/talkx-window.ts";
import { pauseReasonForWindow } from "../_shared/talkx-resume-policy.ts";
import { resolvePrivateBucketUrl } from "../_shared/evolution-api-proxy.ts";
import { liveTalkXInstanceId } from "../_shared/talkx-delivery-connection.ts";
import { timingSafeEqual } from "../_shared/hmac-validation.ts";
import {
  newCorrelationId,
  personalize,
  randomBetween,
  sleep,
} from "../_shared/messaging/index.ts";
import {
  processRecipient,
  type ProcessRecipientRow,
  type ProcessResult,
} from "./process-recipient.ts";

// F43: as duplicatas locais (`randomBetween`, `sleep`, `getMediaEndpoint`) foram
// removidas — vêm do kernel compartilhado. `personalize` (F37) segue reexportado,
// junto com `randomBetween`, para não quebrar os importadores deste módulo
// (index.test.ts importa ambos daqui).
export { personalize, randomBetween };

/**
 * IA-047 — chave estável (SHA-256 em hex) do pedido de envio de TESTE, derivada
 * dos campos que definem o pedido. Determinística: o mesmo pedido produz a MESMA
 * chave, então repetir o clique cai na UNIQUE de `talkx_test_send_claims`.
 */
async function deriveTestSendKey(parts: Array<string | null | undefined>): Promise<string> {
  const data = new TextEncoder().encode(parts.map((p) => p ?? "").join("\u0000"));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

    // Auth: x-cron-secret (pg_cron, sem Bearer) OU service-role key OU JWT admin/supervisor.
    // O x-cron-secret é conferido ANTES do guard de Bearer porque o tick do motor
    // (X012) leva o Bearer da anon key — exigido pelo gateway (verify_jwt=true) —
    // e a anon key não é a service key: sem esse curto-circuito o cron levaria 401.
    const authHeader = req.headers.get("Authorization");
    const cronSecretHeader = req.headers.get("x-cron-secret");
    let isCronAuth = false;
    if (cronSecretHeader) {
      const { data: vaultSecret, error: rpcError } = await supabase.rpc("get_talkx_cron_secret");
      if (!rpcError && typeof vaultSecret === "string") {
        isCronAuth = timingSafeEqual(cronSecretHeader, vaultSecret);
      }
    }
    // V12: ator da transição — perfil do JWT (quando não é service key) ou null (worker).
    let actorId: string | null = null;
    let isServiceKey = false;
    if (!isCronAuth) {
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
      }
      const token = authHeader.slice(7);
      // Comparação constant-time: `===` retorna cedo no primeiro byte diferente e vaza timing.
      isServiceKey = timingSafeEqual(token, serviceKey);
      if (!isServiceKey) {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
        }
        // X013: a RPC pública resolve admin/supervisor numa linha booleana. O
        // `.in([...]).maybeSingle()` antigo devolvia DUAS linhas (e virava erro
        // → 403) para quem tem admin E supervisor ao mesmo tempo.
        const { data: isPrivileged, error: roleError } = await supabase.rpc(
          "is_admin_or_supervisor",
          { _user_id: user.id },
        );
        if (roleError || isPrivileged !== true) {
          return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
        }
        // X025: a transição grava `actor_id`, que é FK para `profiles.id` — logo
        // o ator tem de ser o profiles.id do JWT, NÃO o auth.users.id. Perfil
        // ausente/inativo ⇒ ator nulo (o evento sai sem autor, como no worker).
        const { data: actorProfile, error: actorProfileError } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .maybeSingle();
        if (actorProfileError) {
          log.warn("Falha ao resolver o perfil do ator da transição", { correlationId, error: actorProfileError.message });
        } else if (actorProfile && typeof (actorProfile as { id?: unknown }).id === "string") {
          actorId = (actorProfile as { id: string }).id;
        }
      }
    }

    const body = await req.json();
    const { campaignId, action, reason } = body;

    // E47: action test --- envia template de teste para um numero
    if (action === "test") {
      // customVariables (nomes) e aceito no corpo por retrocompatibilidade com o
      // frontend, mas nao e mais necessario: qualquer placeholder sem valor real
      // vira "[nome]" automaticamente (ver personalize()).
      const { templateContent, mediaUrl, mediaType, phone, idempotencyKey } = body as {
        templateContent: string;
        mediaUrl?: string | null;
        mediaType?: string | null;
        phone: string;
        idempotencyKey?: string | null;
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
        personalizedText = personalize(templateContent, dummyContact).text;
      } catch (e) {
        return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Placeholder invalido" }), { status: 400, headers });
      }
      const cleanPhone = phone.replace(/\D/g, "");

      // IA-047: chave estável do envio de teste. Preferimos a chave do cliente
      // (idempotencyKey) — o front a deriva uma vez por clique; sem ela, o hash
      // do pedido (instância + telefone + template + mídia) faz o mesmo papel.
      // Repetir o mesmo pedido NÃO pode virar um segundo POST ao provedor.
      const requestKey = idempotencyKey && idempotencyKey.trim() !== ""
        ? idempotencyKey.trim()
        : await deriveTestSendKey([testInstanceId, cleanPhone, templateContent, mediaUrl ?? "", mediaType ?? ""]);

      // Claim ANTES do POST: quem registra primeiro envia; a repetição cai na
      // UNIQUE (23505) e é resolvida SEM tocar o provedor de novo.
      const { error: claimError } = await supabase
        .from("talkx_test_send_claims")
        .insert({ request_key: requestKey });

      if (claimError && (claimError as { code?: string }).code === "23505") {
        const { data: existing, error: lookupError } = await supabase
          .from("talkx_test_send_claims")
          .select("provider_message_id")
          .eq("request_key", requestKey)
          .maybeSingle();
        if (lookupError) {
          return new Response(JSON.stringify({ error: `claim_lookup_failed: ${lookupError.message}` }), { status: 500, headers });
        }
        const jaEnviado = (existing as { provider_message_id?: string | null } | null)?.provider_message_id;
        if (typeof jaEnviado === "string" && jaEnviado.length > 0) {
          // Repetição de um envio já confirmado: devolve o MESMO id, sem POST.
          return new Response(JSON.stringify({ success: true, provider_message_id: jaEnviado, idempotent: true }), { headers });
        }
        // Claim registrado mas ainda não confirmado (duplo clique simultâneo):
        // NÃO reenvia — o primeiro request é quem manda.
        return new Response(JSON.stringify({ success: true, pending: true, idempotent: true }), { status: 202, headers });
      }
      if (claimError) {
        return new Response(JSON.stringify({ error: `claim_failed: ${claimError.message}` }), { status: 500, headers });
      }

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
          const errBody = await sendRes.text().catch(() => '');
          // Resposta DEFINITIVA de falha: o provedor não entregou — libera o claim
          // para permitir um retry deliberado (não houve efeito externo).
          await supabase.from("talkx_test_send_claims").delete().eq("request_key", requestKey);
          return new Response(JSON.stringify({ error: `Evolution retornou ${sendRes.status}: ${errBody}` }), { status: 502, headers });
        }
        const providerResult = await sendRes.json().catch(() => null);
        const providerMessageId = extractMessageId(providerResult);
        if (!providerMessageId || providerMessageId.length > 512) {
          return new Response(JSON.stringify({ error: "Evolution não confirmou um identificador de entrega" }), { status: 502, headers });
        }
        // Confirma no claim: a próxima repetição devolve este id SEM novo POST.
        await supabase
          .from("talkx_test_send_claims")
          .update({ provider_message_id: providerMessageId, sent_at: new Date().toISOString() })
          .eq("request_key", requestKey);
        return new Response(JSON.stringify({ success: true, provider_message_id: providerMessageId }), { headers });
      } catch (e) {
        // Exceção (rede/timeout): o efeito externo ficou INDETERMINADO, então o
        // claim NÃO é liberado — repetir não pode virar um segundo POST (não se
        // presume exactly-once externo).
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

    // X025: status ATUAL da conexão para o evento `connection_failed`. O SELECT
    // que valida o envio filtra por `status = 'connected'` e, numa queda, volta
    // vazio — por isso a leitura do status é feita SEM esse filtro.
    const readConnectionStatus = async (connectionId: unknown): Promise<string> => {
      if (typeof connectionId !== "string") return "unknown";
      const { data } = await supabase
        .from("whatsapp_connections").select("status").eq("id", connectionId).maybeSingle();
      const status = (data as { status?: unknown } | null)?.status;
      return typeof status === "string" ? status : "unknown";
    };

    // Pause/cancel share the same locked database transition used by start.
    // An update without this lock could resurrect a campaign cancelled by a
    // concurrent request between its read and write.
    if (campaignAction === "pause" || campaignAction === "cancel") {
      // X025: o motivo vem do corpo e vira a mensagem do evento `paused`; o
      // servidor não aceita motivo acima de 500 caracteres (mesmo teto do resto
      // do motor).
      const pauseReason = typeof reason === "string" ? reason : null;
      if (pauseReason !== null && pauseReason.length > 500) {
        return new Response(JSON.stringify({ error: "reason_too_long" }), { status: 400, headers });
      }
      const { data, error } = await supabase.rpc("transition_talkx_campaign", {
        p_campaign_id: campaignId,
        p_action: campaignAction,
        p_actor_id: actorId,
        p_pause_reason: pauseReason,
      });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 409, headers });
      }
      const transition = Array.isArray(data) ? data[0] : data;
      return new Response(JSON.stringify({ success: true, status: transition?.current_status }), { headers });
    }

    // ---------------------------------------------------------------------
    // Helpers compartilhados entre start e continue (X011).
    // ---------------------------------------------------------------------

    const loadBusinessHoursAndDailyLimit = async (): Promise<{
      businessHours: { start?: string; end?: string; days?: number[] } | null;
      dailyLimit: number;
    }> => {
      let businessHours: { start?: string; end?: string; days?: number[] } | null = null;
      let dailyLimit = 0;
      const { data: settingsRows, error: settingsErr } = await supabase
        .from("talkx_settings").select("key, value")
        .in("key", ["business_hours", "daily_limit_per_connection"]);
      if (!settingsErr) {
        // #121A: `talkx_settings.value` é JSONB — `business_hours` chega como
        // OBJETO `{start,end,tz,days}` (string JSON só por compatibilidade).
        // Valor presente e inválido entra marcado e FECHA a janela, em vez de
        // cair silenciosamente no default.
        for (const row of (settingsRows ?? []) as { key: string; value: unknown }[]) {
          if (row.key === "business_hours") {
            const parsed = parseBusinessHours(row.value);
            if (parsed) businessHours = parsed;
          } else if (row.key === "daily_limit_per_connection") {
            const n = Number(row.value);
            if (Number.isFinite(n) && n > 0) dailyLimit = n;
          }
        }
      }
      return { businessHours, dailyLimit };
    };

    const countSentTodayForConnection = async (whatsappConnectionId: string): Promise<number> => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data: connCampaigns } = await supabase.from("talkx_campaigns")
        .select("id").eq("whatsapp_connection_id", whatsappConnectionId);
      const connIds = ((connCampaigns ?? []) as { id: string }[]).map((c) => c.id);
      if (connIds.length === 0) return 0;
      const { count } = await supabase.from("talkx_recipients")
        .select("id", { count: "exact", head: true })
        .in("campaign_id", connIds).gte("sent_at", todayStart.toISOString());
      return typeof count === "number" ? count : 0;
    };

    // X019: orçamento por minuto/dia da conexão (Talk X + Multiplix), vindo da
    // RPC da X018 — substitui a contagem só-diária da V20 por minuto + dia.
    type ConnectionBudget = {
      minute_limit: number;
      minute_sent: number;
      minute_remaining: number;
      day_limit: number;
      day_sent: number;
      day_remaining: number;
      next_day_at: string | null;
    };
    const loadConnectionBudget = async (whatsappConnectionId: string): Promise<ConnectionBudget> => {
      const { data, error } = await supabase.rpc("talkx_connection_send_budget", {
        p_connection_id: whatsappConnectionId,
      });
      if (error) throw new Error(`talkx_connection_budget_failed: ${error.message}`);
      const b = (data ?? {}) as Record<string, unknown>;
      return {
        minute_limit: Number(b.minute_limit ?? 0),
        minute_sent: Number(b.minute_sent ?? 0),
        minute_remaining: Number(b.minute_remaining ?? 0),
        day_limit: Number(b.day_limit ?? 0),
        day_sent: Number(b.day_sent ?? 0),
        day_remaining: Number(b.day_remaining ?? 0),
        next_day_at: typeof b.next_day_at === "string" ? b.next_day_at : null,
      };
    };

    // E90: link rastreável referenciado por {{link}} no template. Uma campanha
    // pode ter mais de um link cadastrado; o placeholder é único, então usamos
    // o mais antigo como canônico em vez de deixar o {{link}} sem substituição.
    // X020: a base da URL passa a vir de TALKX_LINK_BASE_URL (sem o secret,
    // mantém a URL atual do projeto). O secret nunca é interpolado no texto.
    // X022: {{link:rotulo}} referencia um link pelo rótulo — vários por mensagem.
    // Com o domínio próprio, a URL é /l/:slug (rewrite no vercel.json); sem ele,
    // cai no caminho direto da edge (?s=...&r=...).
    const loadTrackingLinks = async (): Promise<{
      trackingUrlFor: (recipientId: string) => string | undefined;
      linksByLabelFor: (recipientId: string) => Record<string, string>;
    }> => {
      const { data: links } = await supabase
        .from("talkx_links")
        .select("slug, label")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: true });
      const configuredBase = (Deno.env.get("TALKX_LINK_BASE_URL") ?? "").trim().replace(/\/+$/, "");
      const urlFor = (slug: string, recipientId: string) =>
        configuredBase.length > 0
          ? `${configuredBase}/l/${encodeURIComponent(slug)}?r=${encodeURIComponent(recipientId)}`
          : `${supabaseUrl}/functions/v1/talkx-link?s=${encodeURIComponent(slug)}&r=${encodeURIComponent(recipientId)}`;
      const rows = (links ?? []) as { slug?: unknown; label?: unknown }[];
      const oldestSlug = typeof rows[0]?.slug === "string" ? rows[0].slug : undefined;
      const slugByLabel = new Map<string, string>();
      for (const row of rows) {
        if (typeof row.slug === "string" && typeof row.label === "string" && row.label.trim()) {
          slugByLabel.set(row.label.trim().toLowerCase(), row.slug);
        }
      }
      const trackingUrlFor = (recipientId: string) =>
        oldestSlug ? urlFor(oldestSlug, recipientId) : undefined;
      const linksByLabelFor = (recipientId: string) => {
        const out: Record<string, string> = {};
        for (const [label, slug] of slugByLabel) out[label] = urlFor(slug, recipientId);
        return out;
      };
      return { trackingUrlFor, linksByLabelFor };
    };

    // X022: rótulos de link cadastrados na campanha. {{link:rotulo}} com rótulo
    // registrado é "known" no lançamento; rótulo não cadastrado vira "unknown" e
    // bloqueia o lançamento (CAP-074) — nunca sai "[link:rotulo]" no cliente.
    const loadLinkLabels = async (): Promise<Record<string, string>> => {
      const { data } = await supabase
        .from("talkx_links")
        .select("label")
        .eq("campaign_id", campaignId);
      const out: Record<string, string> = {};
      for (const row of (data ?? []) as { label?: unknown }[]) {
        if (typeof row.label === "string" && row.label.trim() !== "") {
          out[row.label.trim().toLowerCase()] = "https://talkx-link.example/__probe__";
        }
      }
      return out;
    };

    // X020: nomes de campos customizados que EXISTEM no CRM (qualquer contato).
    // Um placeholder com um desses nomes não é "desconhecido". Best-effort: uma
    // falha de leitura não pode impedir o lançamento (o pior caso é o próprio
    // personalize marcar a chave e o destinatário virar skipped, nunca
    // "{{xpto}}" vazando).
    const loadKnownCustomFieldNames = async (): Promise<Set<string>> => {
      const names = new Set<string>();
      const PAGE = 1000;
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await supabase
          .from("contact_custom_fields")
          .select("field_name")
          .order("id", { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (error) break;
        for (const row of (data ?? []) as { field_name?: unknown }[]) {
          if (typeof row.field_name === "string" && row.field_name.trim() !== "") {
            names.add(row.field_name.toLowerCase());
          }
        }
        if (!data || data.length < PAGE) break;
      }
      return names;
    };

    // X020: todos os textos que a campanha pode enviar (texto próprio, conteúdo
    // do template e variantes) — a validação de variável desconhecida cobre
    // qualquer um deles.
    const loadCampaignTemplateTexts = async (campaignRow: Record<string, unknown>): Promise<string[]> => {
      const texts: string[] = [];
      if (typeof campaignRow.message_template === "string" && campaignRow.message_template.trim() !== "") {
        texts.push(campaignRow.message_template);
      }
      if (campaignRow.template_id) {
        const { data: templateRow } = await supabase
          .from("talkx_templates").select("content").eq("id", campaignRow.template_id).maybeSingle();
        const templateContent = (templateRow as { content?: unknown } | null)?.content;
        if (typeof templateContent === "string") texts.push(templateContent);
        const { data: variantRows } = await supabase
          .from("talkx_template_variants").select("content").eq("template_id", campaignRow.template_id);
        for (const v of (variantRows ?? []) as { content?: unknown }[]) {
          if (typeof v.content === "string") texts.push(v.content);
        }
      }
      return texts;
    };

    // Valor real de variável customizada (ex.: {{cargo}}) vem de
    // contact_custom_fields, por contato — nunca do template. Antes, o valor
    // "resolvido" era sempre o nome da variável entre colchetes (`[cargo]`),
    // nunca o dado de verdade; e campanha sem template salvo (template_id
    // null) derrubava 100% dos destinatários com unknown_placeholder. Busca
    // única em lote para todos os contact_id da leva atual, não por
    // destinatário. X011: a pré-carga passou a ser POR PASSADA no `continue`.
    const loadCustomFieldsByContact = async (
      rows: ProcessRecipientRow[],
    ): Promise<Map<string, Record<string, string>>> => {
      const recipientContactIds = Array.from(
        new Set(rows.map((r) => r.contact_id).filter((id): id is string => typeof id === "string")),
      );
      const customFieldsByContact = new Map<string, Record<string, string>>();
      if (recipientContactIds.length === 0) return customFieldsByContact;
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
      return customFieldsByContact;
    };

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

    // Estado mutável do motor (compartilhado entre start e continue): a campanha
    // relida a cada destinatário e os contadores que a resposta reporta.
    // X033 — linha de log por destinatário, acumulada na passada e gravada em
    // lote no fim dela (talkx_delivery_log). Só ids/códigos/métricas: nunca
    // telefone nem texto de mensagem.
    interface DeliveryLogEntry {
      campaign_id: string;
      recipient_id: string;
      attempt: number;
      stage: string;
      outcome: string;
      http_status: number | null;
      error_code: string | null;
      worker_id: string;
      duration_ms: number;
    }

    interface EngineState {
      campaign: Record<string, unknown>;
      businessHours: { start?: string; end?: string; days?: number[] } | null;
      dailyLimit: number;
      sentTodayTotal: number;
      minuteLimit: number;
      minuteRemaining: number;
      dayRemaining: number;
      sent: number;
      failed: number;
      blacklisted: number;
      outcomeUnknown: number;
      processed: number;
      handled: number;
      workerId: string;
      initialInstanceId: string;
      instanceToken: string | null;
      evolutionUrl: string;
      evolutionKey: string;
      supabaseUrl: string;
      trackingUrlFor: (recipientId: string) => string | undefined;
      linksByLabelFor: (recipientId: string) => Record<string, string>;
      mediaForSend: () => Promise<string>;
      deliveryLogs: DeliveryLogEntry[];
    }

    // E78: reler parametros a cada RELOAD_EVERY envios
    const RELOAD_EVERY = 20;

    const pauseCampaign = async (pauseReason: string | null) => {
      const { error } = await supabase.rpc("transition_talkx_campaign", {
        p_campaign_id: campaignId,
        p_action: "pause",
        p_pause_reason: pauseReason,
      });
      if (error) throw new Error(`talkx_campaign_auto_pause_failed: ${error.message}`);
    };

    // X019: recarrega o orçamento por minuto/dia no meio do lote (a cada
    // RELOAD_EVERY e quando o minuto esgota).
    const refreshBudget = async (state: EngineState) => {
      const connId = state.campaign.whatsapp_connection_id as string | undefined;
      if (!connId) return;
      const b = await loadConnectionBudget(connId);
      state.minuteLimit = b.minute_limit;
      state.minuteRemaining = b.minute_remaining;
      state.dayRemaining = b.day_remaining;
      state.dailyLimit = b.day_limit;
      state.sentTodayTotal = b.day_sent;
    };

    // X033 — traduz o resultado do processamento de UM destinatário para a linha
    // de log (etapa/resultado/código/status). Mapeamento TOTAL: toda variante de
    // ProcessResult cai num valor aceito pelo CHECK de talkx_delivery_log.
    const deliveryLogEntryFor = (
      result: ProcessResult,
      recipientId: string,
      attempt: number,
      workerId: string,
      durationMs: number,
    ): DeliveryLogEntry => {
      let stage = "complete";
      let outcome = "failed";
      let errorCode: string | null = null;
      let httpStatus: number | null = null;
      switch (result.kind) {
        case "no_claim": stage = "claim"; outcome = "no_claim"; break;
        case "skipped_blacklisted": stage = "suppress_check"; outcome = "skipped"; errorCode = "blacklisted"; break;
        case "skipped_no_phone": stage = "claim"; outcome = "skipped"; errorCode = "no_phone"; break;
        case "skipped_missing_variable": outcome = "skipped"; errorCode = "missing_variable"; break;
        case "message_failed": outcome = "failed"; errorCode = result.errorCode ?? "message_failed"; break;
        case "sent": stage = "dispatch"; outcome = "sent"; break;
        case "failed": stage = "dispatch"; outcome = "failed"; errorCode = result.errorCode ?? "provider_error"; httpStatus = result.httpStatus ?? null; break;
        case "outcome_unknown": stage = "dispatch"; outcome = "outcome_unknown"; errorCode = result.errorCode ?? "provider_outcome_unknown"; break;
        case "rescheduled": stage = "dispatch"; outcome = result.deadLettered ? "failed" : "rescheduled"; errorCode = result.errorCode ?? "pre_dispatch_error"; break;
        case "stopped": outcome = "stopped"; errorCode = "campaign_stopped"; break;
      }
      return {
        campaign_id: campaignId,
        recipient_id: recipientId,
        attempt,
        stage,
        outcome,
        http_status: httpStatus,
        error_code: errorCode,
        worker_id: workerId,
        duration_ms: durationMs,
      };
    };

    // X033 — grava em LOTE, ao fim de cada passada, as linhas de log dos
    // destinatários processados nela. Best-effort de propósito: o log nunca pode
    // derrubar um lote. Sem telefone nem texto — só os campos de DeliveryLogEntry.
    const flushDeliveryLogs = async (state: EngineState) => {
      if (state.deliveryLogs.length === 0) return;
      const batch = state.deliveryLogs.splice(0, state.deliveryLogs.length);
      try {
        const { error } = await supabase.from("talkx_delivery_log").insert(batch);
        if (error) {
          log.warn("Falha ao gravar talkx_delivery_log (best-effort)", {
            correlationId, campaign_id: campaignId, count: batch.length, error: error.message,
          });
        }
      } catch (err) {
        log.warn("Exceção ao gravar talkx_delivery_log (best-effort)", {
          correlationId, campaign_id: campaignId, count: batch.length,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    // Processa UM destinatário sob o lease de campanha: relê o estado, checa
    // janela/cota, chama o corpo extraído (process-recipient.ts), aplica os
    // contadores e roda a cauda (RELOAD_EVERY + ritmo). Devolve 'stop' quando o
    // laço tem de encerrar (campanha fora de sending, janela fechada, cota
    // esgotada ou pausa detectada dentro do corpo).
    const runRecipient = async (
      state: EngineState,
      recipient: ProcessRecipientRow,
      customFieldsByContact: Map<string, Record<string, string>>,
    ): Promise<"next" | "stop"> => {
      // Re-read the state and send limits before each claim. A single initial
      // check is not enough when a campaign crosses a local-time boundary.
      const { data: currentCampaign, error: currentCampaignError } = await supabase
        .from("talkx_campaigns")
        .select("status, send_interval_min, send_interval_max, typing_delay_min, typing_delay_max, send_window_start, send_window_end, business_hours_only, speed_profile, schedule_timezone")
        .eq("id", campaignId).single();
      if (currentCampaignError) throw new Error(`talkx_campaign_state_lookup_failed: ${currentCampaignError.message}`);
      if (currentCampaign?.status !== "sending") return "stop";
      state.campaign = { ...state.campaign, ...currentCampaign };
      const currentWindowStatus = deliveryWindowStatus(state.campaign, undefined, state.businessHours);
      if (!currentWindowStatus.allowed) {
        // V03: grava POR QUE pausou — sem isso a retomada automática não tinha
        // como distinguir pausa da janela de pausa do operador.
        await pauseCampaign(pauseReasonForWindow(currentWindowStatus));
        return "stop";
      }

      // X019: orçamento por minuto/dia da conexão (RPC da X018). Dia esgotado →
      // pausa com daily_limit (scheduler retoma quando day_remaining > 0).
      if (state.dayRemaining <= 0) {
        await pauseCampaign("daily_limit");
        return "stop";
      }
      // Minuto esgotado: recarrega (pode ter virado) e, se continuar esgotado,
      // aguarda a virada antes de tentar de novo; o laço externo encerra pelo
      // orçamento de tempo quando não couber mais envio.
      if (state.minuteRemaining <= 0) {
        await refreshBudget(state);
        if (state.minuteRemaining <= 0) await sleep(60_000);
        return "next";
      }

      state.handled++;
      // X033 — tentativa ordinal + logger filho com o contexto fixo do
      // destinatário (campaign_id/recipient_id/attempt em toda entrada de log).
      const recipientAttempt = (typeof recipient.attempt_count === "number" ? recipient.attempt_count : 0) + 1;
      const recipientStartedAt = Date.now();
      const recipientLog = log.child({
        campaign_id: campaignId,
        recipient_id: recipient.id,
        attempt: recipientAttempt,
      });
      const result = await processRecipient({
        supabase,
        campaignId,
        campaign: state.campaign,
        businessHours: state.businessHours,
        initialInstanceId: state.initialInstanceId,
        instanceToken: state.instanceToken,
        evolutionUrl: state.evolutionUrl,
        evolutionKey: state.evolutionKey,
        supabaseUrl: state.supabaseUrl,
        workerId: state.workerId,
        trackingUrlFor: state.trackingUrlFor,
        linksByLabelFor: state.linksByLabelFor,
        customFieldsByContact,
        log: recipientLog,
        correlationId,
        isRecipientSuppressed,
        mediaForSend: state.mediaForSend,
      }, recipient);

      // X033 — acumula a linha de log desta passada (gravada em lote no fim dela).
      state.deliveryLogs.push(
        deliveryLogEntryFor(result, recipient.id, recipientAttempt, state.workerId, Date.now() - recipientStartedAt),
      );

      switch (result.kind) {
        case "no_claim":
          return "next";
        case "skipped_blacklisted":
          state.blacklisted++;
          return "next";
        case "skipped_no_phone":
          return "next";
        case "skipped_missing_variable":
          // X020: variável sem valor/desconhecida — nenhum POST saiu; o
          // destinatário já está marcado skipped com missing_variable:<nome>.
          return "next";
        case "message_failed":
          state.failed++;
          state.processed++;
          return "next";
        case "outcome_unknown":
          state.outcomeUnknown++;
          state.processed++;
          return "next";
        case "rescheduled":
          if (result.deadLettered) state.failed++;
          state.processed++;
          return "next";
        case "stopped":
          return "stop";
        case "sent":
          state.sent++;
          state.sentTodayTotal++;
          state.minuteRemaining = Math.max(0, state.minuteRemaining - 1);
          state.dayRemaining = Math.max(0, state.dayRemaining - 1);
          break;
        case "failed":
          state.failed++;
          break;
      }

      state.processed++;
      // E78: reler parametros de campanha a cada RELOAD_EVERY envios
      if (state.processed % RELOAD_EVERY === 0) {
        await refreshBudget(state);
        const { data: fresh } = await supabase
          .from("talkx_campaigns")
          .select("send_interval_min, send_interval_max, typing_delay_min, typing_delay_max, send_window_start, send_window_end, business_hours_only, speed_profile, schedule_timezone")
          .eq("id", campaignId).single();
        if (fresh) {
          state.campaign = { ...state.campaign, ...fresh };
          // Recheck the campaign's own IANA window after configuration reload.
          // The locked transition preserves a concurrent manual pause/cancel.
          const refreshedWindowStatus = deliveryWindowStatus(state.campaign, undefined, state.businessHours);
          if (!refreshedWindowStatus.allowed) {
            log.warn('Campanha pausada automaticamente: fora da janela de envio', { correlationId, campaignId });
            await pauseCampaign(pauseReasonForWindow(refreshedWindowStatus));
            return "stop";
          }
        }
      }
      const sendInterval = randomBetween(
        state.campaign.send_interval_min as number,
        state.campaign.send_interval_max as number,
      );
      await sleep(sendInterval);
      return "next";
    };

    const buildEngineState = async (
      campaign: Record<string, unknown>,
      workerId: string,
      initialInstanceId: string,
      instanceToken: string | null,
      dailyLimit: number,
      sentTodayTotal: number,
      minuteLimit: number,
      minuteRemaining: number,
      dayRemaining: number,
      businessHours: { start?: string; end?: string; days?: number[] } | null,
      trackingUrlFor: (recipientId: string) => string | undefined,
      linksByLabelFor: (recipientId: string) => Record<string, string>,
    ): Promise<EngineState> => {
      // whatsapp-media e bucket privado: a GO so baixa via signed URL (TTL 300s). Uma
      // assinatura serve varios destinatarios; reassina depois de 240s porque campanhas
      // com typingDelay por envio passam do TTL.
      let signedMedia: { url: string; at: number } | null = null;
      const mediaForSend = async () => {
        if (!signedMedia || Date.now() - signedMedia.at > 240_000) {
          signedMedia = { url: await resolvePrivateBucketUrl(supabase, campaign.media_url as string, undefined, supabaseUrl), at: Date.now() };
        }
        return signedMedia.url;
      };
      return {
        campaign,
        businessHours,
        dailyLimit,
        sentTodayTotal,
        minuteLimit,
        minuteRemaining,
        dayRemaining,
        sent: Number(campaign.sent_count ?? 0),
        failed: Number(campaign.failed_count ?? 0),
        blacklisted: 0,
        outcomeUnknown: 0,
        processed: 0,
        handled: 0,
        workerId,
        initialInstanceId,
        instanceToken,
        evolutionUrl,
        evolutionKey,
        supabaseUrl,
        trackingUrlFor,
        linksByLabelFor,
        mediaForSend,
        deliveryLogs: [],
      };
    };

    // ---------------------------------------------------------------------
    // action=continue (X011): passadas com orçamento de tempo e lease de worker.
    // ---------------------------------------------------------------------
    if (campaignAction === "continue") {
      // Só service key ou x-cron-secret podem dirigir a fila. Um JWT admin
      // (que passa a auth acima) NÃO pode reivindicar o lease da campanha.
      if (!isCronAuth && !isServiceKey) {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
      }

      const { data: campaignRow, error: campaignLookupError } = await supabase
        .from("talkx_campaigns").select("*").eq("id", campaignId).single();
      if (campaignLookupError || !campaignRow) {
        return new Response(JSON.stringify({ error: "Campaign not found" }), { status: 404, headers });
      }

      const workerId = `talkx-send:${crypto.randomUUID()}`;
      const { data: claimed, error: claimError } = await supabase.rpc("claim_talkx_campaign_worker", {
        p_campaign_id: campaignId,
        p_worker: workerId,
        p_lease_seconds: 90,
      });
      if (claimError) throw new Error(`talkx_campaign_claim_failed: ${claimError.message}`);
      // Lease vivo de outro worker (ou campanha fora de 'sending'): não toca o
      // provedor nem a fila — o próximo tick tenta de novo.
      if (claimed !== true) {
        return new Response(JSON.stringify({
          success: true, skipped: "worker_alive", processed: 0, remaining: 0, has_more: true,
        }), { headers });
      }

      try {
        const { businessHours } = await loadBusinessHoursAndDailyLimit();

        // Get WhatsApp connection instance
        const { data: connection } = await supabase
          .from("whatsapp_connections").select("status, instance_id")
          .eq("id", campaignRow.whatsapp_connection_id).eq("status", "connected").single();
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
          // X025: grava 1 evento `connection_failed` com o status lido da conexão.
          const connectionStatus = await readConnectionStatus(campaignRow.whatsapp_connection_id);
          try {
            await supabase.from("talkx_campaign_events").insert({
              campaign_id: campaignId,
              event_type: "connection_failed",
              message: `Falha de conexão (status: ${connectionStatus})`,
            });
          } catch { /* timeline é best-effort */ }
          return new Response(JSON.stringify({ error: "WhatsApp connection lost: campaign paused" }), { status: 409, headers });
        }

        // X019: token da instância, resolvido uma vez por invocação e passado a
        // todos os evoFetch (presença, texto, mídia). Sem token cadastrado, usa o
        // fallback global SÓ na instância padrão; senão pausa com connection_lost.
        const { data: resolvedToken, error: tokenError } = await supabase.rpc("get_instance_token", {
          p_instance_id: initialInstanceId,
        });
        if (tokenError) throw new Error(`talkx_instance_token_failed: ${tokenError.message}`);
        let instanceToken = typeof resolvedToken === "string" && resolvedToken.length > 0 ? resolvedToken : null;
        if (!instanceToken) {
          if (initialInstanceId === Deno.env.get("EVOLUTION_INSTANCE_NAME")) {
            instanceToken = Deno.env.get("EVOLUTION_INSTANCE_TOKEN") ?? null;
          } else {
            await pauseCampaign("connection_lost");
            return new Response(JSON.stringify({ error: "WhatsApp connection instance token missing: campaign paused" }), { status: 409, headers });
          }
        }

        // X019: orçamento por minuto/dia (Talk X + Multiplix) via RPC da X018.
        const budget = await loadConnectionBudget(campaignRow.whatsapp_connection_id as string);
        const {
          minute_limit: minuteLimit,
          minute_remaining: minuteRemaining,
          day_remaining: dayRemaining,
          day_limit: dailyLimit,
          day_sent: sentTodayTotal,
        } = budget;

        const { trackingUrlFor, linksByLabelFor } = await loadTrackingLinks();
        const state = await buildEngineState(
          campaignRow, workerId, initialInstanceId, instanceToken,
          dailyLimit, sentTodayTotal, minuteLimit, minuteRemaining, dayRemaining, businessHours, trackingUrlFor, linksByLabelFor,
        );

        const parsedBatchSize = Number.parseInt(Deno.env.get("TALKX_BATCH_SIZE") ?? "", 10);
        const batchSize = Number.isFinite(parsedBatchSize) && parsedBatchSize > 0 ? Math.min(parsedBatchSize, 200) : 20;
        const parsedBudget = Number.parseInt(Deno.env.get("TALKX_BATCH_BUDGET_MS") ?? "", 10);
        const budgetMs = Number.isFinite(parsedBudget) && parsedBudget > 0 ? parsedBudget : 50_000;
        const startedAt = Date.now();
        const remainingBudgetMs = () => budgetMs - (Date.now() - startedAt);
        const minNeededMs = () => Number(state.campaign.typing_delay_max ?? 0) + 25_000;

        let remaining = 0;
        let hasMore = false;
        let drained = false;
        while (true) {
          const { data: rows, error: recipientsError } = await supabase.rpc("talkx_next_recipients", {
            p_campaign_id: campaignId,
            p_limit: batchSize,
          });
          if (recipientsError) throw new Error(`talkx_recipients_lookup_failed: ${recipientsError.message}`);
          const batch = (rows ?? []) as Record<string, unknown>[];
          // Passada vazia: a fila drenou — só agora a conclusão pode ser tentada.
          if (batch.length === 0) { drained = true; break; }

          const processRows = batch.map((row): ProcessRecipientRow => ({
            id: row.recipient_id as string,
            contact_id: (row.contact_id as string | null) ?? null,
            status: row.status as string,
            attempt_count: (row.attempt_count as number | null) ?? 0,
            personalized_message: (row.personalized_message as string | null) ?? null,
            contacts: {
              name: (row.contact_name as string | null) ?? null,
              nickname: (row.contact_nickname as string | null) ?? null,
              phone: (row.contact_phone as string | null) ?? null,
              company: (row.contact_company as string | null) ?? null,
            },
          }));

          // Pré-carga de campos customizados POR PASSADA (não mais uma vez para
          // a campanha inteira).
          const customFieldsByContact = await loadCustomFieldsByContact(processRows);

          const blacklistedBeforeBatch = state.blacklisted;
          let index = 0;
          for (; index < processRows.length; index++) {
            // Não começa destinatário novo se o tempo restante não cobre o
            // typing_delay máximo + 25s de folga (timeout por envio).
            if (remainingBudgetMs() < minNeededMs()) break;
            const step = await runRecipient(state, processRows[index], customFieldsByContact);
            if (step === "stop") break;
          }
          // X033: grava em lote, ao fim da passada, o log dos destinatários que
          // ela processou (uma inserção por passada; best-effort).
          await flushDeliveryLogs(state);
          // X025: ao FIM de cada lote, grava 1 evento AGREGADO quando houve
          // pulados por supressão. Antes o contador só existia em memória e a
          // timeline nunca registrava esses pulos.
          const skippedBySuppression = state.blacklisted - blacklistedBeforeBatch;
          if (skippedBySuppression > 0) {
            try {
              await supabase.from("talkx_campaign_events").insert({
                campaign_id: campaignId,
                event_type: "skipped_suppressed",
                message: `${skippedBySuppression} destinatário(s) pulado(s) por supressão`,
              });
            } catch { /* timeline é best-effort */ }
          }
          if (index < processRows.length) {
            remaining = processRows.length - index;
            hasMore = true;
            break;
          }
        }

        // complete_talkx_campaign_if_drained só quando a passada voltou vazia.
        let completed = false;
        if (drained) {
          const { data: completedData, error: completionError } = await supabase.rpc(
            "complete_talkx_campaign_if_drained",
            { p_campaign_id: campaignId },
          );
          if (completionError) throw new Error(`talkx_campaign_completion_failed: ${completionError.message}`);
          completed = completedData === true;
        }

        log.done(200, { correlationId, campaign_id: campaignId, sent: state.sent, failed: state.failed, outcomeUnknown: state.outcomeUnknown });

        return new Response(
          JSON.stringify({
            success: true,
            processed: state.handled,
            remaining,
            has_more: hasMore,
            sent: state.sent,
            failed: state.failed,
            blacklisted: state.blacklisted,
            outcome_unknown: state.outcomeUnknown,
            completed,
          }),
          { headers },
        );
      } finally {
        // Solta o lease ao sair (inclusive sob exceção). Se falhar, o lease
        // expira sozinho em 90s — nunca mascara a resposta.
        const { error: releaseError } = await supabase.rpc("release_talkx_campaign_worker", {
          p_campaign_id: campaignId,
          p_worker: workerId,
        });
        if (releaseError) {
          log.warn("Falha ao soltar o lease da campanha (expira sozinho)", { correlationId, campaignId, error: releaseError.message });
        }
      }
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
    const campaign = initialCampaign;
    // X020 — impede LANÇAR uma campanha com variável desconhecida: nome que não
    // é nativo, nem campo customizado existente no CRM, nem link cadastrado.
    // Roda ANTES de qualquer transição/kick: 422 com a lista, nenhum
    // destinatário é tocado e nenhum POST sai.
    {
      const probeTimeZone = typeof campaign.schedule_timezone === "string"
        ? campaign.schedule_timezone
        : DEFAULT_SCHEDULE_TIMEZONE;
      const knownCustomFieldNames = await loadKnownCustomFieldNames();
      const presenceValues: Record<string, string> = {};
      for (const name of knownCustomFieldNames) presenceValues[name] = "x";
      const linkLabels = await loadLinkLabels();
      const templateTexts = await loadCampaignTemplateTexts(campaign as Record<string, unknown>);
      const unknownVariableNames = new Set<string>();
      for (const templateText of templateTexts) {
        // trackingUrl de prova: {{link}} é nativo/known — a validação de nome
        // desconhecido não pode confundir "sem link cadastrado" (missing, por
        // destinatário) com "nome inexistente" (erro de lançamento).
        const probe = personalize(
          templateText,
          { name: "Joao Silva", nickname: "Joao", company: "Empresa Teste" },
          presenceValues,
          probeTimeZone,
          "https://talkx-link.example/__probe__",
          linkLabels,
        );
        for (const name of probe.unknown) unknownVariableNames.add(name);
      }
      if (unknownVariableNames.size > 0) {
        return new Response(
          JSON.stringify({ error: "unknown_variables", variables: Array.from(unknownVariableNames) }),
          { status: 422, headers },
        );
      }
    }
    // V20: horário comercial + limite diário por conexão (talkx_settings)
    const { businessHours, dailyLimit } = await loadBusinessHoursAndDailyLimit();
    const sentTodayTotal = dailyLimit > 0
      ? await countSentTodayForConnection(campaign.whatsapp_connection_id)
      : 0;
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
      // X025: grava 1 evento connection_failed com o status lido da conexão.
      const connectionStatus = await readConnectionStatus(campaign.whatsapp_connection_id);
      try {
        await supabase.from("talkx_campaign_events").insert({
          campaign_id: campaignId,
          event_type: "connection_failed",
          message: `Falha de conexão (status: ${connectionStatus})`,
        });
      } catch { /* timeline é best-effort */ }
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

    // X013: o limite diário é conferido aqui, não mais no laço inline. A
    // campanha acabou de virar 'sending' na transição acima, então a pausa
    // (válida só a partir de 'sending') reproduz o comportamento antigo: não
    // dispara um lote que a primeira passada já pausaria por cota esgotada.
    if (dailyLimit > 0 && sentTodayTotal >= dailyLimit) {
      await pauseCampaign("daily_limit");
      return new Response(JSON.stringify({ ok: false, reason: "daily_limit" }), { headers });
    }

    // X013: lançamento assíncrono — o lote roda em OUTRA invocação da edge
    // (action=continue). Aqui só sinalizamos a fila: nenhum destinatário é lido
    // e nenhum POST sai para o provedor nesta requisição. Se o kick falhar, o
    // lançamento não foi agendado — a resposta é 500, nunca "accepted".
    const { error: kickError } = await supabase.rpc("kick_talkx_campaign", {
      p_campaign_id: campaignId,
    });
    if (kickError) {
      return new Response(JSON.stringify({ error: kickError.message }), { status: 500, headers });
    }

    log.done(200, { correlationId, campaignId, accepted: true });

    return new Response(
      JSON.stringify({ success: true, accepted: true, status: "sending" }),
      { headers },
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
