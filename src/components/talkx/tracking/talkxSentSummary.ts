/**
 * Série e marcador do card "Resumo de Enviados" da tela 13 (X160 · T13-050…T13-057).
 *
 * Módulo `.ts` (não exporta componente): as contas e a decisão de desenhar o marcador
 * ficam aqui, testáveis sem React — mesmo padrão de `talkxRunningHistory.ts`.
 */

/** Um ponto do painel: um balde de HORA com os três canais. */
export interface TalkXSentSummaryPoint {
  /** ISO do início do balde (de hora em hora). */
  bucket: string;
  sent: number;
  delivered: number;
  replied: number;
}

/** Janelas do select — `minutes` vai ao painel como `p_window_minutes`. */
export const SUMMARY_WINDOWS = [
  { id: '24h', label: 'Últimas 24 horas', minutes: 1440 },
  { id: '12h', label: 'Últimas 12 horas', minutes: 720 },
  { id: '6h', label: 'Últimas 6 horas', minutes: 360 },
] as const;

export type TalkXSummaryWindow = (typeof SUMMARY_WINDOWS)[number]['id'];

/** Balde pedido ao painel (T13-051). */
export const SUMMARY_BUCKET = 'hour';

const HOUR_MS = 3_600_000;

/**
 * Um balde de hora do painel (`talkx_campaign_report(p_campaign)` → `hourly_series`).
 * O painel agrega no servidor (sem teto de amostra); a janela (6/12/24 h) é aplicada
 * aqui porque a RPC não recebe `p_window_minutes` (a trilha de banco é separada).
 */
export interface TalkXReportHourBucket {
  hour: string;
  sent?: number | null;
  delivered?: number | null;
}

function toCount(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function hourStart(iso: string): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return NaN;
  return Math.floor(t / HOUR_MS) * HOUR_MS;
}

/**
 * Monta os pontos do "Resumo de enviados" (T13-050…T13-057): série horária do painel
 * (enviados + entregues) com as respostas por hora unidas pelo balde, já filtrada pela
 * janela escolhida. Horas só com resposta (resposta após a pausa) entram com zero nos
 * outros canais; balde inválido do painel é descartado, nunca inventado.
 */
export function buildSentSummaryPoints(
  hourly: TalkXReportHourBucket[] | null | undefined,
  replyTimestamps: Array<string | null | undefined> | null | undefined,
  windowMinutes: number,
  nowMs: number = Date.now(),
): TalkXSentSummaryPoint[] {
  const windowStart = nowMs - windowMinutes * 60_000;
  const inWindow = (start: number) => start + HOUR_MS > windowStart && start <= nowMs;
  const byBucket: Record<string, TalkXSentSummaryPoint> = {};
  const slot = (start: number): TalkXSentSummaryPoint => {
    const key = new Date(start).toISOString();
    return (byBucket[key] ??= { bucket: key, sent: 0, delivered: 0, replied: 0 });
  };

  for (const b of hourly ?? []) {
    const start = hourStart(b?.hour);
    if (Number.isNaN(start) || !inWindow(start)) continue;
    const cur = slot(start);
    cur.sent += toCount(b?.sent);
    cur.delivered += toCount(b?.delivered);
  }

  for (const ts of replyTimestamps ?? []) {
    if (typeof ts !== 'string' || ts.length === 0) continue;
    const start = hourStart(ts);
    if (Number.isNaN(start) || !inWindow(start)) continue;
    slot(start).replied += 1;
  }

  // ISO ordena lexicamente na ordem cronológica.
  return Object.keys(byBucket)
    .sort()
    .map((k) => byBucket[k]);
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Soma os três canais da série exibida — os chips valem para a janela escolhida. */
export function summaryTotals(points: TalkXSentSummaryPoint[]) {
  return points.reduce(
    (acc, p) => ({
      sent: acc.sent + (p.sent ?? 0),
      delivered: acc.delivered + (p.delivered ?? 0),
      replied: acc.replied + (p.replied ?? 0),
    }),
    { sent: 0, delivered: 0, replied: 0 },
  );
}

/**
 * Marcador da pausa no gráfico (T13-056): só existe quando `pausedAt` cai DENTRO da janela
 * coberta pela série — do primeiro balde até o fim do último balde de hora. A âncora é o balde
 * que contém a pausa; o rótulo mostra a hora real da pausa, "HH:mm Campanha pausada".
 */
export function pausedMarker(
  pausedAt: string | null | undefined,
  points: TalkXSentSummaryPoint[],
): { anchor: string; label: string } | null {
  if (!pausedAt || points.length === 0) return null;
  const pausa = new Date(pausedAt);
  if (Number.isNaN(pausa.getTime())) return null;

  const baldes = points
    .map((p) => new Date(p.bucket).getTime())
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);
  if (baldes.length === 0) return null;

  const inicio = baldes[0];
  const fim = baldes[baldes.length - 1] + HOUR_MS;
  if (pausa.getTime() < inicio || pausa.getTime() >= fim) return null;

  const ancora = [...baldes].reverse().find((t) => t <= pausa.getTime()) ?? inicio;
  return { anchor: hhmm(new Date(ancora)), label: `${hhmm(pausa)} Campanha pausada` };
}
