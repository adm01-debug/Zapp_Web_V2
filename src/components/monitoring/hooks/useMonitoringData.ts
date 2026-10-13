import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import type { ConnectionInfo, HealthLog, MessageStats, UptimeInfo, SparklineData, InstanceUptime, TimePeriod } from './types';
import { periodMs, periodBuckets, HEALTHY_STATUSES, SLA_WINDOW_MS, AVAILABILITY_WINDOW_MS, HEALTH_LOGS_LIMIT } from './types';

const log = getLogger('MonitoringData');

function computeUptime(logs: HealthLog[], now: Date): UptimeInfo {
  // R2-INF-027: o SLA é das últimas 24h, independente do período selecionado.
  const dayAgo = new Date(now.getTime() - SLA_WINDOW_MS);
  const recent = logs.filter(l => new Date(l.checked_at) >= dayAgo);
  const healthy = recent.filter(l => HEALTHY_STATUSES.includes(l.status));
  const lastFail = recent.find(l => !HEALTHY_STATUSES.includes(l.status));
  return {
    // Sem checks na janela não há SLA a aprovar: dado insuficiente (null), nunca 100%.
    percentage: recent.length > 0 ? Math.round((healthy.length / recent.length) * 1000) / 10 : null,
    totalChecks: recent.length, healthyChecks: healthy.length,
    lastDowntime: lastFail?.checked_at || null,
  };
}

