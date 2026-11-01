/**
 * X168 — Gerador de PDF para relatório de campanha Talk X.
 *
 * Usa jsPDF + jspdf-autotable via import dinâmico para não inflar o bundle inicial.
 * NENHUMA chamada a `window.print` — o PDF é gerado inteiramente em memória e salvo.
 *
 * Estrutura do documento:
 *   Pág 1: Cabeçalho (nome da campanha, período, data de geração) + KPIs principais
 *   Pág 2+: Funil de conversão (tabela), Segmentos, Links rastreados, Insights
 */

// Tipos mínimos para evitar depender da instalação de @types/jspdf no teste
type JsPDFInstance = {
  setFont: (name: string, style?: string) => JsPDFInstance;
  setFontSize: (size: number) => JsPDFInstance;
  setTextColor: (...args: number[]) => JsPDFInstance;
  text: (text: string, x: number, y: number, options?: Record<string, unknown>) => JsPDFInstance;
  addPage: () => JsPDFInstance;
  save: (filename: string) => void;
  getNumberOfPages: () => number;
  internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
  line: (x1: number, y1: number, x2: number, y2: number) => JsPDFInstance;
  setDrawColor: (...args: number[]) => JsPDFInstance;
  setLineWidth: (w: number) => JsPDFInstance;
};

type AutoTable = (doc: JsPDFInstance, options: Record<string, unknown>) => void;

export interface TalkXReportPdfInput {
  campaignName: string;
  period: string;
  kpis: {
    sent: number;
    delivered: number;
    deliveryRate: string;
    replied: number;
    replyRate: string;
    conversions: number;
    conversionRate: string;
  };
  funnel: Array<{ stage: string; count: number; pct: string }>;
  segments: Array<{ name: string; contacts: number }>;
  links: Array<{ url: string; clicks: number; uniqueClicks: number }>;
  insights: string[];
}

async function loadJspdf(): Promise<{ jsPDF: new (opts?: Record<string, unknown>) => JsPDFInstance; autoTable: AutoTable }> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  return { jsPDF, autoTable };
}

const MARGIN = 14;
const PAGE_W = 210; // A4 mm

function sectionTitle(doc: JsPDFInstance, text: string, y: number): number {
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(30, 30, 30);
  doc.text(text, MARGIN, y);
  doc.setDrawColor(200, 200, 200).setLineWidth(0.3).line(MARGIN, y + 2, PAGE_W - MARGIN, y + 2);
  return y + 8;
}

/** Gera e faz download do PDF do relatório de campanha. */
export async function downloadTalkXReportPdf(input: TalkXReportPdfInput, filename: string): Promise<void> {
  const { jsPDF, autoTable } = await loadJspdf();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ── Pág 1: Cabeçalho ──────────────────────────────────────────────────────
  let y = 20;

  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(20, 20, 20);
  doc.text('Relatório de Campanha', MARGIN, y);
  y += 8;

  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(80, 80, 80);
  doc.text(input.campaignName, MARGIN, y);
  y += 5;
  doc.text(`Período: ${input.period}`, MARGIN, y);
  y += 5;
  const generated = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date());
  doc.text(`Gerado em: ${generated}`, MARGIN, y);
  y += 10;

  // KPIs
  y = sectionTitle(doc, 'Indicadores principais', y);
  const kpiRows = [
    ['Enviados', String(input.kpis.sent), 'Entregues', `${input.kpis.delivered} (${input.kpis.deliveryRate})`],
    ['Respondidos', `${input.kpis.replied} (${input.kpis.replyRate})`, 'Conversões', `${input.kpis.conversions} (${input.kpis.conversionRate})`],
  ];
  autoTable(doc, {
    startY: y,
    head: [],
    body: kpiRows,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 }, 2: { fontStyle: 'bold', cellWidth: 40 } },
    margin: { left: MARGIN, right: MARGIN },
  });
  y = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y + 30;
  y += 8;

  // ── Pág 2: Funil + Segmentos ───────────────────────────────────────────────
  doc.addPage();
  y = 20;

  if (input.funnel.length > 0) {
    y = sectionTitle(doc, 'Funil de conversão', y);
    autoTable(doc, {
      startY: y,
      head: [['Etapa', 'Quantidade', '%']],
      body: input.funnel.map((f) => [f.stage, String(f.count), f.pct]),
      theme: 'striped',
      styles: { fontSize: 9 },
      headStyles: { fillColor: [51, 102, 204] },
      margin: { left: MARGIN, right: MARGIN },
    });
    y = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y + 30;
    y += 8;
  }

  if (input.segments.length > 0) {
    y = sectionTitle(doc, 'Segmentos', y);
    autoTable(doc, {
      startY: y,
      head: [['Segmento', 'Contatos']],
      body: input.segments.map((s) => [s.name, String(s.contacts)]),
      theme: 'striped',
      styles: { fontSize: 9 },
      headStyles: { fillColor: [51, 102, 204] },
      margin: { left: MARGIN, right: MARGIN },
    });
    y = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y + 30;
    y += 8;
  }

  // Links + Insights
  if (input.links.length > 0 || input.insights.length > 0) {
    if (y > 200) { doc.addPage(); y = 20; }

    if (input.links.length > 0) {
      y = sectionTitle(doc, 'Links rastreados', y);
      autoTable(doc, {
        startY: y,
        head: [['URL', 'Cliques', 'Cliques únicos']],
        body: input.links.map((l) => [l.url, String(l.clicks), String(l.uniqueClicks)]),
        theme: 'striped',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [51, 102, 204] },
        margin: { left: MARGIN, right: MARGIN },
      });
      y = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y + 30;
      y += 8;
    }

    if (input.insights.length > 0) {
      y = sectionTitle(doc, 'Insights', y);
      doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(60, 60, 60);
      for (const insight of input.insights) {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.text(`• ${insight}`, MARGIN + 2, y);
        y += 6;
      }
    }
  }

  doc.save(filename);
}
