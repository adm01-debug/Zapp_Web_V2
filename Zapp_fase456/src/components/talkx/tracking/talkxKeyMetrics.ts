/**
 * Contas do card "Principais Métricas" da tela 13 (X160 · T13-058…T13-066).
 *
 * Módulo `.ts` (não exporta componente): taxa, duração e comparativo contra a média histórica
 * ficam aqui, testáveis sem React. O comparativo só existe com base mínima da CAP-083 — sem
 * base, a linha mostra o valor e nada mais.
 */
import { pct } from '../talkxShared';

export interface TalkXKeyMetricsData {
  sent: number;
  delivered: number;
  replied: number;
  failed: number;
  /** Processados = enviadas + falhas + a confirmar — denominador da taxa de falha. */
  processed: number;
  /** Tempo médio de resposta em segundos (`replied_at − sent_at`); null sem respostas. */
  avgReplySeconds: number | null;
}

/** Médias históricas (CAP-083). `hasBaseline` falso = sem base mínima → sem comparativo. */
export interface TalkXKeyMetricsBenchmarks {
  hasBaseline: boolean;
  avgDeliveryRatePct: number | null;
  avgReplyRatePct: number | null;
  /** Ainda sem média no RPC (T13-064). */
  avgFailureRatePct?: number | null;
  /** Ainda sem média no RPC (T13-066). */
  avgReplySeconds?: number | null;
}

export interface TalkXMetricDelta {
  text: string;
  arrow: '↑' | '↓';
  tone: 'good' | 'bad';
}

/** "2m 41s" / "45s" / "1h 1m" — sem respostas não há tempo ("—"), nunca um número inventado. */
export function formatReplySeconds(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—';
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m ${s}s`;
}

/** Taxa arredondada (% inteiro) ou null quando não há denominador. */
export function rateValue(num: number, den: number): number | null {
  return den > 0 ? pct(num, den) : null;
}

/** Taxa em % inteiro; sem denominador não há taxa ("—"). */
export function ratePct(num: number, den: number): string {
  const v = rateValue(num, den);
  return v === null ? '—' : `${v}%`;
}

/** O que o card precisa saber da linha da campanha (contadores exatos, sem amostra). */
export interface TalkXCampaignCounterRow {
  sent_count?: number | null;
  delivered_count?: number | null;
  replied_count?: number | null;
  failed_count?: number | null;
  outcome_unknown_count?: number | null;
}

function toCount(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function toSeconds(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Monta as métricas a partir da LINHA da campanha (T13-058…T13-063): os totais vêm dos
 * contadores exatos (`sent_count`, `delivered_count`, `replied_count`, `failed_count`),
 * nunca de amostra limitada. `avgReplySeconds` vem do painel
 * (`talkx_campaign_report` → `kpis.avg_reply_secs`); sem respostas é null ("—").
 */
export function keyMetricsFromCampaign(
  row: TalkXCampaignCounterRow,
  avgReplySeconds: unknown,
): TalkXKeyMetricsData {
  const sent = toCount(row?.sent_count);
  const delivered = toCount(row?.delivered_count);
  const replied = toCount(row?.replied_count);
  const failed = toCount(row?.failed_count);
  const unknown = toCount(row?.outcome_unknown_count);
  return {
    sent,
    delivered,
    replied,
    failed,
    processed: sent + failed + unknown,
    avgReplySeconds: toSeconds(avgReplySeconds),
  };
}

/** Sem base: o card mostra os valores sem comparativo (nunca quebra a tela). */
export const KEY_METRICS_NO_BASELINE: TalkXKeyMetricsBenchmarks = {
  hasBaseline: false,
  avgDeliveryRatePct: null,
  avgReplyRatePct: null,
};

/**
 * Mapeia o retorno de `talkx_benchmarks()` para o comparativo do card (CAP-083).
 * Base mínima: ao menos 1 campanha concluída na janela de 90 dias
 * (`global.campaign_count >= 1`); abaixo disso, sem comparativo. Payload fora do
 * formato (RPC indisponível) vira "sem base", nunca exceção.
 */
export function benchmarksFromJson(payload: unknown): TalkXKeyMetricsBenchmarks {
  if (typeof payload !== 'object' || payload === null) return { ...KEY_METRICS_NO_BASELINE };
  const global = (payload as { global?: unknown }).global;
  if (typeof global !== 'object' || global === null || Array.isArray(global)) {
    return { ...KEY_METRICS_NO_BASELINE };
  }
  const g = global as Record<string, unknown>;
  const count = typeof g.campaign_count === 'number' ? g.campaign_count : 0;
  return {
    hasBaseline: count >= 1,
    avgDeliveryRatePct: toSeconds(g.avg_delivery_rate_pct),
    avgReplyRatePct: toSeconds(g.avg_reply_rate_pct),
  };
}

/**
 * Variação relativa contra a média histórica. Sem base mínima, sem média válida ou sem valor
 * da campanha, não existe comparativo (null) — a linha fica só com o valor.
 */
export function benchmarkDelta(
  value: number | null | undefined,
  average: number | null | undefined,
  opts: { hasBaseline: boolean; goodWhen?: 'up' | 'down' },
): TalkXMetricDelta | null {
  if (!opts.hasBaseline) return null;
  if (value == null || average == null) return null;
  if (!Number.isFinite(value) || !Number.isFinite(average) || average <= 0) return null;
  const diff = ((value - average) / average) * 100;
  const up = diff >= 0;
  const good = opts.goodWhen === 'down' ? !up : up;
  return { text: `${Math.round(Math.abs(diff))}% vs. média`, arrow: up ? '↑' : '↓', tone: good ? 'good' : 'bad' };
}
