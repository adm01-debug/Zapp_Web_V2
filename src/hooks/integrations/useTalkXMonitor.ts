import { useQuery } from '@tanstack/react-query';
import { fromTable } from '@/lib/supabaseHelpers';

/** Janela do ritmo ao vivo: 60 minutos. */
export const RATE_WINDOW_MINUTES = 60;

export interface RatePoint { label: string; Enviadas: number; Entregues: number; Previsto: number }

export interface MonitorRecipient {
  id: string;
  contact_id: string | null;
  status: string;
  sent_at: string | null;
  delivered_at: string | null;
  error_message: string | null;
  personalized_message: string | null;
  /** Segmento de origem do destinatário (talkx_recipients.segment_id, X057). */
  segment_id: string | null;
}

/** Status em que o envio já saiu (conta como "Enviadas"). */
const SENT_STATUSES = new Set(['sent', 'delivered']);

export function isSentStatus(status: string): boolean {
  return SENT_STATUSES.has(status);
}

/**
 * Status de entrega incerta: o envio saiu da fila, só falta a confirmação.
 * Não conta como "Enviadas" nem como restante.
 */
export const UNCERTAIN_STATUS = 'outcome_unknown';

export function isUncertainStatus(status: string): boolean {
  return status === UNCERTAIN_STATUS;
}

/** Uma linha da Fila por Segmento (T11-046..052). */
export interface SegmentQueueRow {
  segmentId: string | null;
  name: string;
  total: number;
  sent: number;
  remaining: number;
  progress: number;
}

interface RateInput { sent_at: string | null; delivered_at: string | null }

/** "YYYY-MM-DDTHH:mm:ss" ou epoch ms → ms; inválido/nulo → null. */
function toMs(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const t = typeof value === 'number' ? value : new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

function inWindow(sentAt: string | null, now: number): number | null {
  if (!sentAt) return null;
  const t = new Date(sentAt).getTime();
  if (!Number.isFinite(t) || now - t > RATE_WINDOW_MINUTES * 60_000) return null;
  return t;
}

/** Timestamps válidos de envio de TODA a campanha (sem corte de janela). */
function sentTimestamps(data: RateInput[]): number[] {
  const out: number[] = [];
  for (const r of data) {
    const t = toMs(r.sent_at);
    if (t !== null) out.push(t);
  }
  return out;
}

/**
 * Minutos decorridos da âncora até agora, nunca menos de 1 (senão a divisão
 * por zero transformaria 1 envio em taxa infinita). Sem teto: campanha longa
 * divide pelo tempo real desde o início.
 */
function elapsedMinutesSince(anchorMs: number, now: number): number {
  return Math.max(1, (now - anchorMs) / 60_000);
}

/**
 * Taxa média de envio (mensagens por minuto): envios TOTAIS da campanha
 * divididos pelos minutos desde o início — o `started_at` da campanha, com
 * fallback para o primeiro envio quando ele falta ou é inválido.
 * Sem envios → 0.
 */
export function measureRatePerMinute(
  data: RateInput[],
  now = Date.now(),
  startedAt: string | number | null = null,
): number {
  const timestamps = sentTimestamps(data);
  if (timestamps.length === 0) return 0;
  const anchor = toMs(startedAt) ?? Math.min(...timestamps);
  return timestamps.length / elapsedMinutesSince(anchor, now);
}

export interface RateOptions {
  throttlePerMinute?: number | null;
  /** talkx_campaigns.started_at: âncora da média; sem ele, o primeiro envio. */
  startedAt?: string | number | null;
  /** "Agora" injetável (testes); padrão Date.now(). */
  now?: number;
}

/**
 * Ritmo de entrega por minuto (últimos 60 min).
 *
 * `Previsto` é a projeção simples da etapa: a taxa MÉDIA da campanha (total
 * de envios ÷ minutos desde o `started_at`, ou desde o primeiro envio),
 * projetada para a frente como uma linha de referência e arredondada para
 * 1 casa. Quando a campanha tem teto configurado (`max_per_minute`), a
 * projeção é limitada por ele — o previsto nunca promete mais do que o
 * próprio throttle da campanha permite. Sem teto (null/0/ausente), o
 * Previsto usa o ritmo medido.
 */
export function buildRateByMinute(data: RateInput[], opts?: RateOptions): RatePoint[] {
  if (!data.length) return [];
  const now = opts?.now ?? Date.now();
  const buckets = new Map<string, { sent: number; delivered: number }>();

  for (const r of data) {
    const t = inWindow(r.sent_at, now);
    if (t === null) continue;
    const d = new Date(t);
    const key = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    const b = buckets.get(key) ?? { sent: 0, delivered: 0 };
    b.sent += 1;
    if (r.delivered_at) b.delivered += 1;
    buckets.set(key, b);
  }
  if (buckets.size === 0) return [];

  const timestamps = sentTimestamps(data);
  const anchor = toMs(opts?.startedAt) ?? Math.min(...timestamps);
  const measured = timestamps.length / elapsedMinutesSince(anchor, now);
  const throttle = opts?.throttlePerMinute;
  const hasCap = typeof throttle === 'number' && Number.isFinite(throttle) && throttle > 0;
  const expected = hasCap ? Math.min(measured, throttle as number) : measured;
  const previsto = Math.round(expected * 10) / 10;

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, { sent, delivered }]) => ({ label, Enviadas: sent, Entregues: delivered, Previsto: previsto }));
}

