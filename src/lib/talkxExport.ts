// talkxExport.ts — E29: exportar campanhas como CSV (BOM UTF-8, sem lib)
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';

function esc(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
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
