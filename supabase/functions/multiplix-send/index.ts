/**
 * Multiplix — motor de envio (claim/lease/backoff)
 * Mesmo padrao de talkx-send (claim_talkx_recipient/complete_talkx_recipient/
 * reschedule_talkx_recipient/complete_talkx_campaign_if_drained), adaptado
 * para multiplix_dispatches/multiplix_recipients. Sem variantes A/B e sem link
 * de rastreamento {{link}} — fora de escopo desta etapa. A lista de supressao
 * (opt-out) e consultada em talkx_recipient_is_suppressed logo apos o claim e de
 * novo imediatamente antes do POST ao provedor (F09).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, handleCors, Logger } from "../_shared/validation.ts";
import { evoFetch, extractMessageId } from "../_shared/evolution-send.ts";
import { DEFAULT_SCHEDULE_TIMEZONE, deliveryWindowStatus } from "../_shared/talkx-window.ts";
import { resolvePrivateBucketUrl } from "../_shared/evolution-api-proxy.ts";
import { liveTalkXInstanceId } from "../_shared/talkx-delivery-connection.ts";

function getGreeting(timeZone = DEFAULT_SCHEDULE_TIMEZONE): string {
  const hour = new Date().toLocaleString("pt-BR", { timeZone, hour: "numeric", hour12: false });
  const h = parseInt(hour, 10);
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

export function personalizeMultiplix(template: string, company: { name?: string | null }, timeZone = DEFAULT_SCHEDULE_TIMEZONE): string {
  let result = template.replace(/\{\{saudacao\}\}/gi, getGreeting(timeZone));
  result = result.replace(/\{\{empresa\}\}/gi, company.name || '');
  // Um placeholder fora de {{empresa}}/{{saudacao}} chegaria intacto na mensagem real
  // do WhatsApp sem erro nem aviso — falha explicita evita esse vazamento (mesmo
  // principio de talkx-send/personalize).
  const unknownPlaceholder = result.match(/\{\{[^}]+\}\}/);
  if (unknownPlaceholder) {
    throw new Error(`unknown_placeholder: ${unknownPlaceholder[0]}`);
  }
  return result;
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMediaEndpoint(mediaType: string): string {
  switch (mediaType) {
    case "audio": return "sendWhatsAppAudio";
    default: return "sendMedia";
  }
}

export async function handleMultiplixSend(
  req: Request,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _injected?: { supabase?: any; serviceKey?: string },
): Promise<Response> {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const headers = { ...getCorsHeaders(req), "Content-Type": "application/json" };
  const log = new Logger("multiplix-send");

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
        if (isAdminOrSupervisor !== true) {
          const { data: manageAll, error: permissionError } = await supabase.rpc("user_has_permission", {
            _user_id: user.id, _permission_name: "multiplix.dispatch.manage_all",
          });
          hasManageAll = !permissionError && manageAll === true;
          if (!hasManageAll) {
            return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
          }
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
        log.warn("Cota diaria indisponivel: seguindo sem limite diario", { dispatchId });
        return null;
      }
      return remaining;
    };
    let dailyRoom = await resolveDailyRoom();

    const pauseDispatch = async (pauseReason: string) => {
      const { error } = await supabase.rpc("transition_multiplix_dispatch", {
        p_dispatch_id: dispatchId, p_action: "pause", p_pause_reason: pauseReason,
      });
      // 55000 = transicao invalida (ja nao esta mais em 'sending'): nao e erro.
      if (error && error.code !== "55000") {
        throw new Error(`multiplix_dispatch_auto_pause_failed: ${error.message}`);
      }
    };

    passLoop: for (;;) {
      const { data: recipients, error: recipientsError } = await supabase
        .from("multiplix_recipients")
        .select("*")
        .eq("dispatch_id", dispatchId)
        .in("status", ["pending", "sending"])
        .or("retry_after.is.null,retry_after.lte." + new Date().toISOString())
        .order("created_at")
        .limit(batchSize);
      if (recipientsError) throw new Error(`multiplix_recipients_lookup_failed: ${recipientsError.message}`);
      if (!recipients || recipients.length === 0) break;
      selectedTotal += recipients.length;
      let claimedInPass = 0;

      for (const recipient of recipients) {
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

        const { data: claimRows, error: claimError } = await supabase.rpc("claim_multiplix_recipient", {
          p_dispatch_id: dispatchId,
          p_recipient_id: recipient.id,
          p_worker: workerId,
          p_lease_seconds: 90,
        });
        if (claimError) throw new Error(`multiplix_recipient_claim_failed: ${claimError.message}`);
        const claim = Array.isArray(claimRows) ? claimRows[0] : null;
        if (!claim?.claim_token) continue;
        claimedInPass++;

        // F09: opt-out conferido assim que o destinatario e reivindicado. Quem
        // esta na lista negra vira 'skipped' com motivo (nao volta para a fila).
        if (await isRecipientSuppressed(recipient.destino_e164)) {
          const { error: completionError } = await supabase.rpc("complete_multiplix_recipient", {
            p_recipient_id: recipient.id,
            p_claim_token: claim.claim_token,
            p_status: "skipped",
            p_error_message: "Contato na lista negra (opt-out)",
          });
          if (completionError) throw new Error(`multiplix_recipient_completion_failed: ${completionError.message}`);
          skippedCount++;
          processedCount++;
          continue;
        }

        if (!recipient.destino_e164) {
          const { error: completionError } = await supabase.rpc("complete_multiplix_recipient", {
            p_recipient_id: recipient.id,
            p_claim_token: claim.claim_token,
            p_status: "skipped",
            p_error_message: "Sem destino de WhatsApp",
          });
          if (completionError) throw new Error(`multiplix_recipient_completion_failed: ${completionError.message}`);
          skippedCount++;
          processedCount++;
          continue;
        }

        let personalizedMsg: string = recipient.personalized_message;
        if (!personalizedMsg) {
          let calculatedMessage: string;
          try {
            calculatedMessage = personalizeMultiplix(
              dispatch.message_template,
              { name: recipient.company_name_snapshot },
              typeof dispatch.schedule_timezone === "string" ? dispatch.schedule_timezone : DEFAULT_SCHEDULE_TIMEZONE,
            );
          } catch (e) {
            const { error: completionError } = await supabase.rpc("complete_multiplix_recipient", {
              p_recipient_id: recipient.id,
              p_claim_token: claim.claim_token,
              p_status: "failed",
              p_error_message: e instanceof Error ? e.message : "Erro ao montar mensagem",
            });
            if (completionError) throw new Error(`multiplix_recipient_completion_failed: ${completionError.message}`);
            failedCount++;
            processedCount++;
            continue;
          }
          const { data: snapshotMessage, error: snapshotError } = await supabase.rpc("persist_multiplix_recipient_message_snapshot", {
            p_recipient_id: recipient.id,
            p_claim_token: claim.claim_token,
            p_personalized_message: calculatedMessage,
          });
          if (snapshotError) throw new Error(`multiplix_message_snapshot_failed: ${snapshotError.message}`);
          personalizedMsg = snapshotMessage as string;
        }

        const recipientHasMedia = typeof dispatch.media_url === "string" && typeof dispatch.media_type === "string";

        let providerPostAttempted = false;
        let sendTimeout: ReturnType<typeof setTimeout> | undefined;
        try {
          const phone = recipient.destino_e164.replace(/\D/g, "");
          const typingDelay = randomBetween(dispatch.typing_delay_min, dispatch.typing_delay_max);

          try {
            await evoFetch(evolutionUrl, evolutionKey, `/chat/updatePresence/${initialInstanceId}`, { number: phone, presence: "composing" });
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
          if (beforeSend?.status !== "sending" || !beforeSendWindowStatus.allowed || !beforeSendInstanceId) {
            if (beforeSend?.status === "sending") {
              // F10c: janela fechada no meio do disparo -> 'outside_window' (o cron
              // retoma); conexao caiu -> 'connection_lost' (exige operador).
              await pauseDispatch(beforeSendInstanceId ? "outside_window" : "connection_lost");
            }
            const { data: released, error: releaseError } = await supabase.rpc("release_multiplix_recipient_claim", {
              p_recipient_id: recipient.id,
              p_claim_token: claim.claim_token,
            });
            if (releaseError || released !== true) {
              throw new Error(`multiplix_recipient_claim_release_failed: ${releaseError?.message ?? "claim_not_owned"}`);
            }
            break passLoop;
          }

          // F09: ultima checagem antes do POST — entre o claim e este ponto o
          // contato pode ter entrado na lista negra (opt-out).
          if (await isRecipientSuppressed(recipient.destino_e164)) {
            const { error: completionError } = await supabase.rpc("complete_multiplix_recipient", {
              p_recipient_id: recipient.id,
              p_claim_token: claim.claim_token,
              p_status: "skipped",
              p_error_message: "Contato na lista negra (opt-out)",
            });
            if (completionError) throw new Error(`multiplix_recipient_completion_failed: ${completionError.message}`);
            skippedCount++;
            processedCount++;
            continue;
          }

          let sendResponse: Response;
          const markProviderDispatch = async () => {
            const { error } = await supabase.rpc("mark_multiplix_recipient_dispatch_started", {
              p_recipient_id: recipient.id,
              p_claim_token: claim.claim_token,
            });
            if (error) throw new Error(`multiplix_provider_dispatch_mark_failed: ${error.message}`);
          };

          const abortCtrl = new AbortController();
          sendTimeout = setTimeout(() => abortCtrl.abort(), 20_000);

          if (recipientHasMedia) {
            const mediaEndpoint = getMediaEndpoint(dispatch.media_type);
            const mediaSource = await mediaForSend(dispatch.media_url);
            await markProviderDispatch();
            providerPostAttempted = true;
            sendResponse = await evoFetch(evolutionUrl, evolutionKey,
              `/message/${mediaEndpoint}/${beforeSendInstanceId}`,
              dispatch.media_type === "audio"
                ? { number: phone, audio: mediaSource, delay: 0 }
                : { number: phone, mediatype: dispatch.media_type, media: mediaSource, caption: personalizedMsg, delay: 0 },
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

          if (sendResponse.status >= 500) {
            throw new Error(`multiplix_provider_outcome_unknown: HTTP ${sendResponse.status}`);
          }
          let sendResult: Record<string, unknown>;
          try {
            sendResult = await sendResponse.json();
          } catch {
            throw new Error("multiplix_provider_outcome_unknown: invalid_response_body");
          }

          const providerMessageId = extractMessageId(sendResult);
          if (sendResponse.ok && !sendResult.error && providerMessageId && providerMessageId.length <= 512) {
            sentCount++;
            if (dailyRoom !== null) dailyRoom -= 1;
            const { error: completionError } = await supabase.rpc("record_multiplix_recipient_sent", {
              p_recipient_id: recipient.id,
              p_claim_token: claim.claim_token,
              p_external_id: providerMessageId,
            });
            if (completionError) throw new Error(`multiplix_recipient_completion_failed: ${completionError.message}`);
          } else if (sendResponse.ok && !sendResult.error) {
            throw new Error("multiplix_provider_outcome_unknown: missing_provider_message_id");
          } else {
            failedCount++;
            const { error: completionError } = await supabase.rpc("complete_multiplix_recipient", {
              p_recipient_id: recipient.id,
              p_claim_token: claim.claim_token,
              p_status: "failed",
              p_error_message: String(sendResult?.message || sendResult?.error || "Erro ao enviar"),
            });
            if (completionError) throw new Error(`multiplix_recipient_completion_failed: ${completionError.message}`);
          }
        } catch (err) {
          clearTimeout(sendTimeout);
          if (!providerPostAttempted) {
            const backoffMs = [30_000, 120_000, 600_000];
            const attemptSoFar = typeof recipient.attempt_count === "number" ? recipient.attempt_count : 0;
            const delayMs = backoffMs[Math.min(attemptSoFar, backoffMs.length - 1)];
            const retryAfter = new Date(Date.now() + delayMs).toISOString();
            const reason = err instanceof Error ? err.message : "pre_dispatch_error";
            const { data: schedResult } = await supabase.rpc("reschedule_multiplix_recipient", {
              p_recipient_id: recipient.id,
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
          const { error: quarantineError } = await supabase.rpc("complete_multiplix_recipient", {
            p_recipient_id: recipient.id,
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
              log.warn("Dispatch pausado automaticamente: fora da janela de envio", { dispatchId });
              await pauseDispatch("outside_window");
              break passLoop;
            }
          }
        }
        const sendInterval = randomBetween(dispatch.send_interval_min, dispatch.send_interval_max);
        await sleep(sendInterval);
      }

      // Nenhum item reivindicado nesta passada: a fila esta com outro worker ou
      // com os leases vencendo — repetir agora seria passada vazia.
      if (claimedInPass === 0) break;
    }
    const { data: completed, error: completionError } = await supabase.rpc(
      "complete_multiplix_dispatch_if_drained", { p_dispatch_id: dispatchId },
    );
    if (completionError) throw new Error(`multiplix_dispatch_completion_failed: ${completionError.message}`);

    log.done(200, { sent: sentCount, failed: failedCount, outcomeUnknown: outcomeUnknownCount });

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
    log.error("Multiplix send error", { error: err instanceof Error ? err.message : String(err) });
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers },
    );
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleMultiplixSend(req));
}
