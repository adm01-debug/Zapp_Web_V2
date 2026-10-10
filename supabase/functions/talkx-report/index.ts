/**
 * talkx-report — E81: Gera e envia relatório de campanha Talk X por e-mail
 * Fixes CR: auth, CORS em erros, profiles.user_id fallback, skipped no pending,
 *           recipients error, HTML escape, 503 em resend_not_configured.
 * R2-API-038: as contagens por status deixam de sair de uma página de até 2000
 *             linhas e passam a ser contagens exatas no servidor (head/count),
 *             feitas no mesmo instante; `cancelled` e `outcome_unknown` são
 *             reportados explicitamente e nunca inferidos como pendentes.
 * talkx_campaign_report: usa a RPC multi-arg (p_campaign, p_from, p_to,
 *   p_granularity, p_segment) que retorna time_series, funnel e KPIs
 *   consolidados; substitui as contagens manuais por status.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { getCorsHeaders, handleCors, Logger } from "../_shared/validation.ts";
import { EMAIL_FONT_STACK } from "../_shared/email-font-stack.ts";

export interface TalkxReportDeps {
  supabase: SupabaseClient;
  env: { get: (name: string) => string | undefined };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────────────
export function escHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function jsonErr(req: Request, body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
  });
}

/**
 * R2-API-038: contagem exata de um status, direto no banco (count exact + head),
 * sem trazer linhas e sem teto de página. Devolve o número ou lança para o
 * chamador transformar em recusa — relatório com total incompleto não é enviado.
 */
