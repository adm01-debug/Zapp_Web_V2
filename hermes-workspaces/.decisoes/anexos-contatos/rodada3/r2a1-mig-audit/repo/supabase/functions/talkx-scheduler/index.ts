/**
 * Talk X Scheduler — Inicia campanhas agendadas e retoma campanhas pausadas por janela de envio
 * Chamado pelo pg_cron a cada minuto.
 *
 * Retomada automática (E83 extensão):
 * Campanhas com status='paused' pausadas pelo mid-loop window check têm paused_at
 * preenchido, mas pause_reason='outside_send_window' NÃO é um campo obrigatório ainda.
 * Em vez de depender do motivo, verificamos aqui se a campanha tem janela configurada
 * e se o horário atual está dentro dela -- se sim, retomamos via talkx-send action='start'.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, handleCors, Logger } from "../_shared/validation.ts";
import { AUTO_RESUME_REASONS, connectionStatusResolver, selectResumableCampaigns } from "../_shared/talkx-resume-policy.ts";


// ─── Handler principal ──────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const headers = { ...getCorsHeaders(req), "Content-Type": "application/json" };
  const log = new Logger("talkx-scheduler");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date().toISOString();

    // ── 1. Campanhas agendadas (status='scheduled' + scheduled_at vencido) ──────────
    const { data: dueCampaigns, error: schedErr } = await supabase
      .from("talkx_campaigns")
      .select("id, name, scheduled_at")
      .eq("status", "scheduled")
      .lte("scheduled_at", now);

    if (schedErr) {
      log.error("Error fetching scheduled campaigns", { error: schedErr.message });
      return new Response(JSON.stringify({ error: schedErr.message }), { status: 500, headers });
    }

    // ── 2. Campanhas pausadas que PODEM ser retomadas ──────────────────────────────
    // V03: antes bastava ter janela configurada, então uma campanha pausada À MÃO
    // pelo operador voltava a enviar no minuto seguinte, e uma pausa por queda de
    // conexão voltava sem a conexão de pé. Agora o motivo decide. O .in() abaixo e
    // a revalidação em selectResumableCampaigns são redundantes de propósito:
    // a query não deixa passar motivo manual, e a decisão revalida linha a linha.
    const { data: pausedCampaigns, error: pauseErr } = await supabase
      .from("talkx_campaigns")
      .select("id, name, pause_reason, whatsapp_connection_id, schedule_timezone, send_window_start, send_window_end, business_hours_only")
      .eq("status", "paused")
      .not("paused_at", "is", null) // pausadas com timestamp (não rascunhos)
      .in("pause_reason", [...AUTO_RESUME_REASONS]);

    if (pauseErr) {
      log.error("Error fetching paused campaigns", { error: pauseErr.message });
      // não abortar -- continua com os agendados
    }

    // Status das conexões das candidatas (uma consulta só, não uma por campanha)
    const connectionIds = [...new Set(
      (pausedCampaigns ?? [])
        .map((c) => c.whatsapp_connection_id)
        .filter((id): id is string => typeof id === "string"),
    )];
    const connectionStatusById = new Map<string, string | null>();
    if (connectionIds.length > 0) {
      const { data: connections, error: connectionsErr } = await supabase
        .from("whatsapp_connections")
        .select("id, status")
        .in("id", connectionIds);
      if (connectionsErr) {
        log.error("Error fetching connections for auto-resume", { error: connectionsErr.message });
      }
      for (const connection of connections ?? []) {
        connectionStatusById.set(connection.id as string, (connection.status as string | null) ?? null);
      }
    }

    const resumeDecisions = selectResumableCampaigns(
      pausedCampaigns ?? [],
      connectionStatusResolver(connectionStatusById),
    );
    const resumeCandidates = resumeDecisions.filter((d) => d.resume);
    for (const skipped of resumeDecisions.filter((d) => !d.resume)) {
      // Visível no log do scheduler: "deixei essa pausada e por quê".
      log.info(`Pausa não retomada automaticamente: ${skipped.name ?? skipped.id}`, {
        campaignId: skipped.id,
        pauseReason: skipped.pauseReason,
        because: skipped.because,
      });
    }

    if (!dueCampaigns?.length && !resumeCandidates.length) {
      return new Response(
        JSON.stringify({ success: true, message: "No campaigns due or resumable", checked_at: now }),
        { headers }
      );
    }

    const results: Array<Record<string, unknown>> = [];

    // ── 3. Invocar talkx-send para cada campanha ─────────────────────────────────────
    const allCampaigns = [
      ...(dueCampaigns ?? []).map((c) => ({ id: c.id, name: c.name, action: "start" as const, autoResumed: false as const, pauseReason: null as string | null })),
      ...resumeCandidates.map((c) => ({ id: c.id, name: c.name, action: "start" as const, autoResumed: true as const, pauseReason: c.pauseReason })), // talkx-send trata paused como retomada
    ];

    for (const campaign of allCampaigns) {
      try {
        const response = await fetch(
          `${supabaseUrl}/functions/v1/talkx-send`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({ campaignId: campaign.id, action: campaign.action }),
          }
        );
        const result = await response.json().catch(() => null);
        const accepted = response.ok
          && !!result
          && typeof result === "object"
          && (result as { success?: unknown }).success === true;
        const isResume = campaign.autoResumed;
        results.push({ campaignId: campaign.id, name: campaign.name, success: accepted, action: isResume ? 'resume' : 'start', result });
        if (accepted) {
          log.info(`Campaign ${isResume ? 'resumed' : 'started'}: ${campaign.name} (${campaign.id})`);
          if (isResume) {
            // V03: rastro na trilha da campanha. Falha aqui não derruba a retomada
            // -- o envio já foi aceito; o rastro é secundário e fica no log.
            const { error: eventError } = await supabase.from("talkx_campaign_events").insert({
              campaign_id: campaign.id,
              event_type: "resumed_auto",
              message: campaign.pauseReason === "connection_lost"
                ? "Retomada automática: conexão do WhatsApp restabelecida"
                : "Retomada automática: janela de envio aberta",
            });
            if (eventError) log.warn(`Falha ao registrar evento resumed_auto (${campaign.id})`, { error: eventError.message });
          }
        } else if (isResume) {
          log.warn(`Paused campaign was not resumed: ${campaign.name} (${campaign.id})`, { httpStatus: response.status });
        } else {
          log.warn(`Scheduled campaign was not accepted: ${campaign.name} (${campaign.id})`, { httpStatus: response.status });
        }
      } catch (err) {
        log.error(`Failed for campaign ${campaign.id}`, { error: err instanceof Error ? err.message : String(err) });
        results.push({ campaignId: campaign.id, name: campaign.name, success: false, error: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    log.done(200, {
      started: results.filter((r) => r.success && r.action === 'start').length,
      resumed: results.filter((r) => r.success && r.action === 'resume').length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        started: results.filter((r) => r.success && r.action === 'start').length,
        resumed: results.filter((r) => r.success && r.action === 'resume').length,
        failed: results.filter((r) => !r.success).length,
        details: results,
      }),
      { headers }
    );
  } catch (err) {
    log.error("Scheduler error", { error: err instanceof Error ? err.message : String(err) });
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers }
    );
  }
});
