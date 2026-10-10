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

function inWindow(sentAt: string | null, now: number): number | null {
  if (!sentAt) return null;
  const t = new Date(sentAt).getTime();
  if (!Number.isFinite(t) || now - t > RATE_WINDOW_MINUTES * 60_000) return null;
  return t;
}

/**
 * Minutos efetivamente decorridos na janela, do primeiro envio até agora.
 * Nunca menos de 1 (senão a divisão por zero transformaria 1 envio em taxa infinita)
 * e nunca mais de 60 (o teto da janela).
 */
function windowSpanMinutes(firstTs: number, now: number): number {
  return Math.min(RATE_WINDOW_MINUTES, Math.max(1, (now - firstTs) / 60_000));
}

/**
 * Taxa de envio medida (mensagens por minuto): envios da janela divididos pelos
 * minutos decorridos desde o primeiro envio da janela. Sem envios na janela → 0.
 */
export function measureRatePerMinute(data: RateInput[], now = Date.now()): number {
  let total = 0;
  let firstTs = Number.POSITIVE_INFINITY;
  for (const r of data) {
    const t = inWindow(r.sent_at, now);
    if (t === null) continue;
    total += 1;
    if (t < firstTs) firstTs = t;
  }
  if (total === 0) return 0;
  return total / windowSpanMinutes(firstTs, now);
}

/**
 * Ritmo de entrega por minuto (últimos 60 min).
 *
 * `Previsto` é a projeção simples da etapa: a taxa média medida na janela,
 * projetada para a frente como uma linha de referência. Quando a campanha tem
 * teto configurado (`max_per_minute`), a projeção é limitada por ele — o
 * previsto nunca promete mais do que o próprio throttle da campanha permite.
 */
export function buildRateByMinute(
  data: RateInput[],
  opts?: { throttlePerMinute?: number | null },
): RatePoint[] {
  if (!data.length) return [];
  const now = Date.now();
  const buckets = new Map<string, { sent: number; delivered: number }>();
  let total = 0;
  let firstTs = Number.POSITIVE_INFINITY;

  for (const r of data) {
    const t = inWindow(r.sent_at, now);
    if (t === null) continue;
    total += 1;
    if (t < firstTs) firstTs = t;
    const d = new Date(t);
    const key = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const b = buckets.get(key) ?? { sent: 0, delivered: 0 };
    b.sent += 1;
    if (r.delivered_at) b.delivered += 1;
    buckets.set(key, b);
  }
  if (buckets.size === 0) return [];

  const measured = total / windowSpanMinutes(firstTs, now);
  const throttle = opts?.throttlePerMinute;
  const expected = throttle && throttle > 0 ? Math.min(measured, throttle) : measured;
  const previsto = Math.round(expected * 10) / 10;

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, { sent, delivered }]) => ({ label, Enviadas: sent, Entregues: delivered, Previsto: previsto }));
}

/**
 * Fila por segmento (T11-046..052): agrupa os destinatários da campanha por
 * `segment_id` e devolve total/enviadas/restante/progresso por segmento.
 * Destinatário sem segmento (seleção manual, ou campanha anterior ao snapshot
 * por segmento) entra na linha "Sem segmento".
 */
export function buildSegmentQueue(
  recipients: { segment_id: string | null; status: string }[],
  names?: Map<string, string>,
): SegmentQueueRow[] {
  const grouped = new Map<string, { total: number; sent: number }>();
  for (const r of recipients) {
    const key = r.segment_id ?? '';
    const b = grouped.get(key) ?? { total: 0, sent: 0 };
    b.total += 1;
    if (isSentStatus(r.status)) b.sent += 1;
    grouped.set(key, b);
  }
  return Array.from(grouped.entries())
    .map(([key, { total, sent }]) => ({
      segmentId: key === '' ? null : key,
      name: key === '' ? 'Sem segmento' : (names?.get(key) ?? key.slice(0, 8)),
      total,
      sent,
      remaining: total - sent,
      progress: total > 0 ? Math.round((sent / total) * 100) : 0,
    }))
    .sort((a, b) => (a.segmentId === null ? 1 : b.segmentId === null ? -1 : b.total - a.total));
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

export function useTalkXMonitor(campaignId: string | null, throttlePerMinute: number | null = null) {
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
  const remaining = recipients.filter((r) => !isSentStatus(r.status)).length;
  const ratePerMinute = measureRatePerMinute(recipients);

  return {
    recipients,
    isLoading: query.isLoading,
    isError: query.isError,
    rateByMinute: buildRateByMinute(recipients, { throttlePerMinute }),
    ratePerMinute,
    remaining,
    finishMinutes: estimateFinishMinutes(remaining, ratePerMinute),
    segmentQueue: buildSegmentQueue(recipients, names),
    refetch: query.refetch,
  };
}
