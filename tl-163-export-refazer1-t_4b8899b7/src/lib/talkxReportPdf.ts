/**
 * X168 — PDF do relatório do Talk X. jsPDF + autotable por import dinâmico;
 * devolve um Blob (a gravação em disco é da porta única `downloadFileWithPermission`).
 * Nenhuma chamada a `window.print`.
 */
export interface TalkXReportPdfSection {
  title: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}

export interface TalkXReportPdfInput {
  title: string;
  subtitle?: string;
  kpis: Array<{ label: string; value: string }>;
  sections: TalkXReportPdfSection[];
}

export async function buildTalkXReportPdf(input: TalkXReportPdfInput, signal?: AbortSignal): Promise<Blob> {
  const abortIfNeeded = () => {
    if (signal?.aborted) throw new DOMException('Exportação cancelada', 'AbortError');
  };
  abortIfNeeded();
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  abortIfNeeded();

  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text(input.title, 14, 20);
  if (input.subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(input.subtitle, 14, 27);
    doc.setTextColor(0);
  }

  const tables: TalkXReportPdfSection[] = [
    { title: 'Indicadores', headers: ['Indicador', 'Valor'], rows: input.kpis.map((k) => [k.label, k.value]) },
    ...input.sections,
  ];
  let startY = 34;
  for (const table of tables) {
    abortIfNeeded();
    doc.setFontSize(12);
    doc.text(table.title, 14, startY);
    autoTable(doc, { head: [table.headers], body: table.rows, startY: startY + 3, styles: { fontSize: 8 } });
    startY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY) + 10;
    if (startY > 270) {
      doc.addPage();
      startY = 20;
    }
  }
  return doc.output('blob') as Blob;
}
