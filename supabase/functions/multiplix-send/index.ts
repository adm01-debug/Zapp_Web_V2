/**
 * Multiplix — motor de envio (claim/lease/backoff)
 * Mesmo padrao de talkx-send (claim_talkx_recipient/complete_talkx_recipient/
 * reschedule_talkx_recipient/complete_talkx_campaign_if_drained), adaptado
 * para multiplix_dispatches/multiplix_recipients. Sem variantes A/B e sem link
 * de rastreamento {{link}} — fora de escopo desta etapa. A lista de supressao
 * (opt-out) e consultada em talkx_recipient_is_suppressed logo apos o claim e de
 * novo imediatamente antes do POST ao provedor (F09).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { enforceRateLimit, getCorsHeaders, handleCors, Logger } from "../_shared/validation.ts";
import { evoFetch, extractMessageId } from "../_shared/evolution-send.ts";
import { DEFAULT_SCHEDULE_TIMEZONE, deliveryWindowStatus } from "../_shared/talkx-window.ts";
import { resolvePrivateBucketUrl } from "../_shared/evolution-api-proxy.ts";
import { liveTalkXInstanceId } from "../_shared/talkx-delivery-connection.ts";
import {
  type MediaKind,
  type MessageKind,
  type PersonalizeResult,
  newCorrelationId,
  normalizePhone,
  personalize,
  planRetry,
  prepareMedia,
  providerErrorInfo,
  randomBetween,
  send,
  sleep,
} from "../_shared/messaging/index.ts";

// F37/F43: as duplicatas locais (`getGreeting`, `personalizeMultiplix`,
// `randomBetween`, `sleep`, `prepareMedia`, `send`) foram removidas — todas vêm do
// kernel compartilhado em ../_shared/messaging. O dialeto do Multiplix
// ({{saudacao}}/{{empresa}}) é um SUBCONJUNTO dos built-ins que `personalize`
// resolve: o nome da empresa entra por `contact.company`. A política de
// placeholder sem valor passa a ser o fallback `[variavel]` do kernel — NUNCA
// string vazia silenciosa. `personalize` é reexportado para não quebrar os
// importadores deste módulo (index.test.ts importa daqui).
export { personalize };

function timingSafeStringEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

/** F56: mapeia o tipo REAL detectado pelo prepareMedia para o kind do adaptador. */
function kindForMedia(kind: MediaKind): MessageKind {
  switch (kind) {
    case "image":
      return "image";
    // No dispatch, media_type "audio" sempre significou nota de voz (o POST antigo ia para
    // /message/sendWhatsAppAudio). Como ptt e o kind que liga a presenca "recording", o
    // mapeamento preserva o que ja acontecia — e passa a avisar ao destinatario que gravamos.
    case "audio":
      return "ptt";
    case "video":
      return "video";
    case "document":
    default:
      return "document";
  }
}

/** F56: nome do arquivo do documento vem do bloco (F33: content.media.fileName). */
function mediaFileNameFromBlock(content: Record<string, unknown> | null | undefined): string | undefined {
  const media = content?.media;
  if (!media || typeof media !== "object") return undefined;
  const nome = (media as Record<string, unknown>).fileName;
  return typeof nome === "string" && nome.trim() !== "" ? nome : undefined;
}

type PreparedForSend = { kind: MessageKind; url: string; fileName: string };

// MX05: UMA tabela de backoff para o worker inteiro — a mesma do kernel
// (errors.ts): 30 s, 2 min, 10 min. O primeiro degrau e o piso deterministico
// quando o planRetry nao devolve retryAfter (decisao dead_letter): retry
// imediato e proibido; quem decide o teto continua sendo a RPC.
const RETRY_BACKOFF_MS: readonly number[] = [30_000, 120_000, 600_000];

