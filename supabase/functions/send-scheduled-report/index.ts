import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger } from "../_shared/validation.ts";
import { ScheduledReportSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("send-scheduled-report");

  try {
    const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const parsed = parseBody(ScheduledReportSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { reportId } = parsed.data;

    const { data: report, error: reportError } = await supabase
      .from("scheduled_reports")
      .select("*")
      .eq("id", reportId)
      .single();

    if (reportError || !report) {
      return errorResponse("Report not found", 404, req);
    }

    let reportData: Record<string, unknown> = {};
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    switch (report.report_type) {
      case "dashboard_summary": {
        const { data: messages } = await supabase.from("messages").select("id, sender, created_at, is_read").gte("created_at", weekAgo.toISOString());
        const { data: contacts } = await supabase.from("contacts").select("id").gte("created_at", weekAgo.toISOString());
        reportData = {
          title: "Resumo do Dashboard",
          period: `${weekAgo.toLocaleDateString("pt-BR")} - ${now.toLocaleDateString("pt-BR")}`,
          totalMessages: messages?.length || 0,
          messagesReceived: messages?.filter(m => m.sender === "contact").length || 0,
          messagesSent: messages?.filter(m => m.sender === "agent").length || 0,
          newContacts: contacts?.length || 0,
        };
        break;
      }
      case "agent_performance": {
        const { data: agents } = await supabase.from("agent_stats").select("*, profiles(name, email)").order("xp", { ascending: false });
        reportData = {
          title: "Performance de Agentes",
          period: `${weekAgo.toLocaleDateString("pt-BR")} - ${now.toLocaleDateString("pt-BR")}`,
          agents: (agents || []).map((a: Record<string, unknown>) => ({
            name: (a.profiles as Record<string, unknown>)?.name || "N/A",
            messagesHandled: (a.messages_sent as number) + (a.messages_received as number),
            resolved: a.conversations_resolved, avgResponseTime: a.avg_response_time_seconds,
            satisfaction: a.customer_satisfaction_score, level: a.level, xp: a.xp,
          })),
        };
        break;
      }
      case "conversation_analytics": {
        const { data: analyses } = await supabase.from("conversation_analyses").select("*").gte("created_at", weekAgo.toISOString());
        reportData = {
          title: "Análise de Conversas",
          period: `${weekAgo.toLocaleDateString("pt-BR")} - ${now.toLocaleDateString("pt-BR")}`,
          totalAnalyses: analyses?.length || 0,
          avgSentiment: analyses?.length ? Math.round(analyses.reduce((sum: number, a: Record<string, unknown>) => sum + ((a.sentiment_score as number) || 50), 0) / analyses.length) : 0,
          avgSatisfaction: analyses?.length ? (analyses.reduce((sum: number, a: Record<string, unknown>) => sum + ((a.customer_satisfaction as number) || 3), 0) / analyses.length).toFixed(1) : "N/A",
        };
        break;
      }
      case "sla_compliance": {
        const { data: sla } = await supabase.from("conversation_sla").select("*").gte("created_at", weekAgo.toISOString());
        const total = sla?.length || 0;
        const responseBreached = sla?.filter((s: Record<string, unknown>) => s.first_response_breached).length || 0;
        const resolutionBreached = sla?.filter((s: Record<string, unknown>) => s.resolution_breached).length || 0;
        reportData = {
          title: "Cumprimento de SLA",
          period: `${weekAgo.toLocaleDateString("pt-BR")} - ${now.toLocaleDateString("pt-BR")}`,
          totalConversations: total,
          responseComplianceRate: total > 0 ? `${Math.round(((total - responseBreached) / total) * 100)}%` : "N/A",
          resolutionComplianceRate: total > 0 ? `${Math.round(((total - resolutionBreached) / total) * 100)}%` : "N/A",
          responseBreaches: responseBreached, resolutionBreaches: resolutionBreached,
        };
        break;
      }
    }

    const emailHtml = buildReportEmail(reportData);

    if (resendApiKey && report.recipients?.length > 0) {
      for (const recipient of report.recipients) {
        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "reports@noreply.lovable.app", to: recipient,
            subject: `📊 ${reportData.title} - ${reportData.period}`, html: emailHtml,
          }),
        });
        if (!emailResponse.ok) log.error(`Failed to send to ${recipient}`, { error: await emailResponse.text() });
      }
    }

    const nextSendAt = calculateNextSend(report.frequency);
    await supabase.from("scheduled_reports").update({ last_sent_at: now.toISOString(), next_send_at: nextSendAt }).eq("id", reportId);

    log.done(200);
    return jsonResponse({ success: true, reportData }, 200, req);
  } catch (error) {
    log.error("Error sending report", { error: (error as Error).message });
    return errorResponse((error as Error).message, 500, req);
  }
});

