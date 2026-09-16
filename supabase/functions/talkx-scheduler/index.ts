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
import { isWithinSendWindow } from "../_shared/talkx-window.ts";


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

    // ── 2. Campanhas pausadas por janela de envio (status='paused' + janela configurada) ───
    const { data: pausedCampaigns, error: pauseErr } = await supabase
      .from("talkx_campaigns")
      .select("id, name, send_window_start, send_window_end, business_hours_only")
      .eq("status", "paused")
      .not("paused_at", "is", null) // pausadas com timestamp (não rascunhos)
      .or("send_window_start.not.is.null,business_hours_only.eq.true"); // tem janela configurada

    if (pauseErr) {
      log.error("Error fetching paused campaigns", { error: pauseErr.message });
      // não abortar -- continua com os agendados
    }

    // Filtrar apenas as que estão dentro da janela agora
    const resumeCandidates = (pausedCampaigns ?? []).filter(isWithinSendWindow);

    if (!dueCampaigns?.length && !resumeCandidates.length) {
      return new Response(
        JSON.stringify({ success: true, message: "No campaigns due or resumable", checked_at: now }),
        { headers }
      );
    }

    const results: Array<Record<string, unknown>> = [];

    // ── 3. Invocar talkx-send para cada campanha ─────────────────────────────────────
    const allCampaigns = [
      ...(dueCampaigns ?? []).map((c) => ({ ...c, action: "start" as const })),
      ...resumeCandidates.map((c) => ({ ...c, action: "start" as const })), // talkx-send trata paused como retomada
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
        const isResume = 'send_window_start' in campaign;
        results.push({ campaignId: campaign.id, name: campaign.name, success: accepted, action: isResume ? 'resume' : 'start', result });
        if (accepted) {
          log.info(`Campaign ${isResume ? 'resumed' : 'started'}: ${campaign.name} (${campaign.id})`);
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
