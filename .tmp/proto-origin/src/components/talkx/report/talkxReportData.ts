/**
 * X164 / TL-080 — leitura crua dos destinatários para os três cartões do
 * relatório (tela 14) e as contas puras de agrupamento.
 *
 * Irmão do `talkxReportCharts.ts`: nada de componente aqui. A tela
 * (`TalkXCampaignReport`) lê as linhas REAIS de `talkx_recipients`
 * (sent_at / delivered_at / replied_at) e entrega as séries e a grade 7x24
 * prontas aos cartões apresentacionais.
 *
 * Fuso: o RPC `talkx_campaign_report` só devolve envios e entregues por hora, sem
 * respostas, então o agrupamento por dia/hora e o mapa de calor são feitos AQUI,
 * sempre no fuso da CAMPANHA (`talkx_campaigns.schedule_timezone`) — nunca no fuso
 * de quem abre a tela.
 */

import type { TalkXReportGranularity, TalkXReportSeriesPoint } from './talkxReportCharts';

/** Linha mínima lida de `talkx_recipients` para montar série e mapa de calor. */
export interface TalkXReportRecipientRow {
  sent_at: string | null;
  delivered_at: string | null;
  replied_at: string | null;
}

/** Teto defensivo da amostra lida (as MAIS ANTIGAS, para a série começar no início). */
export const REPORT_SAMPLE_LIMIT = 20_000;

/** Segunda=0 … Domingo=6 (a semana do mock — o `getDay()` começa no domingo). */
const WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

interface ZoneParts {
  /** Data local da campanha no formato AAAA-MM-DD. */
  dayKey: string;
  /** 0=Segunda … 6=Domingo. */
  weekday: number;
  /** Hora local da campanha (0–23). */
  hour: number;
}

function zoneParts(value: string, timeZone: string): ZoneParts | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const weekday = WEEKDAY_INDEX[get('weekday')];
  if (weekday === undefined) return null;
  const rawHour = Number(get('hour'));
  // Alguns motores devolvem 24 para a meia-noite mesmo com hour12:false.
  const hour = Number.isFinite(rawHour) ? rawHour % 24 : 0;
  return { dayKey: `${get('year')}-${get('month')}-${get('day')}`, weekday, hour };
}

/**
 * Série de desempenho a partir das linhas reais. O balde é ancorado no `sent_at`
 * (como o Analytics): entregues e respostas contam no balde do envio.
 * `conversions` fica 0 porque não há fonte de conversão — a linha só é desenhada
 * quando `hasConversionSource` for verdadeiro.
 */
export function talkxReportSeriesFromRows(
  rows: TalkXReportRecipientRow[],
  granularity: TalkXReportGranularity,
  timeZone: string,
): TalkXReportSeriesPoint[] {
  const buckets = new Map<string, { bucket: string; sortKey: number; sent: number; delivered: number; replied: number }>();
  for (const row of rows) {
    if (!row.sent_at) continue;
    const parts = zoneParts(row.sent_at, timeZone);
    if (!parts) continue;
    const key = granularity === 'hour' ? `${parts.dayKey}T${String(parts.hour).padStart(2, '0')}` : parts.dayKey;
    const sortKey = new Date(row.sent_at).getTime();
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { bucket: row.sent_at, sortKey, sent: 0, delivered: 0, replied: 0 };
      buckets.set(key, bucket);
    }
    // O instante mais antigo do balde rotula o eixo (o rótulo é formatado no fuso).
    if (sortKey < bucket.sortKey) {
      bucket.bucket = row.sent_at;
      bucket.sortKey = sortKey;
    }
    bucket.sent += 1;
    if (row.delivered_at) bucket.delivered += 1;
    if (row.replied_at) bucket.replied += 1;
  }
  return Array.from(buckets.values())
    .sort((a, b) => a.sortKey - b.sortKey)
    .map(({ bucket, sent, delivered, replied }) => ({ bucket, sent, delivered, replied, conversions: 0 }));
}

/**
 * Grade 7x24 (linha 0 = segunda) contando os instantes por dia da semana e hora
 * no fuso da campanha. Usada tanto para envios/respostas quanto para cliques.
 */
export function talkxReportHeatmapFromTimestamps(
  timestamps: (string | null | undefined)[],
  timeZone: string,
): number[][] {
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const value of timestamps) {
    if (!value) continue;
    const parts = zoneParts(value, timeZone);
    if (!parts) continue;
    grid[parts.weekday][parts.hour] += 1;
  }
  return grid;
}
