/**
 * talkx-report — E81: Gera e envia relatório de campanha Talk X por e-mail
 * Busca KPIs + recipients, gera CSV, envia via Resend para o criador da campanha.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, handleCors, Logger } from "../_shared/validation.ts";

const headers = { "Content-Type": "application/json" };

// ─── CSV helpers ─────────────────────────────────────────────────────────────
function esc(v: string): string {
  const FORMULA_PREFIX = /^[=+\-@\t\r\n]/;
  let safe = v;
  if (FORMULA_PREFIX.test(safe)) safe = "'" + safe;
  if (safe.includes(',') || safe.includes('"') || safe.includes('\r') || safe.includes('\n')) {
    return '"' + safe.replace(/"/g, '""') + '"';
  }
  return safe;
}

function buildCsv(rows: Record<string, string | null>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(esc).join(','),
    ...rows.map((r) => headers.map((h) => esc(r[h] ?? '')).join(','))
  ];
  return '\uFEFF' + lines.join('\r\n'); // BOM UTF-8
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors(req);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  const log = new Logger('talkx-report');

  try {
    const { campaignId } = await req.json() as { campaignId: string };
    if (!campaignId) return new Response(JSON.stringify({ ok: false, reason: 'missing_campaignId' }), { status: 400, headers });

    // ── 1. Campanha + criador ──────────────────────────────────────────────────
    const { data: campaign, error: campErr } = await supabase
      .from('talkx_campaigns')
      .select('id, name, status, total_recipients, sent_count, delivered_count, failed_count, started_at, completed_at, created_by')
      .eq('id', campaignId)
      .single();

    if (campErr || !campaign) {
      return new Response(JSON.stringify({ ok: false, reason: 'campaign_not_found' }), { status: 404, headers });
    }

    // ── 2. Email do criador via profiles ───────────────────────────────────────
    let recipientEmail: string | null = null;
    let recipientName = 'Usuário';
    if (campaign.created_by) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, name')
        .eq('id', campaign.created_by)
        .single();
      recipientEmail = profile?.email ?? null;
      recipientName = profile?.name ?? recipientName;
    }
    // Fallback: auth.users
    if (!recipientEmail && campaign.created_by) {
      const { data: authUser } = await supabase.auth.admin.getUserById(campaign.created_by);
      recipientEmail = authUser?.user?.email ?? null;
    }
    if (!recipientEmail) {
      return new Response(JSON.stringify({ ok: false, reason: 'no_recipient_email' }), { status: 422, headers });
    }

    // ── 3. Recipients (máx 2000) ───────────────────────────────────────────────
    const { data: recipients } = await supabase
      .from('talkx_recipients')
      .select('status, sent_at, delivered_at, error_message, contacts:contact_id(name, phone)')
      .eq('campaign_id', campaignId)
      .order('updated_at', { ascending: false })
      .limit(2000);

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

    // ── 4. KPIs calculados ─────────────────────────────────────────────────────
    const total = campaign.total_recipients ?? 0;
    const sent = campaign.sent_count ?? 0;
    const delivered = campaign.delivered_count ?? 0;
    const failed = campaign.failed_count ?? 0;
    const pending = Math.max(0, total - sent - failed);
    const deliveryRate = sent > 0 ? ((delivered / sent) * 100).toFixed(1) : '—';
    const failRate = (sent + failed) > 0 ? ((failed / (sent + failed)) * 100).toFixed(1) : '—';

    const fmtDate = (d: string | null) =>
      d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

    // ── 5. Corpo do e-mail ─────────────────────────────────────────────────────
    const statusLabel: Record<string, string> = { completed: 'Concluída', sending: 'Enviando', paused: 'Pausada', cancelled: 'Cancelada', draft: 'Rascunho' };
    const htmlBody = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
  <div style="background:#6366f1;padding:28px 32px">
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700">📊 Relatório de Campanha</h1>
    <p style="margin:6px 0 0;color:#e0e7ff;font-size:14px">${campaign.name}</p>
  </div>
  <div style="padding:28px 32px">
    <p style="margin:0 0 20px;color:#374151;font-size:15px">Olá, <strong>${recipientName}</strong>! Aqui está o resumo da campanha <strong>${campaign.name}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr style="background:#f9fafb"><td style="padding:10px 14px;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Status</td><td style="padding:10px 14px;font-size:14px;color:#111827;font-weight:700;border-bottom:1px solid #e5e7eb">${statusLabel[campaign.status] ?? campaign.status}</td></tr>
      <tr><td style="padding:10px 14px;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Total de destinatários</td><td style="padding:10px 14px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb">${total.toLocaleString('pt-BR')}</td></tr>
      <tr style="background:#f9fafb"><td style="padding:10px 14px;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Enviadas</td><td style="padding:10px 14px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb">${sent.toLocaleString('pt-BR')}</td></tr>
      <tr><td style="padding:10px 14px;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Entregues</td><td style="padding:10px 14px;font-size:14px;color:#16a34a;font-weight:700;border-bottom:1px solid #e5e7eb">${delivered.toLocaleString('pt-BR')} (${deliveryRate}%)</td></tr>
      <tr style="background:#f9fafb"><td style="padding:10px 14px;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Falhas</td><td style="padding:10px 14px;font-size:14px;color:#dc2626;font-weight:700;border-bottom:1px solid #e5e7eb">${failed.toLocaleString('pt-BR')} (${failRate}%)</td></tr>
      <tr><td style="padding:10px 14px;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Pendentes</td><td style="padding:10px 14px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb">${pending.toLocaleString('pt-BR')}</td></tr>
      <tr style="background:#f9fafb"><td style="padding:10px 14px;font-size:13px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb">Iniciada em</td><td style="padding:10px 14px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb">${fmtDate(campaign.started_at)}</td></tr>
      <tr><td style="padding:10px 14px;font-size:13px;color:#6b7280;font-weight:600">Concluída em</td><td style="padding:10px 14px;font-size:14px;color:#111827">${fmtDate(campaign.completed_at)}</td></tr>
    </table>
    <p style="margin:0;color:#6b7280;font-size:13px">O CSV completo de destinatários está em anexo. Máximo de 2.000 registros nesta versão.</p>
  </div>
  <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb">
    <p style="margin:0;color:#9ca3af;font-size:12px">Este e-mail foi gerado automaticamente pelo módulo Talk X · Pronto Talk Suite</p>
  </div>
</div>
</body></html>`;

    // ── 6. Envio via Resend ────────────────────────────────────────────────────
    if (!RESEND_API_KEY) {
      log.warn('RESEND_API_KEY não configurado — e-mail não enviado');
      return new Response(JSON.stringify({ ok: false, reason: 'resend_not_configured' }), { headers });
    }

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Talk X <relatorios@promobrindes.com.br>',
        to: [recipientEmail],
        subject: `📊 Relatório: ${campaign.name}`,
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
      return new Response(JSON.stringify({ ok: false, reason: 'resend_error', detail: body }), { status: 502, headers });
    }

    log.info('Report sent', { campaignId, to: recipientEmail, rows: csvRows.length });
    return new Response(JSON.stringify({ ok: true, to: recipientEmail, rows: csvRows.length }), { headers: { ...headers, ...getCorsHeaders(req) } });

  } catch (err) {
    log.error('Unhandled error', { err });
    return new Response(JSON.stringify({ ok: false, reason: 'internal_error', message: err instanceof Error ? err.message : 'Erro desconhecido' }), { status: 500, headers });
  }
});