function calculateNextSend(frequency: string): string {
  const next = new Date();
  switch (frequency) {
    case "daily": next.setDate(next.getDate() + 1); next.setHours(8, 0, 0, 0); break;
    case "weekly": next.setDate(next.getDate() + ((1 + 7 - next.getDay()) % 7 || 7)); next.setHours(8, 0, 0, 0); break;
    case "monthly": next.setMonth(next.getMonth() + 1, 1); next.setHours(8, 0, 0, 0); break;
  }
  return next.toISOString();
}

function buildReportEmail(data: Record<string, unknown>): string {
  const rows = Object.entries(data)
    .filter(([key]) => key !== "title" && key !== "period" && key !== "agents")
    .map(([key, value]) =>
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:500;color:#333;">${formatKey(key)}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#555;">${value}</td></tr>`
    ).join("");

  let agentsTable = "";
  if (data.agents && Array.isArray(data.agents)) {
    agentsTable = `<h3 style="margin-top:24px;color:#333;">Ranking de Agentes</h3>
      <table style="width:100%;border-collapse:collapse;margin-top:8px;">
        <tr style="background:#f5f5f5;"><th style="padding:8px;text-align:left;">Agente</th><th style="padding:8px;text-align:center;">Mensagens</th><th style="padding:8px;text-align:center;">Resolvidas</th><th style="padding:8px;text-align:center;">Nível</th></tr>
        ${data.agents.map((a: Record<string, unknown>) => `<tr><td style="padding:8px;">${a.name}</td><td style="padding:8px;text-align:center;">${a.messagesHandled}</td><td style="padding:8px;text-align:center;">${a.resolved}</td><td style="padding:8px;text-align:center;">${a.level}</td></tr>`).join("")}
      </table>`;
  }

  return `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:20px;background:#f9fafb;">
    <div style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <div style="background:linear-gradient(135deg,#25D366,#128C7E);padding:24px;color:white;"><h1 style="margin:0;font-size:20px;">📊 ${data.title}</h1><p style="margin:4px 0 0;opacity:0.9;font-size:14px;">${data.period}</p></div>
      <div style="padding:24px;"><table style="width:100%;border-collapse:collapse;">${rows}</table>${agentsTable}</div>
      <div style="padding:16px 24px;background:#f9fafb;text-align:center;font-size:12px;color:#999;">Relatório gerado automaticamente • ZAPP Web</div>
    </div></body></html>`;
}

function formatKey(key: string): string {
  const map: Record<string, string> = {
    totalMessages: "Total de Mensagens", messagesReceived: "Mensagens Recebidas", messagesSent: "Mensagens Enviadas",
    newContacts: "Novos Contatos", totalAnalyses: "Análises Realizadas", avgSentiment: "Sentimento Médio",
    avgSatisfaction: "Satisfação Média", totalConversations: "Total de Conversas",
    responseComplianceRate: "Taxa de Resposta no Prazo", resolutionComplianceRate: "Taxa de Resolução no Prazo",
    responseBreaches: "Violações de Resposta", resolutionBreaches: "Violações de Resolução",
  };
  return map[key] || key;
}