function computeInstanceUptimes(logs: HealthLog[], now: Date): InstanceUptime[] {
  const dayAgo = new Date(now.getTime() - SLA_WINDOW_MS);
  const recent = logs.filter(l => new Date(l.checked_at) >= dayAgo);
  const map = new Map<string, HealthLog[]>();
  recent.forEach(l => map.set(l.instance_id, [...(map.get(l.instance_id) || []), l]));

  return Array.from(map.entries()).map(([instanceId, instLogs]) => {
    const h = instLogs.filter(l => HEALTHY_STATUSES.includes(l.status));
    const lats = instLogs.filter(l => l.response_time_ms != null).map(l => l.response_time_ms!);
    const lastErr = instLogs.find(l => !HEALTHY_STATUSES.includes(l.status));
    return {
      instanceId,
      percentage: instLogs.length > 0 ? Math.round((h.length / instLogs.length) * 1000) / 10 : 100,
      totalChecks: instLogs.length, healthyChecks: h.length,
      avgLatency: lats.length > 0 ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : 0,
      lastError: lastErr?.error_message || null,
    };
  });
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function formatDayLabel(t: Date): string {
  const dd = t.getDate().toString().padStart(2, '0');
  const mm = (t.getMonth() + 1).toString().padStart(2, '0');
  return `${dd}/${mm}`;
}

function startOfLocalDay(t: Date): Date {
  const day = new Date(t);
  day.setHours(0, 0, 0, 0);
  return day;
}

function startOfLocalHour(t: Date): Date {
  const hour = new Date(t);
  hour.setMinutes(0, 0, 0);
  return hour;
}

function addLocalDays(t: Date, days: number): Date {
  const day = new Date(t);
  day.setDate(day.getDate() + days);
  return day;
}

// R2-INF-028: a mensagem é agrupada por índice temporal e só depois rotulada.
// Em '7d' os baldes são dias civis locais (hoje-6 ... hoje), não uma janela
// deslizante now-7d. Em '24h' os baldes começam em hora cheia, para que o rótulo
// "DD/MM HHh" represente exatamente a hora civil em que a mensagem caiu.
function formatBucketLabel(startMs: number, period: TimePeriod, bucketSize: number): string {
  const t = new Date(startMs);
  const hh = t.getHours().toString().padStart(2, '0');
  if (period === '7d') return formatDayLabel(t);
  if (period === '24h') return `${formatDayLabel(t)} ${hh}h`;
  if (bucketSize < 3600000) return `${hh}:${t.getMinutes().toString().padStart(2, '0')}`;
  return `${hh}:00`;
}

function bucketWindow(now: Date, period: TimePeriod, bucketCount: number) {
  if (period === '7d') {
    const start = addLocalDays(startOfLocalDay(now), -(bucketCount - 1));
    return { startMs: start.getTime(), bucketSize: DAY_MS };
  }
  if (period === '24h') {
    const start = new Date(startOfLocalHour(now));
    start.setHours(start.getHours() - (bucketCount - 1));
    return { startMs: start.getTime(), bucketSize: HOUR_MS };
  }
  return { startMs: now.getTime() - periodMs[period], bucketSize: periodMs[period] / bucketCount };
}

function computeSparklines(logs: HealthLog[], now: Date, period: TimePeriod): { latency: number[]; uptime: number[] } {
  const latency: number[] = [];
  const uptime: number[] = [];
  const ms = periodMs[period];
  const bucketSize = ms / 8;

  for (let i = 7; i >= 0; i--) {
    const s = new Date(now.getTime() - (i + 1) * bucketSize);
    const e = new Date(now.getTime() - i * bucketSize);
    const hl = logs.filter(l => { const t = new Date(l.checked_at); return t >= s && t < e; });
    const hh = hl.filter(l => HEALTHY_STATUSES.includes(l.status));
    uptime.push(hl.length > 0 ? Math.round((hh.length / hl.length) * 100) : 100);
    const ll = hl.filter(l => l.response_time_ms != null);
    latency.push(ll.length > 0 ? Math.round(ll.reduce((a, l) => a + (l.response_time_ms || 0), 0) / ll.length) : 0);
  }
  return { latency, uptime };
}

interface BucketRow { bucket_start: string; incoming: number | string; outgoing: number | string }

// R2-INF-028: o gráfico e as somas vêm da agregação NO BANCO
// (public.get_monitoring_message_buckets). Antes o hook trazia as mensagens cruas
// (`from('messages')` sem limit) e o PostgREST cortava em 1.000 linhas: em 24h/7d
// a curva e o total ficavam MENORES que o real. A RPC devolve uma linha por balde.
// O balde é ancorado pelo servidor no início da hora cheia / dia civil em
// America/Sao_Paulo — por isso o primeiro balde pode ser parcial e a janela pode
// render uma linha a mais que a contagem nominal do período.
async function fetchMessageBuckets(from: Date, to: Date, bucketMs: number): Promise<{ rows: BucketRow[] | null; error: string | null }> {
  // O argumento da RPC é `interval`; o PostgREST o recebe como texto ('600 seconds').
  const p_bucket = `${Math.round(bucketMs / 1000)} seconds`;
  try {
    const { data, error } = await supabase.rpc('get_monitoring_message_buckets', {
      p_from: from.toISOString(),
      p_to: to.toISOString(),
      p_bucket,
    });
    if (error) return { rows: null, error: error.message };
    return { rows: (data as BucketRow[] | null) ?? [], error: null };
  } catch (err) {
    // A RPC pode não existir no cliente mockado/antigo: a falha fica sinalizada,
    // nunca zerada silenciosamente.
    return { rows: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Soma a agregação em 8 barras (janela de `periodMs[period]`), sem perder balde. */
function sparklineFromBuckets(rows: BucketRow[], windowStartMs: number, period: TimePeriod): number[] {
  const bars = new Array(8).fill(0) as number[];
  const step = periodMs[period] / 8;
  rows.forEach(r => {
    const t = Date.parse(r.bucket_start);
    if (Number.isNaN(t)) return;
    const idx = Math.min(7, Math.max(0, Math.floor((t - windowStartMs) / step)));
    bars[idx] += Number(r.incoming || 0) + Number(r.outgoing || 0);
  });
  return bars;
}

/**
 * A soma do gráfico só é confiável se a agregação cobriu a janela pedida: marca
 * quando a RPC falhou (`rows === null`) ou quando o primeiro balde devolvido
 * começa DEPOIS do início da janela (buraco no começo da curva).
 */
function aggregationPartial(rows: BucketRow[] | null, windowStart: Date): boolean {
  if (rows === null) return true;
  if (rows.length === 0) return false;
  const first = Date.parse(rows[0].bucket_start);
  return Number.isNaN(first) || first > windowStart.getTime();
}

export function useMonitoringData(onConnectionsUpdate?: (c: ConnectionInfo[]) => void) {
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [healthLogs, setHealthLogs] = useState<HealthLog[]>([]);
  const [availabilityLogs, setAvailabilityLogs] = useState<HealthLog[]>([]);
  const [healthLogsTruncated, setHealthLogsTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messageStats, setMessageStats] = useState<MessageStats>({ incoming: 0, outgoing: 0, total: 0, hourlyData: [] });
  // Sinaliza que a soma/curva de mensagens NÃO cobre a janela pedida (RPC falhou
  // ou o primeiro balde começa depois do início) — a tela não deve exibir um
  // número parcial como se fosse o período inteiro.
  const [messageStatsPartial, setMessageStatsPartial] = useState(false);
  const [uptime, setUptime] = useState<UptimeInfo>({ percentage: null, totalChecks: 0, healthyChecks: 0, lastDowntime: null });
  const [sparklines, setSparklines] = useState<SparklineData>({ messages: [], latency: [], uptime: [] });
  const [instanceUptimes, setInstanceUptimes] = useState<InstanceUptime[]>([]);

  const fetchData = useCallback(async (period: TimePeriod = '12h') => {
    try {
      const now = new Date();
      const since = new Date(now.getTime() - periodMs[period]);
      const bucketCountForPeriod = periodBuckets[period];
      const messageWindow = bucketWindow(now, period, bucketCountForPeriod);
      const messageSince = new Date(messageWindow.startMs);
      // R2-INF-027: os health logs cobrem a maior janela anunciada (7 dias), para
      // alimentar o SLA de 24h e o heatmap de 7 dias mesmo com seleção menor.
      const logsSince = new Date(now.getTime() - AVAILABILITY_WINDOW_MS);
      const [connRes, logsRes, graphAgg, sparkAgg] = await Promise.all([
        supabase.from('whatsapp_connections').select('id, instance_id, phone_number, status, health_status, health_response_ms, last_health_check, updated_at'),
        supabase.from('connection_health_logs').select('*').gte('checked_at', logsSince.toISOString()).order('checked_at', { ascending: false }).limit(HEALTH_LOGS_LIMIT),
        // R2-INF-028: gráfico (janela do período) e barras das sparklines (janela
        // deslizante do período) vêm da agregação no banco — nenhuma das duas
        // busca mensagem crua, então não há teto de 1.000 linhas para cortar.
        fetchMessageBuckets(messageSince, now, messageWindow.bucketSize),
        fetchMessageBuckets(since, now, periodMs[period] / 8),
      ]);

      if (connRes.data) { setConnections(connRes.data as ConnectionInfo[]); onConnectionsUpdate?.(connRes.data as ConnectionInfo[]); }
      if (logsRes.data) {
        const logs = logsRes.data as HealthLog[];
        setAvailabilityLogs(logs);
        setHealthLogsTruncated(logs.length >= HEALTH_LOGS_LIMIT);
        setHealthLogs(logs.filter(l => new Date(l.checked_at) >= since));
        setUptime(computeUptime(logs, now));
        setInstanceUptimes(computeInstanceUptimes(logs, now));
      }
      if (!graphAgg.rows) log.error('Monitoring message buckets error (grafico):', graphAgg.error);
      if (!sparkAgg.rows) log.error('Monitoring message buckets error (sparklines):', sparkAgg.error);
      if (graphAgg.rows) {
        const { bucketSize } = messageWindow;
        let incoming = 0;
        let outgoing = 0;
        const hourlyData = graphAgg.rows.map(r => {
          const inCount = Number(r.incoming) || 0;
          const outCount = Number(r.outgoing) || 0;
          incoming += inCount;
          outgoing += outCount;
          return { hour: formatBucketLabel(Date.parse(r.bucket_start), period, bucketSize), incoming: inCount, outgoing: outCount };
        });
        setMessageStats({ incoming, outgoing, total: incoming + outgoing, hourlyData });
      }
      setMessageStatsPartial(aggregationPartial(graphAgg.rows, messageSince));
      if (logsRes.data || sparkAgg.rows) {
        setSparklines(prev => {
          const next: SparklineData = { ...prev };
          if (logsRes.data) {
            const sl = computeSparklines(logsRes.data as HealthLog[], now, period);
            next.latency = sl.latency;
            next.uptime = sl.uptime;
          }
          if (sparkAgg.rows) next.messages = sparklineFromBuckets(sparkAgg.rows, since.getTime(), period);
          return next;
        });
      }
    } catch (err) {
      log.error('Monitoring fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [onConnectionsUpdate]);

  return { connections, healthLogs, availabilityLogs, healthLogsTruncated, loading, messageStats, messageStatsPartial, uptime, sparklines, instanceUptimes, fetchData };
}
