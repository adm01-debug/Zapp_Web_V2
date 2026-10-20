// talkxExport.ts — E29: exportar campanhas como CSV (BOM UTF-8, sem lib)
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';

/** Escapa para CSV e neutraliza formula-injection (P1 fix + CR/tab/full-width). */
function esc(v: string): string {
  // Prefixos que planilhas interpretam como formulas (incluindo full-width)
  const FORMULA_PREFIX = /^[=+\-@\t\r\n＝＋－＠]/u;
  let safe = v;
  if (FORMULA_PREFIX.test(safe)) safe = "'" + safe; // apostrofe forca texto no Excel
  if (safe.includes(',') || safe.includes('"') || safe.includes('\r') || safe.includes('\n')) {
    return '"' + safe.replace(/"/g, '""') + '"';
  }
  return safe;
}

const HEADERS = [
  'Nome', 'Descrição', 'Objetivo', 'Status',
  'Total de contatos', 'Enviados', 'Falhas', 'Entregues',
  'Canal', 'Segmento / Público', 'Perfil de velocidade',
  'Agendada em', 'Iniciada em', 'Concluída em', 'Criada em',
];

export function exportCampaignsCsv(
  campaigns: TalkXCampaign[],
  filename?: string,
): void {
  if (campaigns.length === 0) return;

  const rows = campaigns.slice(0, 10_000).map((c) => [
    c.name,
    c.description ?? '',
    c.objective ?? 'engajamento',
    c.status,
    String(c.total_recipients),
    String(c.sent_count),
    String(c.failed_count),
    String(c.delivered_count ?? 0),
    'WhatsApp',
    c.segment_id ? c.segment_id : (c.audience_source === 'crm360' ? 'CRM 360°' : 'Seleção manual'),
    c.speed_profile ?? 'moderate',
    c.scheduled_at ?? '',
    c.started_at ?? '',
    c.completed_at ?? '',
    c.created_at,
  ]);

  const csvLines = [
    HEADERS.map(esc).join(','),
    ...rows.map((r) => r.map(esc).join(',')),
  ];

  // BOM UTF-8 para compatibilidade com Excel
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `talkx-campanhas-${new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * E72: exporta destinatarios de uma campanha como CSV (BOM UTF-8).
 */
export type RecipientRow = {
  name: string | null;
  phone: string | null;
  status: string;
  sent_at: string | null;
  delivered_at: string | null;
  error_message: string | null;
  personalized_message: string | null;
};

export function exportRecipientsCsv(rows: RecipientRow[], campaignName: string): void {
  if (rows.length === 0) return;
  const COLS: Array<{ label: string; key: keyof RecipientRow }> = [
    { label: 'Nome', key: 'name' },
    { label: 'Telefone', key: 'phone' },
    { label: 'Status', key: 'status' },
    { label: 'Enviada em', key: 'sent_at' },
    { label: 'Entregue em', key: 'delivered_at' },
    { label: 'Erro', key: 'error_message' },
    { label: 'Mensagem personalizada', key: 'personalized_message' },
  ];
  const lines = [
    COLS.map((c) => esc(c.label)).join(','),
    ...rows.map((r) => COLS.map((c) => esc(String(r[c.key] ?? ''))).join(',')),
  ].join('\n');
  const bom = '\uFEFF';
  const blob = new Blob([bom + lines], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `talkx-${campaignName.replace(/[^\w\s-]/g, '').slice(0, 40)}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}