// ─── Main handler ─────────────────────────────────────────────────────────────────────────────
export async function handleTalkxReport(req: Request, deps: TalkxReportDeps): Promise<Response> {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const { supabase, env } = deps;
  const RESEND_API_KEY = env.get('RESEND_API_KEY');
  const log = new Logger('talkx-report');

  try {
    // ── 0. Auth: identificar e autorizar o solicitante ────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonErr(req, { ok: false, reason: 'unauthorized' }, 401);
    const callerJwt = authHeader.replace('Bearer ', '');
    const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(callerJwt);
    if (authErr || !caller) return jsonErr(req, { ok: false, reason: 'unauthorized' }, 401);

    const { campaignId } = await req.json() as { campaignId: string };
    if (!campaignId) return jsonErr(req, { ok: false, reason: 'missing_campaignId' }, 400);

    // ── 1. Campanha ─────────────────────────────────────────────────────────────────
    const { data: campaign, error: campErr } = await supabase
      .from('talkx_campaigns')
      .select('id, name, status, total_recipients, sent_count, delivered_count, failed_count, started_at, completed_at, created_by')
      .eq('id', campaignId)
      .single();
    if (campErr || !campaign) return jsonErr(req, { ok: false, reason: 'campaign_not_found' }, 404);

    // ── 1b. Verificar propriedade: caller.id deve ser profiles.user_id do created_by ────────
    if (campaign.created_by) {
      const { data: creatorProfile } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('id', campaign.created_by)
        .single();
      if (!creatorProfile || creatorProfile.user_id !== caller.id) {
        return jsonErr(req, { ok: false, reason: 'forbidden' }, 403);
      }
    } else {
      return jsonErr(req, { ok: false, reason: 'forbidden' }, 403);
    }

    // ── 2. Email + nome do criador via profiles ────────────────────────────────────
    let recipientEmail: string | null = null;
    let recipientName = 'Usuário';
    let creatorUserId: string | null = null;
    {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, name, user_id')
        .eq('id', campaign.created_by)
        .single();
      recipientEmail = profile?.email ?? null;
      recipientName = profile?.name ?? recipientName;
      creatorUserId = profile?.user_id ?? null;
    }
    // Fallback: auth.users via profiles.user_id (não profiles.id)
    if (!recipientEmail && creatorUserId) {
      const { data: authUser } = await supabase.auth.admin.getUserById(creatorUserId);
      recipientEmail = authUser?.user?.email ?? null;
    }
    if (!recipientEmail) return jsonErr(req, { ok: false, reason: 'no_recipient_email' }, 422);

    // ── 3. Relatório via RPC talkx_campaign_report (substitui contagens manuais R2-API-038) ──
    const { from, to, granularity, segment } = await req.json() as {
      campaignId: string;
      from?: string;
      to?: string;
      granularity?: string;
      segment?: Record<string, unknown>;
    };
    if (!from) return jsonErr(req, { ok: false, reason: 'missing_from' }, 400);
    if (!to) return jsonErr(req, { ok: false, reason: 'missing_to' }, 400);
    const { data: report, error: reportErr } = await supabase.rpc('talkx_campaign_report', {
      p_campaign: campaignId,
      p_from: from,
      p_to: to,
      p_granularity: granularity ?? 'day',
      p_segment: segment ?? null,
    });
    if (reportErr || !report) {
      log.error('talkx_campaign_report RPC failed', { campaignId, error: reportErr?.message });
      return jsonErr(req, { ok: false, reason: 'report_rpc_failed', detail: reportErr?.message }, 502);
    }

    // ── 3b. Detalhamentos do relatório via RPC talkx_campaign_report_breakdowns ──
    const { data: breakdowns, error: breakdownsErr } = await supabase.rpc('talkx_campaign_report_breakdowns', {
      p_campaign: campaignId,
      p_from: from,
      p_to: to,
    });
    if (breakdownsErr || !breakdowns) {
      log.error('talkx_campaign_report_breakdowns RPC failed', { campaignId, error: breakdownsErr?.message });
      return jsonErr(req, { ok: false, reason: 'breakdowns_rpc_failed', detail: breakdownsErr?.message }, 502);
    }

    // ── 4. KPIs a partir do resultado da RPC ──────────────────────────────────
    const kpis = report.kpis ?? {};
    const total = kpis.total_recipients ?? 0;
    const sent = kpis.sent_count ?? 0;
    const failed = kpis.failed_count ?? 0;
    const sendRate = total > 0 ? ((sent / total) * 100).toFixed(1) : '—';
    const failRate = (sent + failed) > 0 ? ((failed / (sent + failed)) * 100).toFixed(1) : '—';
    const fmtDate = (d: string | null) =>
      d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

    // ── 5. E-mail HTML (com escape de valores dinâmicos) ──────────────────────────
    const safeCampaignName = escHtml(campaign.name);
    const safeRecipientName = escHtml(recipientName);
    const statusLabel: Record<string, string> = { completed: 'Concluída', sending: 'Enviando', paused: 'Pausada', cancelled: 'Cancelada', draft: 'Rascunho' };
    const funnel = report.funnel ?? {};
    const funnelTotal = funnel.total ?? 0;
    const funnelSent = funnel.sent ?? 0;
    const funnelDelivered = funnel.delivered ?? 0;
    const funnelOpened = funnel.opened ?? 0;
    const funnelClicked = funnel.clicked ?? 0;
    const funnelReplied = funnel.replied ?? 0;
    const funnelBounced = funnel.bounced ?? 0;
    const funnelRevenue = funnel.revenue ?? 0;
    const funnelSendRate = funnelTotal > 0 ? ((funnelSent / funnelTotal) * 100).toFixed(1) : '—';
    const funnelFailRate = (funnelSent + funnelBounced) > 0 ? ((funnelBounced / (funnelSent + funnelBounced)) * 100).toFixed(1) : '—';
    const htmlBody = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:${EMAIL_FONT_STACK}">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <div style="background:#6366f1;padding:28px 32px">
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700">📊 Relatório de Campanha</h1>
    <p style="margin:6px 0 0;color:#e0e7ff;font-size:14px">${safeCampaignName}</p>
  </div>
  <div style="padding:28px 32px">
    <p style="margin:0 0 20px;color:#374151;font-size:15px">Olá, <strong>${safeRecipientName}</strong>! Aqui está o resumo da campanha <strong>${safeCampaignName}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr style="background:#f9fafb"><td style="padding:10px 14px;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Status</td><td style="padding:10px 14px;font-size:14px;color:#111827;font-weight:700;border-bottom:1px solid #e5e7eb">${statusLabel[campaign.status] ?? campaign.status}</td></tr>
      <tr><td style="padding:10px 14px;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Total de destinatários</td><td style="padding:10px 14px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb">${funnelTotal.toLocaleString('pt-BR')}</td></tr>
      <tr style="background:#f9fafb"><td style="padding:10px 14px;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Enviadas</td><td style="padding:10px 14px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb">${funnelSent.toLocaleString('pt-BR')} (${funnelSendRate}%)</td></tr>
      <tr><td style="padding:10px 14px;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Falhas</td><td style="padding:10px 14px;font-size:14px;color:#dc2626;font-weight:700;border-bottom:1px solid #e5e7eb">${funnelBounced.toLocaleString('pt-BR')} (${funnelFailRate}%)</td></tr>
      <tr style="background:#f9fafb"><td style="padding:10px 14px;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Entregues</td><td style="padding:10px 14px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb">${funnelDelivered.toLocaleString('pt-BR')}</td></tr>
      <tr><td style="padding:10px 14px;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Abertas</td><td style="padding:10px 14px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb">${funnelOpened.toLocaleString('pt-BR')}</td></tr>
      <tr style="background:#f9fafb"><td style="padding:10px 14px;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Cliques</td><td style="padding:10px 14px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb">${funnelClicked.toLocaleString('pt-BR')}</td></tr>
      <tr><td style="padding:10px 14px;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Respostas</td><td style="padding:10px 14px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb">${funnelReplied.toLocaleString('pt-BR')}</td></tr>
      <tr style="background:#f9fafb"><td style="padding:10px 14px;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Receita</td><td style="padding:10px 14px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb">R$ ${(funnelRevenue / 100).toFixed(2)}</td></tr>
      <tr><td style="padding:10px 14px;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Iniciada em</td><td style="padding:10px 14px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb">${fmtDate(campaign.started_at)}</td></tr>
      <tr style="background:#f9fafb"><td style="padding:10px 14px;font-size:13px;color:#6b7280;font-weight:600">Concluída em</td><td style="padding:10px 14px;font-size:14px;color:#111827">${fmtDate(campaign.completed_at)}</td></tr>
    </table>
  </div>
  <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb">
    <p style="margin:0;color:#9ca3af;font-size:12px">E-mail gerado automaticamente pelo módulo Talk X · Pronto Talk Suite</p>
  </div>
</div>
</body></html>`;

    // ── 6. RESEND_API_KEY ausente: retorna 503 (não 200) ────────────────────────────
    if (!RESEND_API_KEY) {
      log.warn('RESEND_API_KEY não configurado');
      return jsonErr(req, { ok: false, reason: 'resend_not_configured' }, 503);
    }

    // ── 7. Envio via Resend ───────────────────────────────────────────────────────
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Talk X <relatorios@promobrindes.com.br>',
        to: [recipientEmail],
        subject: `📊 Relatório: ${safeCampaignName}`,
        html: htmlBody,
      }),
    });

    if (!emailRes.ok) {
      const body = await emailRes.text();
      log.error('Resend error', { status: emailRes.status, body });
      return jsonErr(req, { ok: false, reason: 'resend_error', detail: body }, 502);
    }

    log.info('Report sent', { campaignId, to: recipientEmail });
    return new Response(
      JSON.stringify({ ok: true, to: recipientEmail }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) } }
    );

  } catch (err) {
    log.error('Unhandled error', { err });
    return jsonErr(req, { ok: false, reason: 'internal_error', message: err instanceof Error ? err.message : 'Erro desconhecido' }, 500);
  }
}

if (import.meta.main) {
  Deno.serve((req) => {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    return handleTalkxReport(req, {
      supabase,
      env: { get: (name) => Deno.env.get(name) },
    });
  });
}
