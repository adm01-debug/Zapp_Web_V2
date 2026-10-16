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
