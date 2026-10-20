import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { enforceRateLimit, errorResponse, getClientIP, handleCors, jsonResponse, Logger, requireAuth, requireEnv } from "../_shared/validation.ts";
import { SentimentAlertSchema, parseBody, validationErrorResponse } from "../_shared/schemas.ts";
import { buildSentimentNotification, escapeHtml, sentimentSettingsOwnerId, singleLineLabel } from "../_shared/notification-events.ts";
import { EMAIL_FONT_STACK } from "../_shared/email-font-stack.ts";

export async function handleSentimentAlertRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405, req);

  const log = new Logger("sentiment-alert");

  try {
    const auth = await requireAuth(req);
    if (auth instanceof Response) return auth;
    const rate = await enforceRateLimit(`sentiment-alert:${auth.userId}:${getClientIP(req)}`, 30, 60_000);
    if (!rate.allowed) return errorResponse('Rate limit exceeded', 429, req);

    const parsed = parseBody(SentimentAlertSchema, await req.json());
    if (!parsed.success) return validationErrorResponse(parsed, req);

    const { contactId, analysisId } = parsed.data;
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    const caller = createClient(supabaseUrl, requireEnv("SUPABASE_ANON_KEY"), {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: visibleAnalysis, error: visibleAnalysisError } = await caller
      .from('conversation_analyses')
      .select('id, contact_id, sentiment_score')
      .eq('id', analysisId)
      .eq('contact_id', contactId)
      .maybeSingle();
    if (visibleAnalysisError || !visibleAnalysis) {
      return errorResponse('Analysis not found', 404, req);
    }

    const supabase = createClient(supabaseUrl, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });

    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('name, phone, assigned_to')
      .eq('id', contactId)
      .single();
    if (contactError || !contact) return errorResponse('Contact not found', 404, req);

    let agentProfile: { id: string; name: string; email: string; user_id: string } | null = null;
    if (contact.assigned_to) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, name, email, user_id')
        .eq('id', contact.assigned_to)
        .single();
      if (profileError || !profile) return errorResponse('Assigned agent is unavailable', 503, req);
      agentProfile = profile;
    }

    const settingsOwnerId = sentimentSettingsOwnerId(auth.userId, agentProfile?.user_id);
    const notifyCaller = !agentProfile?.user_id || agentProfile.user_id === auth.userId;
    const { data: userSettings, error: userSettingsError } = await supabase
      .from('user_settings')
      .select('sentiment_alert_enabled, sentiment_alert_threshold, sentiment_consecutive_count')
      .eq('user_id', settingsOwnerId)
      .maybeSingle();
    if (userSettingsError) return errorResponse('Unable to load notification settings', 503, req);
    if (userSettings?.sentiment_alert_enabled === false) {
      return jsonResponse({ alerted: false, reason: 'Sentiment alerts disabled' }, 200, req);
    }
    const threshold = Math.min(100, Math.max(0,
      typeof userSettings?.sentiment_alert_threshold === 'number'
        ? userSettings.sentiment_alert_threshold
        : 30));
    const consecutiveRequired = Math.min(10, Math.max(1, Math.trunc(
      typeof userSettings?.sentiment_consecutive_count === 'number'
        ? userSettings.sentiment_consecutive_count
        : 2)));
    const sentimentScore = typeof visibleAnalysis.sentiment_score === 'number'
      ? visibleAnalysis.sentiment_score
      : 50;
    if (sentimentScore >= threshold) {
      return jsonResponse({ alerted: false, reason: 'Sentiment above threshold' }, 200, req);
    }

    const { data: recentAnalyses, error: fetchError } = await supabase
      .from('conversation_analyses')
      .select('id, sentiment_score, created_at')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(consecutiveRequired + 1);

    if (fetchError) throw fetchError;
    if (recentAnalyses?.[0]?.id !== analysisId) {
      return jsonResponse({ alerted: false, reason: 'Analysis is no longer current' }, 200, req);
    }

    let consecutiveLow = 0;
    for (const analysis of recentAnalyses || []) {
      if ((analysis.sentiment_score ?? 50) < threshold) {
        consecutiveLow++;
      } else {
        break;
      }
    }

    if (consecutiveLow < consecutiveRequired) {
      return jsonResponse({
        alerted: false,
        reason: `Not enough consecutive low sentiment analyses (${consecutiveLow}/${consecutiveRequired})`,
        consecutiveLow,
      }, 200, req);
    }

    const contactName = contact.name || 'Cliente';
    const previousScore = recentAnalyses?.[1]?.sentiment_score;
    const alertDetails = {
      type: 'sentiment_alert',
      contact_id: contactId,
      contact_name: contactName,
      contact_phone: contact.phone,
      sentiment_score: sentimentScore,
      previous_score: previousScore,
      consecutive_low: consecutiveLow,
      analysis_id: analysisId,
      agent_id: contact.assigned_to,
      agent_name: agentProfile?.name,
      message: `⚠️ Alerta de Sentimento: Cliente "${contactName}" apresenta sentimento negativo (${sentimentScore}%) em ${consecutiveLow} análises consecutivas.`,
      created_at: new Date().toISOString(),
    };

    const notification = buildSentimentNotification({
      notificationId: analysisId,
      userId: agentProfile?.user_id || auth.userId,
      contactName,
      metadata: alertDetails,
    });
    const { data: persistedAlert, error: persistError } = await supabase
      .rpc('persist_sentiment_alert', {
        p_analysis_id: analysisId,
        p_contact_id: contactId,
        p_recipient_user_id: agentProfile?.user_id || null,
        p_notification_title: notification.title,
        p_notification_message: notification.message,
        p_details: alertDetails,
      })
      .maybeSingle();
    if (persistError || !persistedAlert) {
      log.warn("Failed to persist atomic sentiment alert", { code: persistError?.code || 'unknown' });
      return errorResponse('Unable to persist sentiment alert', 503, req);
    }
    const persistence = persistedAlert as { notification_created?: unknown; duplicate?: unknown };
    const notificationCreated = persistence.notification_created === true;
    if (persistence.duplicate === true) {
      return jsonResponse({
        alerted: true,
        consecutiveLow,
        duplicate: true,
        emailSent: false,
        notificationCreated,
        notifyCaller,
      }, 200, req);
    }

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
            subject: `⚠️ Alerta: Sentimento negativo - ${singleLineLabel(contactName)}`,
            html: `<div style="font-family:${EMAIL_FONT_STACK};max-width:600px;margin:0 auto">
              <h2 style="color:#dc2626">⚠️ Alerta de Sentimento Negativo</h2>
              <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:16px;margin:16px 0">
                <p style="margin:0;font-size:16px">O cliente <strong>${escapeHtml(contactName)}</strong> apresenta sentimento negativo em <strong>${consecutiveLow} análises consecutivas</strong>.</p>
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
      notificationCreated,
      notifyCaller,
    }, 200, req);
  } catch (error: unknown) {
    log.error("Unhandled error", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse('Internal server error', 500, req);
  }
}

if (import.meta.main) Deno.serve(handleSentimentAlertRequest);