/**
 * Fila por segmento (T11-046..052): agrupa os destinatários da campanha por
 * `segment_id` e devolve total/enviadas/restante/progresso por segmento.
 * Destinatário sem segmento (seleção manual, ou campanha anterior ao snapshot
 * por segmento) entra na linha "Sem segmento". Entrega incerta
 * (`outcome_unknown`) saiu da fila: não conta como restante.
 */
export function buildSegmentQueue(
  recipients: { segment_id: string | null; status: string }[],
  names?: Map<string, string>,
): SegmentQueueRow[] {
  const grouped = new Map<string, { total: number; sent: number; uncertain: number }>();
  for (const r of recipients) {
    const key = r.segment_id ?? '';
    const b = grouped.get(key) ?? { total: 0, sent: 0, uncertain: 0 };
    b.total += 1;
    if (isSentStatus(r.status)) b.sent += 1;
    else if (isUncertainStatus(r.status)) b.uncertain += 1;
    grouped.set(key, b);
  }
  return Array.from(grouped.entries())
    .map(([key, { total, sent, uncertain }]) => ({
      segmentId: key === '' ? null : key,
      name: key === '' ? 'Sem segmento' : (names?.get(key) ?? key.slice(0, 8)),
      total,
      sent,
      remaining: total - sent - uncertain,
      progress: total > 0 ? Math.round((sent / total) * 100) : 0,
    }))
    .sort((a, b) => (a.segmentId === null ? 1 : b.segmentId === null ? -1 : b.total - a.total));
}

/**
 * Restante real (base do término estimado): o que ainda não saiu E não está
 * em entrega incerta (`outcome_unknown` saiu da fila, só falta a confirmação).
 */
export function countRemaining(recipients: { status: string }[]): number {
  return recipients.filter((r) => !isSentStatus(r.status) && !isUncertainStatus(r.status)).length;
}

/**
 * Término estimado, em minutos: restantes divididos pela taxa atual.
 * Sem taxa (> 0) não há estimativa (`null`); fila já vencida devolve 0.
 */
export function estimateFinishMinutes(remaining: number, ratePerMinute: number): number | null {
  if (remaining <= 0) return 0;
  if (!(ratePerMinute > 0)) return null;
  return remaining / ratePerMinute;
}

export function useTalkXMonitor(
  campaignId: string | null,
  throttlePerMinute: number | null = null,
  startedAt: string | number | null = null,
) {
  const query = useQuery({
    queryKey: ['talkx-monitor-recipients', campaignId],
    queryFn: async () => {
      const { data, error } = await fromTable('talkx_recipients')
        .select('id, contact_id, status, sent_at, delivered_at, error_message, personalized_message, segment_id')
        .eq('campaign_id', campaignId!)
        .order('sent_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as MonitorRecipient[];
    },
    enabled: !!campaignId,
    refetchInterval: 5_000,
  });

  const recipients = query.data ?? [];
  const segmentIds = Array.from(
    new Set(recipients.map((r) => r.segment_id).filter((id): id is string => !!id)),
  ).sort();

  // Nomes dos segmentos presentes na fila (talkx_segments). Falha aqui não derruba
  // a fila: sem nome, a linha cai no fallback pelo id (mesmo padrão do Analytics).
  const namesQuery = useQuery({
    queryKey: ['talkx-monitor-segment-names', campaignId, segmentIds.join(',')],
    queryFn: async () => {
      const { data, error } = await fromTable('talkx_segments').select('id, name').in('id', segmentIds);
      if (error) throw error;
      return new Map(((data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
    },
    enabled: segmentIds.length > 0,
    staleTime: 60_000,
  });

  const names = namesQuery.data;
  const now = Date.now();
  const remaining = countRemaining(recipients);
  const ratePerMinute = measureRatePerMinute(recipients, now, startedAt);

  return {
    recipients,
    isLoading: query.isLoading,
    isError: query.isError,
    rateByMinute: buildRateByMinute(recipients, { throttlePerMinute, startedAt, now }),
    ratePerMinute,
    remaining,
    finishMinutes: estimateFinishMinutes(remaining, ratePerMinute),
    segmentQueue: buildSegmentQueue(recipients, names),
    refetch: query.refetch,
  };
}
