import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger } from "../_shared/validation.ts";
import { SentimentAlertSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("sentiment-alert");

  try {
    const parsed = parseBody(SentimentAlertSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { contactId, contactName, sentimentScore, previousScore, analysisId, threshold, consecutiveRequired } = parsed.data;

    log.info("Sentiment alert triggered", { contactId, sentimentScore, threshold, consecutiveRequired });

    const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));

    const { data: recentAnalyses, error: fetchError } = await supabase
      .from('conversation_analyses')
      .select('id, sentiment_score, created_at')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit((consecutiveRequired ?? 3) + 1);

    if (fetchError) throw fetchError;

    let consecutiveLow = 0;
    for (const analysis of recentAnalyses || []) {
      if ((analysis.sentiment_score ?? 50) < (threshold ?? 30)) {
        consecutiveLow++;
      } else {
        break;
      }
    }

    if (consecutiveLow < (consecutiveRequired ?? 3)) {
      return jsonResponse({
        alerted: false,
        reason: `Not enough consecutive low sentiment analyses (${consecutiveLow}/${consecutiveRequired})`,
        consecutiveLow,
      }, 200, req);
    }

    const { data: contact } = await supabase
      .from('contacts')
      .select('name, phone, assigned_to')
      .eq('id', contactId)
      .single();

    let agentProfile: { id: string; name: string; email: string; user_id: string } | null = null;
    if (contact?.assigned_to) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, name, email, user_id')
        .eq('id', contact.assigned_to)
        .single();
      agentProfile = profile;
    }

    const alertDetails = {
      type: 'sentiment_alert',
      contact_id: contactId,
      contact_name: contact?.name || contactName,
      contact_phone: contact?.phone,
      sentiment_score: sentimentScore,
      previous_score: previousScore,
      consecutive_low: consecutiveLow,
      analysis_id: analysisId,
      agent_id: contact?.assigned_to,
      agent_name: agentProfile?.name,
      message: `⚠️ Alerta de Sentimento: Cliente "${contact?.name || contactName}" apresenta sentimento negativo (${sentimentScore}%) em ${consecutiveLow} análises consecutivas.`,
      created_at: new Date().toISOString(),
    };

    const { error: logError } = await supabase
      .from('audit_logs')
      .insert({
        action: 'sentiment_alert',
        entity_type: 'contact',
        entity_id: contactId,
        user_id: agentProfile?.user_id || null,
        details: alertDetails,
      });

    if (logError) log.warn("Failed to log alert", { error: logError.message });

    let emailSent = false;
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

    if (RESEND_API_KEY && agentProfile?.email) {
      try {
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Alertas <onboarding@resend.dev>',
            to: [agentProfile.email],
            subject: `⚠️ Alerta: Sentimento negativo - ${contact?.name || contactName}`,
            html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
              <h2 style="color:#dc2626">⚠️ Alerta de Sentimento Negativo</h2>
              <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:16px;margin:16px 0">
                <p style="margin:0;font-size:16px">O cliente <strong>${contact?.name || contactName}</strong> apresenta sentimento negativo em <strong>${consecutiveLow} análises consecutivas</strong>.</p>
              </div>
              <table style="width:100%;border-collapse:collapse;margin:16px 0">
                <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>Score Atual:</strong></td><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#dc2626;font-weight:bold">${sentimentScore}%</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>Análises Negativas:</strong></td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${consecutiveLow} consecutivas</td></tr>
              </table>
              <p style="color:#9ca3af;font-size:12px;margin-top:24px">Alerta automático do sistema de análise de conversas.</p>
            </div>`,
          }),
        });
        emailSent = emailResponse.ok;
      } catch (emailError) {
        log.error("Failed to send email alert", { error: emailError instanceof Error ? emailError.message : String(emailError) });
      }
    }

    log.done(200, { consecutiveLow, emailSent });
    return jsonResponse({
      alerted: true,
      consecutiveLow,
      emailSent,
      agentNotified: agentProfile?.name || null,
      alertDetails,
    }, 200, req);
  } catch (error: unknown) {
    log.error("Unhandled error", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(error instanceof Error ? error.message : 'Unknown error', 500, req);
  }
});
