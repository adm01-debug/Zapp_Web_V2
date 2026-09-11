/**
 * talkx-report — E81: Gera e envia relatório de campanha Talk X por e-mail
 * Fixes CR: auth, CORS em erros, profiles.user_id fallback, skipped no pending,
 *           recipients error, HTML escape, 503 em resend_not_configured.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, handleCors, Logger } from "../_shared/validation.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────────────────
function escCsv(v: string): string {
  const FORMULA_PREFIX = /^[=+\-@\t\r\n]/;
  let safe = v;
  if (FORMULA_PREFIX.test(safe)) safe = "'" + safe;
  if (safe.includes(',') || safe.includes('"') || safe.includes('\r') || safe.includes('\n')) {
    return '"' + safe.replace(/"/g, '""') + '"';
  }
  return safe;
}

function escHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildCsv(rows: Record<string, string | null>[]): string {
  if (rows.length === 0) return '';
  const hdrs = Object.keys(rows[0]);
  const lines = [
    hdrs.map(escCsv).join(','),
    ...rows.map((r) => hdrs.map((h) => escCsv(r[h] ?? '')).join(','))
  ];
  return '\uFEFF' + lines.join('\r\n');
}

function jsonErr(req: Request, body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
  });
}

// ─── Main handler ─────────────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors(req);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
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

    // ── 3. Recipients (máx 2000) ────────────────────────────────────────────────
    const { data: recipients, error: recipientsErr } = await supabase
      .from('talkx_recipients')
      .select('status, sent_at, delivered_at, error_message, contacts:contact_id(name, phone)')
      .eq('campaign_id', campaignId)
      .order('updated_at', { ascending: false })
      .limit(2000);
    if (recipientsErr) {
      log.error('Recipients query failed', { campaignId, error: recipientsErr.message });
      return jsonErr(req, { ok: false, reason: 'recipients_query_failed' }, 502);
    }

    type Recip = { status: string; sent_at: string | null; delivered_at: string | null; error_message: string | null; contacts: { name: string; phone: string } | null };
    const csvRows = (recipients ?? []).map((r: unknown) => {
      const row = r as Recip;
      return {
        'Nome': row.contacts?.name ?? '',
        'Telefone': row.contacts?.phone ?? '',
        'Status': row.status,
        'Enviada em': row.sent_at ? new Date(row.sent_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '',
        'Entregue em': row.delivered_at ? new Date(row.delivered_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '',
        'Erro': row.error_message ?? '',
      };
    });
    const csvContent = buildCsv(csvRows);
    const csvBase64 = btoa(unescape(encodeURIComponent(csvContent)));

    // ── 4. KPIs ────────────────────────────────────────────────────────────────────────
    const total = campaign.total_recipients ?? 0;
    const sent = campaign.sent_count ?? 0;
    const failed = campaign.failed_count ?? 0;
    // Calcular skipped a partir dos recipients carregados (evita query extra)
    const skipped = (recipients ?? []).filter((r: unknown) => (r as { status: string }).status === 'skipped').length;
    const pending = Math.max(0, total - sent - failed - skipped);
    const sendRate = total > 0 ? ((sent / total) * 100).toFixed(1) : '—';
    const failRate = (sent + failed) > 0 ? ((failed / (sent + failed)) * 100).toFixed(1) : '—';
    const fmtDate = (d: string | null) =>
      d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

    // ── 5. E-mail HTML (com escape de valores dinâmicos) ──────────────────────────
    const safeCampaignName = escHtml(campaign.name);
    const safeRecipientName = escHtml(recipientName);
    const statusLabel: Record<string, string> = { completed: 'Concluída', sending: 'Enviando', paused: 'Pausada', cancelled: 'Cancelada', draft: 'Rascunho' };
    const htmlBody = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <div style="background:#6366f1;padding:28px 32px">
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700">📊 Relatório de Campanha</h1>
    <p style="margin:6px 0 0;color:#e0e7ff;font-size:14px">${safeCampaignName}</p>
  </div>
  <div style="padding:28px 32px">
    <p style="margin:0 0 20px;color:#374151;font-size:15px">Olá, <strong>${safeRecipientName}</strong>! Aqui está o resumo da campanha <strong>${safeCampaignName}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr style="background:#f9fafb"><td style="padding:10px 14px;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Status</td><td style="padding:10px 14px;font-size:14px;color:#111827;font-weight:700;border-bottom:1px solid #e5e7eb">${statusLabel[campaign.status] ?? campaign.status}</td></tr>
      <tr><td style="padding:10px 14px;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Total de destinatários</td><td style="padding:10px 14px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb">${total.toLocaleString('pt-BR')}</td></tr>
      <tr style="background:#f9fafb"><td style="padding:10px 14px;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Enviadas</td><td style="padding:10px 14px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb">${sent.toLocaleString('pt-BR')} (${sendRate}%)</td></tr>
      <tr><td style="padding:10px 14px;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Falhas</td><td style="padding:10px 14px;font-size:14px;color:#dc2626;font-weight:700;border-bottom:1px solid #e5e7eb">${failed.toLocaleString('pt-BR')} (${failRate}%)</td></tr>
      <tr style="background:#f9fafb"><td style="padding:10px 14px;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Ignorados (blacklist/sem fone)</td><td style="padding:10px 14px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb">${skipped.toLocaleString('pt-BR')}</td></tr>
      <tr><td style="padding:10px 14px;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Pendentes</td><td style="padding:10px 14px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb">${pending.toLocaleString('pt-BR')}</td></tr>
      <tr style="background:#f9fafb"><td style="padding:10px 14px;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Iniciada em</td><td style="padding:10px 14px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb">${fmtDate(campaign.started_at)}</td></tr>
      <tr><td style="padding:10px 14px;font-size:13px;color:#6b7280;font-weight:600">Concluída em</td><td style="padding:10px 14px;font-size:14px;color:#111827">${fmtDate(campaign.completed_at)}</td></tr>
    </table>
    <p style="margin:0;color:#6b7280;font-size:13px">O CSV completo de destinatários está em anexo (máx 2.000 registros).</p>
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
        attachments: csvRows.length > 0 ? [{
          filename: `campanha-${campaign.name.replace(/\s+/g, '-').toLowerCase()}-recipients.csv`,
          content: csvBase64,
          content_type: 'text/csv; charset=utf-8',
        }] : undefined,
      }),
    });

    if (!emailRes.ok) {
      const body = await emailRes.text();
      log.error('Resend error', { status: emailRes.status, body });
      return jsonErr(req, { ok: false, reason: 'resend_error', detail: body }, 502);
    }

    log.info('Report sent', { campaignId, to: recipientEmail, rows: csvRows.length });
    return new Response(
      JSON.stringify({ ok: true, to: recipientEmail, rows: csvRows.length }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) } }
    );

  } catch (err) {
    log.error('Unhandled error', { err });
    return jsonErr(req, { ok: false, reason: 'internal_error', message: err instanceof Error ? err.message : 'Erro desconhecido' }, 500);
  }
});
