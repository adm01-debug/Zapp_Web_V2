/**
 * X164 / TL-080 — dados e contas dos três cartões do relatório (tela 14):
 * Desempenho da campanha (4 séries), Funil de conversão e Mapa de calor.
 *
 * Módulo `.ts` (sem componente) de propósito: as constantes e funções puras que os
 * cartões usam ficam separadas do `.tsx` (regra `react-refresh/only-export-components`
 * do repositório) — igual ao `kit/format.ts` e ao `kit/periods.ts`.
 *
 * Fuso: os rótulos de data são sempre formatados no fuso da CAMPANHA
 * (`talkx_campaigns.schedule_timezone`), nunca no fuso de quem abre a tela: a série do
 * RPC já vem agrupada no dia/hora local da campanha.
 */

// ── Desempenho (4 séries) ──────────────────────────────────────────────────────

export type TalkXReportGranularity = 'day' | 'hour';

export interface TalkXReportSeriesPoint {
  /** Início do balde (instante ISO, em UTC). */
  bucket: string;
  sent: number;
  delivered: number;
  replied: number;
  conversions: number;
}

/** Cores das 4 séries — só tokens do sistema. */
export const TALKX_REPORT_SERIES_COLORS = {
  sent: 'hsl(var(--primary))',
  delivered: 'hsl(var(--success))',
  replied: 'hsl(var(--violeta))',
  conversions: 'hsl(var(--warning))',
} as const;

export const TALKX_REPORT_GRANULARITY_LABELS: Record<TalkXReportGranularity, string> = { day: 'Diário', hour: 'Por hora' };

/** Rótulo curto do eixo: dia → "15/09"; hora → "14h". */
export function talkxReportAxisLabel(bucket: string, granularity: TalkXReportGranularity, timeZone: string): string {
  const d = new Date(bucket);
  if (Number.isNaN(d.getTime())) return '—';
  const hour = () => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', hour12: false, timeZone }).format(d);
  if (granularity === 'hour') return `${hour()}h`;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone }).format(d);
}

/** Data por extenso (tooltip e tabela): "15 de set de 2026" ou "14 de set de 2026, 23h". */
export function talkxReportBucketTitle(bucket: string, granularity: TalkXReportGranularity, timeZone: string): string {
  const d = new Date(bucket);
  if (Number.isNaN(d.getTime())) return '—';
  const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('pt-BR', { ...opts, timeZone }).format(d);
  const day = `${fmt({ day: 'numeric' })} de ${fmt({ month: 'short' }).replace('.', '')} de ${fmt({ year: 'numeric' })}`;
  if (granularity === 'hour') return `${day}, ${fmt({ hour: '2-digit', hour12: false })}h`;
  return day;
}

/** As séries que são desenhadas — a de conversão só existe quando há fonte de conversão. */
export function talkxReportSeriesLines(hasConversionSource: boolean) {
  const lines = [
    { key: 'sent' as const, label: 'Enviados', color: TALKX_REPORT_SERIES_COLORS.sent },
    { key: 'delivered' as const, label: 'Entregues', color: TALKX_REPORT_SERIES_COLORS.delivered },
    { key: 'replied' as const, label: 'Respostas', color: TALKX_REPORT_SERIES_COLORS.replied },
  ];
  return hasConversionSource
    ? [...lines, { key: 'conversions' as const, label: 'Conversões', color: TALKX_REPORT_SERIES_COLORS.conversions }]
    : lines;
}

// ── Funil de conversão ─────────────────────────────────────────────────────────

export type TalkXReportFunnelStepKey = 'sent' | 'delivered' | 'replied' | 'clicked' | 'converted';

export interface TalkXReportFunnelStep {
  key: TalkXReportFunnelStepKey;
  /** Total do degrau; `null` = sem fonte para este degrau (não desenhar). */
  count: number | null;
}

export interface TalkXReportFunnelSegment {
  id: string;
  name: string;
}

/** Rótulos do mock da tela 14 (T14-044..T14-048). */
export const FUNNEL_STEP_LABELS: Record<TalkXReportFunnelStepKey, string> = {
  sent: 'Enviados',
  delivered: 'Entregues',
  replied: 'Responderam',
  clicked: 'Clicaram',
  converted: 'Converteram',
};

