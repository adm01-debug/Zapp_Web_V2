/**
 * X164 / TL-080 — exportação CSV do relatório de campanha.
 *
 * UTF-8 BOM + separador `;` (padrão do Excel BR) + guard contra injeção CSV
 * (células que começam com `=`, `+`, `-`, `@`, TAB ou CR recebem prefixo `'`).
 *
 * Seções do arquivo:
 *  1. Metadados da campanha (nome, objetivo, fuso)
 *  2. KPIs consolidados do RPC `talkx_campaign_report`
 *  3. Linhas individuais dos destinatários (amostra da tela, até REPORT_SAMPLE_LIMIT)
 */

import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';
import type { TalkXReportRecipientRow } from '@/components/talkx/report/talkxReportData';

/** KPIs do RPC `talkx_campaign_report`; espelhado aqui para evitar import circular. */
export interface TalkXCsvKpis {
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  outcome_unknown_count: number;
  delivery_rate_pct: number;
  duration_secs: number;
}

const BOM = '﻿';
const SEP = ';';

function esc(value: unknown): string {
  let str = String(value ?? '');
  // CSV-injection guard: prefixar com ' células que iniciam com chars perigosos
  // (e seguir para a regra de aspas: o prefixo não protege `;` nem quebra de linha)
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
  // Encapsular em aspas quando o valor contém sep, nova linha ou aspas duplas
  if (str.includes('"') || str.includes(SEP) || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function row(...cells: unknown[]): string {
  return cells.map(esc).join(SEP);
}

/**
 * Constrói o Blob CSV pronto para `downloadFileWithPermission`.
 *
 * @param campaign  Campanha exibida no relatório.
 * @param kpis      Resultado do RPC `talkx_campaign_report`; `null` omite a seção.
 * @param recipients Linhas de `talkx_recipients` já carregadas na tela (amostra).
 */
export function buildTalkXCampaignCsvBlob(
  campaign: TalkXCampaign,
  kpis: TalkXCsvKpis | null,
  recipients: TalkXReportRecipientRow[],
): Blob {
  const lines: string[] = [];

  // ---- Metadados ----
  lines.push(row('Relatório da Campanha'));
  lines.push(row('Nome', campaign.name));
  if (campaign.objective) lines.push(row('Objetivo', campaign.objective));
  lines.push(row('Fuso', campaign.schedule_timezone ?? 'America/Sao_Paulo'));
  lines.push('');

  // ---- KPIs ----
  if (kpis) {
    lines.push(row('Métrica', 'Valor'));
    lines.push(row('Destinatários', kpis.total_recipients));
    lines.push(row('Enviados', kpis.sent_count));
    lines.push(row('Entregues', kpis.delivered_count));
    lines.push(row('Taxa de entrega (%)', kpis.delivery_rate_pct));
    lines.push(row('Lidas', kpis.read_count));
    lines.push(row('Respostas', campaign.replied_count ?? 0));
    lines.push(row('Falhas', kpis.failed_count));
    lines.push(row('A confirmar', kpis.outcome_unknown_count));
    lines.push(row('Duração (seg)', kpis.duration_secs));
    lines.push('');
  }

  // ---- Destinatários (amostra) ----
  if (recipients.length > 0) {
    lines.push(row('Enviado em', 'Entregue em', 'Respondeu em'));
    for (const r of recipients) {
      lines.push(row(r.sent_at ?? '', r.delivered_at ?? '', r.replied_at ?? ''));
    }
  }

  const csv = BOM + lines.join('\r\n');
  return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
}