export async function handleMultiplixSend(
  req: Request,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _injected?: { supabase?: any; serviceKey?: string },
): Promise<Response> {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const headers = { ...getCorsHeaders(req), "Content-Type": "application/json" };
  const log = new Logger("multiplix-send");
  // F43: UM correlation_id por request, propagado ao log estruturado. Opaco de
  // proposito: nao deriva de telefone, nome ou conteudo.
  const correlationId = newCorrelationId();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = _injected?.serviceKey ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const evolutionUrl = Deno.env.get("EVOLUTION_API_URL")!;
    const evolutionKey = Deno.env.get("EVOLUTION_API_KEY")!;

    const supabase = _injected?.supabase ?? createClient(supabaseUrl, serviceKey);

    // Auth: x-cron-secret (pg_cron, sem Bearer) OU service-role key OU JWT admin/supervisor.
    // x-cron-secret é verificado ANTES do guard de Bearer para que pg_cron chegue aqui.
    const authHeader = req.headers.get("Authorization");
    const cronSecretHeader = req.headers.get("x-cron-secret");
    let isCronAuth = false;
    if (cronSecretHeader) {
      const { data: vaultSecret, error: rpcError } = await supabase.rpc("get_multiplix_cron_secret");
      if (!rpcError && typeof vaultSecret === "string") {
        isCronAuth = timingSafeStringEqual(cronSecretHeader, vaultSecret);
      }
    }
    let authUserId: string | null = null;
    let hasManageAll = false;
    if (!isCronAuth) {
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
      }
      const token = authHeader.slice(7);
      const isServiceKey = timingSafeStringEqual(token, serviceKey);
      if (!isServiceKey) {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
        }
        authUserId = user.id;
        // F07: papel por RPC (is_admin_or_supervisor) em vez de
        // user_roles.in(["admin","supervisor"]).maybeSingle() — com as duas
        // roles a consulta devolvia duas linhas, o maybeSingle abortava e quem
        // era admin E supervisor levava 403.
        const { data: isAdminOrSupervisor, error: roleError } = await supabase.rpc(
          "is_admin_or_supervisor", { _user_id: user.id },
        );
        if (roleError) {
          return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
        }
        // F06 (corrigido em 01/10/2026): a permissao nomeada agora e avaliada
        // SEMPRE, inclusive para admin/supervisor. Antes ela so era consultada
        // quando is_admin_or_supervisor era falso, e como o gate de papel ja
        // barrava quem nao tem papel, na pratica a permissao nunca valia para
        // admin/supervisor: um admin COM multiplix.dispatch.manage_all levava
        // 403 ao mexer no disparo de outro dono. O gate continua sendo
        // papel OU permissao (quem tem so a permissao, sem papel, ja passava).
        const { data: manageAll, error: permissionError } = await supabase.rpc("user_has_permission", {
          _user_id: user.id, _permission_name: "multiplix.dispatch.manage_all",
        });
        hasManageAll = !permissionError && manageAll === true;
        if (isAdminOrSupervisor !== true && !hasManageAll) {
          return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
        }
      }
    }

    // F06: start/pause/cancel sao do dono do disparo (created_by = profile do JWT)
    // ou de quem tem a permissao nomeada multiplix.dispatch.manage_all. Cron
    // (x-cron-secret) e service-role key nao tem dono e passam direto.
    let authProfileId: string | null | undefined;
    const authProfile = async (): Promise<string | null> => {
      if (authProfileId !== undefined) return authProfileId;
      if (!authUserId) {
        authProfileId = null;
        return authProfileId;
      }
      const { data } = await supabase.from("profiles").select("id").eq("user_id", authUserId).maybeSingle();
      authProfileId = (data?.id as string | undefined) ?? null;
      return authProfileId;
    };
    const canManageDispatch = async (createdBy: string | null): Promise<boolean> => {
      if (!authUserId) return true;
      if (hasManageAll) return true;
      const profileId = await authProfile();
      return Boolean(profileId && createdBy && profileId === createdBy);
    };

    const body = await req.json();
    const { dispatchId, action } = body;
    if (!dispatchId) {
      return new Response(JSON.stringify({ error: "dispatchId required" }), { status: 400, headers });
    }

    const dispatchAction = action ?? "start";

    // Pause/cancel compartilham a mesma transicao travada usada por start —
    // sem isso um update sem lock poderia ressuscitar um dispatch cancelado
    // por uma requisicao concorrente entre leitura e escrita.
    if (dispatchAction === "pause" || dispatchAction === "cancel") {
      const { data: targetDispatch, error: targetError } = await supabase
        .from("multiplix_dispatches").select("created_by").eq("id", dispatchId).maybeSingle();
      if (targetError) throw new Error(`multiplix_dispatch_owner_lookup_failed: ${targetError.message}`);
      if (!targetDispatch) {
        return new Response(JSON.stringify({ error: "Dispatch not found" }), { status: 404, headers });
      }
      if (!(await canManageDispatch(targetDispatch.created_by))) {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
      }
      const { data, error } = await supabase.rpc("transition_multiplix_dispatch", {
        p_dispatch_id: dispatchId,
        p_action: dispatchAction,
      });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 409, headers });
      }
      const transition = Array.isArray(data) ? data[0] : data;
      return new Response(JSON.stringify({ success: true, status: transition?.current_status }), { headers });
    }

    if (dispatchAction !== "start") {
      return new Response(JSON.stringify({ error: "Invalid dispatch action" }), { status: 400, headers });
    }

    const { data: initialDispatch, error: dispatchErr } = await supabase
      .from("multiplix_dispatches").select("*").eq("id", dispatchId).single();
    if (dispatchErr || !initialDispatch) {
      return new Response(JSON.stringify({ error: "Dispatch not found" }), { status: 404, headers });
    }
    let dispatch = initialDispatch;

    if (!(await canManageDispatch(initialDispatch.created_by))) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
    }

    // Conexao WhatsApp: usa a escolhida no dispatch; sem uma, cai na primeira
    // conexao conectada (composer ainda nao oferece selecao de conexao).
    const connectionQuery = dispatch.whatsapp_connection_id
      ? supabase.from("whatsapp_connections").select("id, status, instance_id").eq("id", dispatch.whatsapp_connection_id).eq("status", "connected").maybeSingle()
      : supabase.from("whatsapp_connections").select("id, status, instance_id").eq("status", "connected").limit(1).maybeSingle();
    const { data: connection } = await connectionQuery;
    const initialInstanceId = liveTalkXInstanceId(connection);
    if (!initialInstanceId) {
      try {
        await supabase.rpc("transition_multiplix_dispatch", {
          p_dispatch_id: dispatchId,
          p_action: "pause",
          p_pause_reason: "connection_lost",
        });
      } catch { /* ja pausado ou outro estado — ignora */ }
      return new Response(JSON.stringify({ error: "WhatsApp connection lost: dispatch paused" }), { status: 409, headers });
    }

    // Fixa a conexao resolvida no dispatch na primeira vez: sem isso
    // whatsapp_connection_id fica sempre NULL (composer nao seleciona),
    // record_multiplix_recipient_delivered nunca casa (NULL = uuid) e
    // delivered_count fica travado em zero para sempre, alem de cada envio
    // poder escolher uma conexao "primeira conectada" diferente em meio ao
    // mesmo dispatch se houver mais de uma instancia.
    if (!dispatch.whatsapp_connection_id && connection?.id) {
      const { error: connectionPersistError } = await supabase
        .from("multiplix_dispatches")
        .update({ whatsapp_connection_id: connection.id })
        .eq("id", dispatchId)
        .is("whatsapp_connection_id", null);
      if (connectionPersistError) {
        throw new Error(`multiplix_dispatch_connection_persist_failed: ${connectionPersistError.message}`);
      }
      dispatch = { ...dispatch, whatsapp_connection_id: connection.id };
    }

    const windowStatus = deliveryWindowStatus(dispatch);
    if (!windowStatus.allowed) {
      return new Response(JSON.stringify({ ok: false, reason: windowStatus.reason, next_window: windowStatus.next_window }), { headers });
    }

    const { error: transitionError } = await supabase.rpc("transition_multiplix_dispatch", {
      p_dispatch_id: dispatchId,
      p_action: "start",
    });
    if (transitionError) {
      return new Response(JSON.stringify({ error: transitionError.message }), { status: 409, headers });
    }

    // F11a: cada passada reivindica no maximo MULTIPLIX_BATCH_SIZE (default 20)
    // destinatarios — uma invocacao com a fila inteira estourava o tempo/limite
    // do worker. A passada seguinte rele a fila; 'break passLoop' encerra de vez
    // (dispatch fora de 'sending', janela fechada, conexao perdida ou cota diaria
    // esgotada).
    const parsedBatchSize = Number.parseInt(Deno.env.get("MULTIPLIX_BATCH_SIZE") ?? "", 10);
    const batchSize = Number.isFinite(parsedBatchSize) && parsedBatchSize > 0 ? Math.min(parsedBatchSize, 200) : 20;

    let sentCount = dispatch.sent_count || 0;
    let failedCount = dispatch.failed_count || 0;
    let skippedCount = 0;
    let outcomeUnknownCount = 0;
    let processedCount = 0;
    let selectedTotal = 0;
    const RELOAD_EVERY = 20;
    const workerId = `multiplix-send:${crypto.randomUUID()}`;
    let signedMedia: { sourceUrl: string; signedUrl: string; at: number } | null = null;
    const mediaForSend = async (mediaUrl: string) => {
      if (!signedMedia || signedMedia.sourceUrl !== mediaUrl || Date.now() - signedMedia.at > 240_000) {
        signedMedia = { sourceUrl: mediaUrl, signedUrl: await resolvePrivateBucketUrl(supabase, mediaUrl, undefined, supabaseUrl), at: Date.now() };
      }
      return signedMedia.signedUrl;
    };

    // F09: mesma fonte de verdade do talkx-send. Checada depois do claim e de
    // novo imediatamente antes do POST, porque o opt-out pode chegar no meio do
    // disparo (o destinatario ja reivindicado precisa virar 'skipped', nao
    // voltar para a fila).
    const isRecipientSuppressed = async (phone: string | null): Promise<boolean> => {
      const { data, error } = await supabase.rpc("talkx_recipient_is_suppressed", {
        p_contact_id: null,
        p_phone: phone,
      });
      if (error || typeof data !== "boolean") {
        throw new Error(`multiplix_suppression_check_failed: ${error?.message ?? "invalid_response"}`);
      }
      return data;
    };

    // MX07: token DA instancia que vai enviar (rotas auth=instance do Evolution GO).
    // Mesmo padrao do talkx-send: get_instance_token no banco; vazio so cai no
    // EVOLUTION_INSTANCE_TOKEN quando a instancia e a padrao (transicao). Qualquer
    // outra sem token = ausencia: o chamador pausa — NUNCA a key global nem o token
    // de outra instancia. O token nunca vai para log. Cache por instancia: uma RPC
    // por instancia por passada, nao por destinatario.
    const instanceTokens = new Map<string, string | null>();
    const resolveInstanceToken = async (instanceId: string): Promise<string | null> => {
      const cached = instanceTokens.get(instanceId);
      if (cached !== undefined) return cached;
      const { data, error } = await supabase.rpc("get_instance_token", { p_instance_id: instanceId });
      if (error) throw new Error(`multiplix_instance_token_failed: ${error.message}`);
      let token = typeof data === "string" && data.length > 0 ? data : null;
      if (!token && instanceId === Deno.env.get("EVOLUTION_INSTANCE_NAME")) {
        token = Deno.env.get("EVOLUTION_INSTANCE_TOKEN") ?? null;
      }
      instanceTokens.set(instanceId, token);
      return token;
    };

    // F17: cota diaria da conexao (talkx + multiplix somados no dia). A conta e
    // local, decrementada a cada envio bem sucedido — uma RPC por destinatario
    // seria custo a toa. null = sem cota a respeitar (dispatch sem conexao fixa).
    const resolveDailyRoom = async (): Promise<number | null> => {
      const connectionId = typeof dispatch.whatsapp_connection_id === "string" ? dispatch.whatsapp_connection_id : null;
      if (!connectionId) return null;
      const { data, error } = await supabase.rpc("multiplix_connection_daily_usage", { p_connection_id: connectionId });
      if (error) throw new Error(`multiplix_daily_usage_lookup_failed: ${error.message}`);
      const usage = (Array.isArray(data) ? data[0] : data) as { remaining?: unknown } | null;
      const remaining = Number(usage?.remaining);
      if (!Number.isFinite(remaining)) {
        // Medicao quebrada nao pode parar o modulo: segue sem cota (o limite do
        // provedor nao e um controle de seguranca).
        log.warn("Cota diaria indisponivel: seguindo sem limite diario", { correlationId, dispatchId });
        return null;
      }
      return remaining;
    };
    let dailyRoom = await resolveDailyRoom();

    // F53 (Bloco E): teto por CONEXAO nesta edge. Aqui a conta e por invocacao (uma
    // passada = uma chamada), nao por destinatario: o que se protege e o canal
    // (instancia do provedor), e o teto e generoso de proposito — isto e uma trava
    // de rajada, nao a cota diaria do F17, que ja roda logo acima.
    const connectionForLimit = typeof dispatch.whatsapp_connection_id === "string"
      ? dispatch.whatsapp_connection_id
      : "sem-conexao";
    const burst = await enforceRateLimit(`multiplix-send:conn:${connectionForLimit}`, 600, 60_000);
    if (!burst.allowed) {
      log.warn("Rate limit por conexao atingido: adiando a passada", {
        correlationId, dispatchId, connectionId: connectionForLimit, remaining: burst.remaining,
      });
      const limited = new Response(JSON.stringify({
        error: "rate_limited",
        message: "Muitas passadas em sequencia para esta conexao",
        retry_after_seconds: 60,
      }), { status: 429, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
      limited.headers.set("Retry-After", "60");
      return limited;
    }

    const pauseDispatch = async (pauseReason: string) => {
      const { error } = await supabase.rpc("transition_multiplix_dispatch", {
        p_dispatch_id: dispatchId, p_action: "pause", p_pause_reason: pauseReason,
      });
      // 55000 = transicao invalida (ja nao esta mais em 'sending'): nao e erro.
      if (error && error.code !== "55000") {
        throw new Error(`multiplix_dispatch_auto_pause_failed: ${error.message}`);
      }
    };

    // F11a (01/10/2026): UMA passada por invocacao. O `for(;;)` antigo repetia
    // ate drenar o publico inteiro aqui dentro — a edge ficava aberta por horas
    // e podia estourar o limite de tempo, derrubando o disparo no meio. O cron
    // `multiplix-send-trigger` roda a cada 2 min e reinvoca, entao a fila
    // continua andando, com cada invocacao processando no maximo
    // MULTIPLIX_BATCH_SIZE (default 20).
    passLoop: {
      // F55 (02/10/2026): a escolha do que enviar agora e do BANCO, nao do worker.
      // list_multiplix_claimable_items devolve os itens elegiveis ja na ordem de trabalho
      // (e ja respeitando a ordem por bloco do F56: item do bloco k so quando o bloco k-1 do
      // mesmo destinatario esta sent). Duplicar essa regra aqui seria o jeito mais facil de
      // as duas versoes divergirem — e e justamente a que dois workers furariam.
      const { data: claimable, error: claimableError } = await supabase.rpc("list_multiplix_claimable_items", {
        p_dispatch_id: dispatchId,
        p_limit: batchSize,
      });
      if (claimableError) throw new Error(`multiplix_claimable_lookup_failed: ${claimableError.message}`);
      if (!claimable || claimable.length === 0) break passLoop;
      selectedTotal += claimable.length;

      for (const item of claimable as Array<{
        item_id: string;
        recipient_id: string;
        block_id: string;
        block_order: number;
        company_id: string;
        attempt_count: number;
      }>) {
        // O item carrega so IDs. Destinatario (destino, nome da empresa) e bloco (conteudo)
        // vem de uma leitura propria: a ordenacao ja foi decidida pelo banco, aqui e so o
        // material do envio.
        const { data: itemDetail, error: itemDetailError } = await supabase
          .from("multiplix_delivery_items")
          .select("id, recipient_id, block_id, attempt_count, status, " +
            "recipient:multiplix_recipients!inner(id, destino_e164, company_name_snapshot, personalized_message, variables_snapshot), " +
            "block:multiplix_blocks!inner(id, block_order, content)")
          .eq("id", item.item_id)
          .single();
        if (itemDetailError) throw new Error(`multiplix_item_detail_failed: ${itemDetailError.message}`);
        const recipient = (itemDetail as unknown as {
          recipient: { id: string; destino_e164: string | null; company_name_snapshot: string | null; personalized_message: string | null; variables_snapshot: Record<string, unknown> | null };
        }).recipient;
        const block = (itemDetail as unknown as {
          block: { id: string; block_order: number; content: Record<string, unknown> };
        }).block;

        const { data: currentDispatch, error: currentDispatchError } = await supabase
          .from("multiplix_dispatches")
          .select("status, send_interval_min, send_interval_max, typing_delay_min, typing_delay_max, send_window_start, send_window_end, business_hours_only, speed_profile, schedule_timezone, message_template, media_url, media_type")
          .eq("id", dispatchId).single();
        if (currentDispatchError) throw new Error(`multiplix_dispatch_state_lookup_failed: ${currentDispatchError.message}`);
        if (currentDispatch?.status !== "sending") break passLoop;
        dispatch = { ...dispatch, ...currentDispatch };
        const currentWindowStatus = deliveryWindowStatus(dispatch);
        if (!currentWindowStatus.allowed) {
          // F10c: registra o motivo. O cron so retoma sozinho o que esta pausado
          // com 'outside_window' — sem isso o disparo ficava pausado para sempre
          // sem ninguem saber por que.
          await pauseDispatch("outside_window");
          break passLoop;
        }

        // F17: sem cota diaria sobrando (talkx + multiplix do dia) o worker pausa
        // com motivo 'daily_limit' em vez de estourar o limite do numero; o cron
        // retoma quando houver espaco de novo.
        if (dailyRoom !== null && dailyRoom <= 0) {
          await pauseDispatch("daily_limit");
          break passLoop;
        }

        const { data: claimRows, error: claimError } = await supabase.rpc("claim_multiplix_item", {
          p_dispatch_id: dispatchId,
          p_item_id: item.item_id,
          p_worker: workerId,
          p_lease_seconds: 90,
        });
        if (claimError) throw new Error(`multiplix_item_claim_failed: ${claimError.message}`);
        const claim = Array.isArray(claimRows) ? claimRows[0] : null;
        if (!claim?.claim_token) continue;

        // F09: opt-out conferido assim que o destinatario e reivindicado. Quem
        // esta na lista negra vira 'skipped' com motivo (nao volta para a fila).
        if (await isRecipientSuppressed(recipient.destino_e164)) {
          const { error: completionError } = await supabase.rpc("complete_multiplix_item", {
            p_item_id: item.item_id,
            p_claim_token: claim.claim_token,
            p_status: "skipped",
            p_error_message: "Contato na lista negra (opt-out)",
          });
          if (completionError) throw new Error(`multiplix_recipient_completion_failed: ${completionError.message}`);
          skippedCount++;
          processedCount++;
          continue;
        }

        // F38: o destino passa pelo resolvedor E.164 do kernel. normalizePhone
        // devolve null para ausente/vazio OU reputado invalido (possivel LID de
        // 14-15 digitos nu) — nos dois casos nao existe destino enderecavel:
        // classe `no_destination` do F39 (mesmo tratamento do destino ausente),
        // em vez de fazer o POST com string vazia.
        const phone = normalizePhone(recipient.destino_e164 ?? undefined);
        if (!phone) {
          const { error: completionError } = await supabase.rpc("complete_multiplix_item", {
            p_item_id: item.item_id,
            p_claim_token: claim.claim_token,
            p_status: "skipped",
            p_error_message: "Sem destino de WhatsApp",
          });
          if (completionError) throw new Error(`multiplix_recipient_completion_failed: ${completionError.message}`);
          skippedCount++;
          processedCount++;
          continue;
        }

        let personalizedMsg: string = recipient.personalized_message ?? "";
        if (!personalizedMsg) {
          // F48/MX06: as variaveis customizadas vem do snapshot congelado no
          // confirm — o MESMO insumo que o validate (multiplix-dispatch/
          // inspect.ts) alimenta ao personalize. Sem isso um campo aprovado na
          // revisao viraria [variavel] ou skip no envio.
          const variablesSnapshot = recipient.variables_snapshot;
          const customValues: Record<string, string> = {};
          if (variablesSnapshot && typeof variablesSnapshot === "object") {
            for (const [key, value] of Object.entries(variablesSnapshot)) {
              if (typeof value === "string") customValues[key] = value;
            }
          }
          let resolution: PersonalizeResult;
          try {
            // F37: dialeto unificado do kernel — o nome da empresa entra por
            // contact.company, que e o campo consumido por {{empresa}}.
            resolution = personalize(
              dispatch.message_template,
              { company: recipient.company_name_snapshot },
              customValues,
              typeof dispatch.schedule_timezone === "string" ? dispatch.schedule_timezone : DEFAULT_SCHEDULE_TIMEZONE,
            );
          } catch (e) {
            const { error: completionError } = await supabase.rpc("complete_multiplix_item", {
              p_item_id: item.item_id,
              p_claim_token: claim.claim_token,
              p_status: "failed",
              p_error_message: e instanceof Error ? e.message : "Erro ao montar mensagem",
            });
            if (completionError) throw new Error(`multiplix_recipient_completion_failed: ${completionError.message}`);
            failedCount++;
            processedCount++;
            continue;
          }
          // MX06: o contrato do validate (campo ausente = exclusao) vale no
          // envio. missing/unknown => 'skipped' com motivo nomeado e
          // deterministico, ANTES do snapshot e de qualquer POST — nunca sai
          // texto com lacuna ("") nem "[variavel]" para o cliente. O default
          // explicito ({{chave|padrao}}) nao entra em missing/unknown e segue.
          if (resolution.missing.length > 0 || resolution.unknown.length > 0) {
            const motivo = [
              ...resolution.missing.map((key) => `missing_variable:${key}`),
              ...resolution.unknown.map((key) => `unknown_variable:${key}`),
            ].sort().join(";");
            const { error: completionError } = await supabase.rpc("complete_multiplix_item", {
              p_item_id: item.item_id,
              p_claim_token: claim.claim_token,
              p_status: "skipped",
              p_error_message: motivo,
            });
            if (completionError) throw new Error(`multiplix_recipient_completion_failed: ${completionError.message}`);
            skippedCount++;
            processedCount++;
            continue;
          }
          const { data: snapshotMessage, error: snapshotError } = await supabase.rpc("persist_multiplix_item_message_snapshot", {
            p_item_id: item.item_id,
            p_claim_token: claim.claim_token,
            p_personalized_message: resolution.text,
          });
          if (snapshotError) throw new Error(`multiplix_message_snapshot_failed: ${snapshotError.message}`);
          personalizedMsg = snapshotMessage as string;
        }

        const recipientHasMedia = typeof dispatch.media_url === "string" && typeof dispatch.media_type === "string";

        let providerPostAttempted = false;
        let sendTimeout: ReturnType<typeof setTimeout> | undefined;
        // F55: lease com heartbeat. O claim da 90 s e o POST tem timeout de 20 s, mas midia
        // grande e PTT podem passar disso — e item com lease vencido volta para a fila (outro
        // worker pega) ou o sweeper fecha como outcome_unknown. A RPC so renova para o dono
        // vivo, entao o timer nao atrapalha quem legitimamente retomou o item.
        let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
        const stopHeartbeat = () => {
          if (heartbeatTimer !== undefined) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = undefined;
          }
        };
        heartbeatTimer = setInterval(() => {
          void supabase.rpc("heartbeat_multiplix_item", {
            p_item_id: item.item_id,
            p_claim_token: claim.claim_token,
            p_lease_seconds: 90,
          });
        }, 30_000);
        try {
          const typingDelay = randomBetween(dispatch.typing_delay_min, dispatch.typing_delay_max);

          try {
            // MX07: a presenca tem de sair com a identidade da MESMA instancia que vai enviar
            // (o adaptador faz o mesmo dentro do send). Antes ia so a key global e o evoFetch
            // caia no EVOLUTION_INSTANCE_TOKEN — token da instancia PADRAO — para uma instancia
            // qualquer; sem fallback, a presenca morria calada com 400.
            const presenceToken = await resolveInstanceToken(initialInstanceId);
            await evoFetch(
              evolutionUrl,
              evolutionKey,
              `/chat/updatePresence/${initialInstanceId}`,
              { number: phone, presence: "composing" },
              undefined,
              "POST",
              undefined,
              presenceToken ?? undefined,
            );
          } catch { /* Presence e best-effort */ }

          await sleep(typingDelay);

          const { data: beforeSend, error: beforeSendError } = await supabase
            .from("multiplix_dispatches")
            .select("status, send_window_start, send_window_end, business_hours_only, schedule_timezone, whatsapp_connection_id")
            .eq("id", dispatchId).single();
          if (beforeSendError) throw new Error(`multiplix_dispatch_state_lookup_failed: ${beforeSendError.message}`);
          const beforeSendWindowStatus = beforeSend ? deliveryWindowStatus(beforeSend) : { allowed: false as const, reason: "dispatch_not_found" };
          const beforeSendConnectionQuery = beforeSend?.whatsapp_connection_id
            ? supabase.from("whatsapp_connections").select("status, instance_id").eq("id", beforeSend.whatsapp_connection_id).maybeSingle()
            : supabase.from("whatsapp_connections").select("status, instance_id").eq("status", "connected").limit(1).maybeSingle();
          const { data: beforeSendConnection, error: beforeSendConnectionError } = await beforeSendConnectionQuery;
          if (beforeSendConnectionError) throw new Error(`multiplix_connection_state_lookup_failed: ${beforeSendConnectionError.message}`);
          const beforeSendInstanceId = liveTalkXInstanceId(beforeSendConnection);
          // MX07: o token tem de ser DA instancia que vai enviar (a conexao pode
          // ter trocado no meio do disparo). Sem token, pausa como connection_lost
          // — enviar sem ele faria o adaptador cair na key global, que e o defeito.
          const beforeSendInstanceToken = beforeSendInstanceId
            ? await resolveInstanceToken(beforeSendInstanceId)
            : null;
          if (beforeSend?.status !== "sending" || !beforeSendWindowStatus.allowed || !beforeSendInstanceId || !beforeSendInstanceToken) {
            if (beforeSend?.status === "sending") {
              // F10c: janela fechada no meio do disparo -> 'outside_window' (o cron
              // retoma); conexao ou token da instancia caiu -> 'connection_lost'
              // (exige operador).
              await pauseDispatch(beforeSendInstanceId && beforeSendInstanceToken ? "outside_window" : "connection_lost");
            }
            const { data: released, error: releaseError } = await supabase.rpc("release_multiplix_item_claim", {
              p_item_id: item.item_id,
              p_claim_token: claim.claim_token,
            });
            if (releaseError || released !== true) {
              throw new Error(`multiplix_recipient_claim_release_failed: ${releaseError?.message ?? "claim_not_owned"}`);
            }
            // F55: esta saida devolve o item a fila (release), entao o timer perde a razao de
            // existir agora — a RPC ja recusaria o token a partir daqui de qualquer forma.
            stopHeartbeat();
            break passLoop;
          }

          // F09: ultima checagem antes do POST — entre o claim e este ponto o
          // contato pode ter entrado na lista negra (opt-out).
          if (await isRecipientSuppressed(recipient.destino_e164)) {
            const { error: completionError } = await supabase.rpc("complete_multiplix_item", {
              p_item_id: item.item_id,
              p_claim_token: claim.claim_token,
              p_status: "skipped",
              p_error_message: "Contato na lista negra (opt-out)",
            });
            if (completionError) throw new Error(`multiplix_recipient_completion_failed: ${completionError.message}`);
            skippedCount++;
            processedCount++;
            continue;
          }

          const markProviderDispatch = async () => {
            const { error } = await supabase.rpc("mark_multiplix_item_dispatch_started", {
              p_item_id: item.item_id,
              p_claim_token: claim.claim_token,
            });
            if (error) throw new Error(`multiplix_provider_dispatch_mark_failed: ${error.message}`);
          };

          const abortCtrl = new AbortController();
          sendTimeout = setTimeout(() => abortCtrl.abort(), 20_000);

          // F56: o envio passa pelo adaptador (send) em vez de um POST montado a mao. Ele
          // acrescenta duas coisas que o POST cru nao fazia: PRESENCA (composing; recording
          // para nota de voz) e o fileName do documento — sem ele o PDF chega sem nome.
          // prepareMedia (F40) e quem decide o tipo REAL do arquivo: "document" no dispatch
          // podia esconder um JPEG, e o nome do arquivo so existe no bloco (F33).
          let prepared: PreparedForSend | null = null;
          if (recipientHasMedia) {
            const pronto = await prepareMedia(await mediaForSend(dispatch.media_url), {
              fileName: mediaFileNameFromBlock(block.content),
            });
            if (!pronto.ok) {
              throw new Error(`multiplix_media_rejected: ${pronto.reason}: ${pronto.detail}`);
            }
            prepared = {
              kind: kindForMedia(pronto.media.kind),
              // signedUrl e a URL que o envio DEVE usar (TTL amarrado ao envio), nao a original.
              url: pronto.media.signedUrl,
              fileName: pronto.media.fileName,
            };
          }
          await markProviderDispatch();
          providerPostAttempted = true;
          const envio = await send(
            prepared
              ? {
                kind: prepared.kind,
                to: phone,
                instanceId: beforeSendInstanceId,
                text: personalizedMsg,
                mediaUrl: prepared.url,
                fileName: prepared.fileName,
              }
              : { kind: "text", to: phone, instanceId: beforeSendInstanceId, text: personalizedMsg },
            {
              fetch: (u, o) => fetch(u, o),
              evolutionUrl,
              evolutionKey,
              // MX07: token DA instancia selecionada — rotas auth=instance (envio e
              // presenca) saem com a identidade dela, nunca com a key global.
              instanceToken: beforeSendInstanceToken,
              // O adaptador nao le env (roda tambem fora do Deno); a edge resolve e passa.
              flavor: (Deno.env.get("EVOLUTION_API_FLAVOR") ?? "go") === "v2" ? "v2" : "go",
              signal: abortCtrl.signal,
            },
          );
          clearTimeout(sendTimeout);

          if (envio.status >= 500) {
            throw new Error(`multiplix_provider_outcome_unknown: HTTP ${envio.status}`);
          }
          const sendResult: Record<string, unknown> = envio.body && typeof envio.body === "object"
            ? envio.body as Record<string, unknown>
            : {};
          const providerMessageId = envio.messageId ?? extractMessageId(sendResult);
          if (envio.ok && !sendResult.error && providerMessageId && providerMessageId.length <= 512) {
            sentCount++;
            if (dailyRoom !== null) dailyRoom -= 1;
            const { error: completionError } = await supabase.rpc("record_multiplix_item_sent", {
              p_item_id: item.item_id,
              p_claim_token: claim.claim_token,
              p_external_id: providerMessageId,
            });
            if (completionError) throw new Error(`multiplix_recipient_completion_failed: ${completionError.message}`);
          } else if (envio.ok && !sendResult.error) {
            throw new Error("multiplix_provider_outcome_unknown: missing_provider_message_id");
          } else {
            // F61: o operador le TEXTO, nunca o JSON do provedor. `providerErrorInfo`
            // traduz o par (status, corpo) pelo mapa do E095 e devolve o codigo ESTAVEL
            // do erro — assim "Numero nao existe no WhatsApp" chega na tela em vez de
            // {"status":400,"error":{"code":...}}. O corpo bruto nao entra no campo que
            // a tela mostra; o codigo vai para a trilha de eventos (abaixo).
            const providerError = providerErrorInfo(envio.status, envio.body);
            if (providerError.class === "transient") {
              // MX05: rejeicao TRANSITORIA inequivoca do provedor (rate limit / timeout de
              // rede) NAO e falha terminal — o item volta para a fila com o MESMO backoff com
              // teto do kernel (30 s / 2 min / 10 min) e so vira dead letter quando a RPC
              // esgotar as tentativas. Antes este ramo concluia o item como 'failed' e a
              // garantida pelo plano nunca acontecia (probe de rate limit: failed=1, rescheduleCalls=0).
              // Um 5xx NAO entra aqui: o resultado do POST e ambiguo e reenviar cego pode
              // duplicar mensagem (o caminho de outcome_unknown, acima, e a protecao de
              // idempotencia).
              // attempt_count do item + 1 e a tentativa que acabou de falhar (o claim ja
              // incrementou no banco; o valor que list_multiplix_claimable_items devolve e o
              // anterior).
              const attempt = (typeof item.attempt_count === "number" ? item.attempt_count : 0) + 1;
              const decision = planRetry(providerError, attempt);
              // Sem retryAfter o kernel ja decidiu dead_letter (attempt >= MAX_ATTEMPTS).
              // `new Date()` agendaria o retry para AGORA — proibido. O piso e o
              // primeiro degrau deterministico do backoff; quem transforma em
              // falha definitiva e a RPC, nao o relogio do worker.
              const retryAfter = decision.retryAfter ?? new Date(Date.now() + RETRY_BACKOFF_MS[0]).toISOString();
              const { data: schedResult, error: rescheduleError } = await supabase.rpc("reschedule_multiplix_item", {
                p_item_id: item.item_id,
                p_claim_token: claim.claim_token,
                p_retry_after: retryAfter,
                p_error_message: providerError.operatorMessage,
              });
              if (rescheduleError) throw new Error(`multiplix_recipient_reschedule_failed: ${rescheduleError.message}`);
              // Quem decide o TETO e a funcao SQL (attempt_count >= 3 -> failed); o worker so
              // informa quando tentar de novo — nunca reenvia sem fim.
              const schedAction = schedResult?.action;
              if (schedAction === "dead_lettered") failedCount++;
              // Mesma trilha de eventos do F61: classe + codigo estavel + status. O texto do
              // provedor nao entra (pode carregar dado de cliente). dead_lettered NAO e
              // reagendamento — a RPC ja marcou o item 'failed' no banco e a trilha registra
              // item_failed; payload.action guarda o veredicto da RPC para a auditoria.
              await supabase.from("multiplix_events").insert({
                dispatch_id: dispatchId,
                item_id: item.item_id,
                recipient_id: item.recipient_id ?? null,
                kind: schedAction === "dead_lettered" ? "item_failed" : "item_rescheduled",
                payload: {
                  error_class: providerError.class,
                  error_code: providerError.code,
                  provider_status: envio.status,
                  attempt,
                  retry_after: retryAfter,
                  action: schedAction,
                },
              });
            } else {
              const { error: completionError } = await supabase.rpc("complete_multiplix_item", {
                p_item_id: item.item_id,
                p_claim_token: claim.claim_token,
                p_status: "failed",
                p_error_message: providerError.operatorMessage,
              });
              if (completionError) throw new Error(`multiplix_recipient_completion_failed: ${completionError.message}`);
              failedCount++;
              // F61 (segunda metade): o codigo CRU (classe + codigo estavel + status HTTP)
              // vai para `multiplix_events`, que e onde quem depura olha. NAO grava o corpo
              // do provedor: ele pode carregar telefone/conteudo de cliente, e diagnostico
              // nao precisa disso — o par (classe, codigo) ja diz o que aconteceu.
              await supabase.from("multiplix_events").insert({
                dispatch_id: dispatchId,
                item_id: item.item_id,
                recipient_id: item.recipient_id ?? null,
                kind: "item_failed",
                payload: {
                  error_class: providerError.class,
                  error_code: providerError.code,
                  provider_status: envio.status,
                },
              });
              // F60 (gatilho): um erro PERMANENTE nao e azar de um item — e sinal de que a
              // CONEXAO esta em risco. Tres consecutivos, ou um banimento, pausam todos os
              // dispatches dela (a funcao decide o limiar; o worker so reporta o sinal).
              // `unknown` NAO conta: nao sabemos o que aconteceu, e pausar por duvida
              // derrubaria disparo bom.
              if (providerError.class === "permanent" && connection?.id) {
                const { error: riskError } = await supabase.rpc("register_multiplix_connection_failure", {
                  p_connection_id: connection.id,
                  p_signal: null,
                  p_error_class: "permanent",
                });
                // Nao derruba o envio: o item ja foi concluido acima. A marcacao de risco e
                // defesa em profundidade — falhar nela nao pode fazer o worker perder o item.
                if (riskError) console.error(`multiplix_connection_risk_failed: ${riskError.message}`);
              }
            }
          }
          stopHeartbeat();
        } catch (err) {
          clearTimeout(sendTimeout);
          stopHeartbeat();
          if (!providerPostAttempted) {
            const attemptSoFar = typeof item.attempt_count === "number" ? item.attempt_count : 0;
            const delayMs = RETRY_BACKOFF_MS[Math.min(attemptSoFar, RETRY_BACKOFF_MS.length - 1)];
            const retryAfter = new Date(Date.now() + delayMs).toISOString();
            const reason = err instanceof Error ? err.message : "pre_dispatch_error";
            const { data: schedResult } = await supabase.rpc("reschedule_multiplix_item", {
              p_item_id: item.item_id,
              p_claim_token: claim.claim_token,
              p_retry_after: retryAfter,
              p_error_message: reason.slice(0, 500),
            });
            if (schedResult?.action === "dead_lettered") failedCount++;
            processedCount++;
            const interval = randomBetween(dispatch.send_interval_min, dispatch.send_interval_max);
            await sleep(interval);
            continue;
          }
          const reason = err instanceof Error ? err.message : "request_failed";
          const { error: quarantineError } = await supabase.rpc("complete_multiplix_item", {
            p_item_id: item.item_id,
            p_claim_token: claim.claim_token,
            p_status: "outcome_unknown",
            p_error_message: `Provider outcome unknown: ${reason}`.slice(0, 1000),
          });
          if (quarantineError) {
            throw new Error(`multiplix_recipient_quarantine_failed: ${quarantineError.message}`);
          }
          outcomeUnknownCount++;
          processedCount++;
          const interval = randomBetween(dispatch.send_interval_min, dispatch.send_interval_max);
          await sleep(interval);
          continue;
        }

        processedCount++;
        if (processedCount % RELOAD_EVERY === 0) {
          const { data: fresh } = await supabase
            .from("multiplix_dispatches")
            .select("send_interval_min, send_interval_max, typing_delay_min, typing_delay_max, send_window_start, send_window_end, business_hours_only, speed_profile, schedule_timezone")
            .eq("id", dispatchId).single();
          if (fresh) {
            dispatch = { ...dispatch, ...fresh };
            const refreshedWindowStatus = deliveryWindowStatus(dispatch);
            if (!refreshedWindowStatus.allowed) {
              log.warn("Dispatch pausado automaticamente: fora da janela de envio", { correlationId, dispatchId });
              await pauseDispatch("outside_window");
              break passLoop;
            }
          }
        }
        const sendInterval = randomBetween(dispatch.send_interval_min, dispatch.send_interval_max);
        await sleep(sendInterval);
      }

      // F11a: encerra depois de UMA passada (o lote). Se ainda houver fila, o
      // cron reinvoca em ate 2 min — drenar aqui sustentava a edge aberta por
      // horas e podia estourar o limite de tempo no meio do disparo.
      break passLoop;
    }
    const { data: completed, error: completionError } = await supabase.rpc(
      "complete_multiplix_dispatch_if_drained", { p_dispatch_id: dispatchId },
    );
    if (completionError) throw new Error(`multiplix_dispatch_completion_failed: ${completionError.message}`);

    log.done(200, { correlationId, dispatchId, sent: sentCount, failed: failedCount, outcomeUnknown: outcomeUnknownCount });

    return new Response(
      JSON.stringify({
        success: true, sent: sentCount, failed: failedCount,
        total: selectedTotal,
        skipped: skippedCount,
        outcome_unknown: outcomeUnknownCount,
        completed: completed === true,
      }),
      { headers },
    );
  } catch (err) {
    log.error("Multiplix send error", { correlationId, error: err instanceof Error ? err.message : String(err) });
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers },
    );
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleMultiplixSend(req));
}