/** Degraus do mock (azul, verde, violeta, azul-claro, laranja) — só tokens do sistema. */
export const FUNNEL_STEP_COLORS: Record<TalkXReportFunnelStepKey, string> = {
  sent: 'hsl(var(--primary))',
  delivered: 'hsl(var(--success))',
  replied: 'hsl(var(--violeta))',
  clicked: 'hsl(var(--info))',
  converted: 'hsl(var(--warning))',
};

export interface TalkXReportFunnelRow {
  key: TalkXReportFunnelStepKey;
  label: string;
  count: number;
  /** % sobre os enviados. */
  pct: number;
}

/**
 * "100%" / "96,4%" — uma casa decimal só quando o valor JÁ ARREDONDADO para 1 casa
 * não é inteiro, como o mock (99,96 → "100%", nunca "100,0%").
 */
export function talkxReportPctText(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  return `${Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',')}%`;
}

/**
 * Degraus que são desenhados, com o % sobre os enviados (o primeiro degrau com fonte).
 * Degrau sem fonte (count nulo) fica fora da lista e da conta.
 */
export function talkxReportFunnelRows(steps: TalkXReportFunnelStep[]): TalkXReportFunnelRow[] {
  const drawn = steps.filter((s): s is TalkXReportFunnelStep & { count: number } => typeof s.count === 'number');
  const base = drawn[0]?.count ?? 0;
  return drawn.map((s) => ({
    key: s.key,
    label: FUNNEL_STEP_LABELS[s.key],
    count: s.count,
    pct: base > 0 ? (s.count / base) * 100 : 0,
  }));
}

/**
 * Arestas do trapézio de um degrau, no viewBox de 100 unidades de largura.
 * `topPct`/`bottomPct` são os % sobre os enviados do degrau e do seguinte.
 */
export function talkxReportTrapezoidPoints(topPct: number, bottomPct: number, row: number, rowHeight = 100): string {
  const y0 = row * rowHeight;
  const y1 = y0 + rowHeight;
  const round = (n: number) => Math.round(n * 100) / 100;
  const halfTop = Math.max(topPct, 0) / 2;
  const halfBottom = Math.max(bottomPct, 0) / 2;
  return `${round(50 - halfTop)},${y0} ${round(50 + halfTop)},${y0} ${round(50 + halfBottom)},${y1} ${round(50 - halfBottom)},${y1}`;
}

// ── Mapa de calor ──────────────────────────────────────────────────────────────

export type TalkXReportHeatmapMetric = 'replied' | 'sent' | 'clicked';

export const HEATMAP_METRICS: { value: TalkXReportHeatmapMetric; label: string }[] = [
  { value: 'replied', label: 'Respostas' },
  { value: 'sent', label: 'Envios' },
  { value: 'clicked', label: 'Cliques' },
];

/** Semana da tela 14: Seg → Dom (não Dom → Sáb). */
export const HEATMAP_WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

/** Degraus da legenda "Menor volume → Maior volume" (T14-064). */
export const HEATMAP_LEGEND_STEPS = [0.12, 0.32, 0.52, 0.72, 0.92];

/** Texto do título/subtítulo por métrica — o mock mostra "Respostas". */
export function talkxReportHeatmapHeading(metric: TalkXReportHeatmapMetric): { title: string; subtitle: string; noun: string } {
  const label = HEATMAP_METRICS.find((m) => m.value === metric)?.label ?? 'Respostas';
  const noun = label === 'Envios' ? 'envios' : label.toLowerCase();
  return { title: `Mapa de Calor de ${label}`, subtitle: `Volume de ${noun} por dia da semana e horário`, noun };
}

/** Garante a grade 7×24 mesmo com linha incompleta do servidor. */
export function talkxReportHeatmapGrid(matrix: number[][]): number[][] {
  return Array.from({ length: 7 }, (_, day) =>
    Array.from({ length: 24 }, (_, hour) => {
      const value = matrix[day]?.[hour];
      return typeof value === 'number' && Number.isFinite(value) ? value : 0;
    }),
  );
}

export function talkxReportHeatmapCellColor(value: number, max: number): string {
  if (value <= 0) return 'hsl(var(--muted) / 0.3)';
  const intensity = max > 0 ? value / max : 0;
  return `hsl(var(--primary) / ${(0.12 + intensity * 0.8).toFixed(2)})`;
}
