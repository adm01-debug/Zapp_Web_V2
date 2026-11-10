/**
 * X164 / TL-080 — exportação PDF do relatório de campanha.
 *
 * Usa jsPDF v4 + jspdf-autotable v5 via `import()` dinâmico para não inflar o
 * bundle principal (~1 MB somados). O PDF inclui metadados da campanha e a tabela
 * de KPIs consolidados do RPC `talkx_campaign_report`.
 */

import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';
import type { TalkXCsvKpis } from './talkxCsv';

function fmtDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return `${m}m ${s > 0 ? ` ${s}s` : ''}`.trim();
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/**
 * Gera o Blob PDF do relatório de campanha pronto para `downloadFileWithPermission`.
 * Lança exceção em caso de falha no import dinâmico — o chamador deve tratar.
 */
export async function buildTalkXCampaignPdfBlob(
  campaign: TalkXCampaign,
  kpis: TalkXCsvKpis | null,
): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // --- Cabeçalho ---
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Relatório da Campanha', 14, 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(campaign.name, 14, 28);

  let y = 34;
  if (campaign.objective) {
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Objetivo: ${campaign.objective}`, 14, y);
    doc.setTextColor(0);
    y += 6;
  }

  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Fuso: ${campaign.schedule_timezone ?? 'America/Sao_Paulo'}`, 14, y);
  doc.setTextColor(0);
  y += 8;

  // --- Tabela de KPIs ---
  if (kpis) {
    autoTable(doc, {
      startY: y,
      head: [['Métrica', 'Valor']],
      body: [
        ['Destinatários', String(kpis.total_recipients)],
        ['Enviados', String(kpis.sent_count)],
        ['Entregues', String(kpis.delivered_count)],
        ['Taxa de entrega', `${kpis.delivery_rate_pct}%`],
        ['Lidas', String(kpis.read_count)],
        ['Respostas', String(campaign.replied_count ?? 0)],
        ['Falhas', String(kpis.failed_count)],
        ['A confirmar', String(kpis.outcome_unknown_count)],
        ['Duração', fmtDuration(kpis.duration_secs)],
      ],
      theme: 'striped',
      headStyles: { fillColor: [124, 58, 237] },
      styles: { fontSize: 10 },
      columnStyles: { 1: { halign: 'right' } },
    });
  }

  return doc.output('blob');
}
