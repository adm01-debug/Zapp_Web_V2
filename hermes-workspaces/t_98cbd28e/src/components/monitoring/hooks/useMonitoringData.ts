import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import type { ConnectionInfo, HealthLog, MessageStats, UptimeInfo, SparklineData, InstanceUptime, TimePeriod } from './types';
import { periodMs, periodBuckets, HEALTHY_STATUSES } from './types';

const log = getLogger('MonitoringData');

function computeUptime(logs: HealthLog[], now: Date): UptimeInfo {
  const dayAgo = new Date(now.getTime() - 86400000);
  const recent = logs.filter(l => new Date(l.checked_at) >= dayAgo);
  const healthy = recent.filter(l => HEALTHY_STATUSES.includes(l.status));
  const lastFail = recent.find(l => !HEALTHY_STATUSES.includes(l.status));
  return {
    percentage: recent.length > 0 ? Math.round((healthy.length / recent.length) * 1000) / 10 : 100,
    totalChecks: recent.length, healthyChecks: healthy.length,
    lastDowntime: lastFail?.checked_at || null,
  };
}

function computeInstanceUptimes(logs: HealthLog[], now: Date): InstanceUptime[] {
  const dayAgo = new Date(now.getTime() - 86400000);
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

function computeSparklines(logs: HealthLog[], msgs: { sender: string; created_at: string }[], now: Date, period: TimePeriod): SparklineData {
  const r: SparklineData = { messages: [], latency: [], uptime: [] };
  const ms = periodMs[period];
  const bucketSize = ms / 8;

  for (let i = 7; i >= 0; i--) {
    const s = new Date(now.getTime() - (i + 1) * bucketSize);
    const e = new Date(now.getTime() - i * bucketSize);
    const hl = logs.filter(l => { const t = new Date(l.checked_at); return t >= s && t < e; });
    const hh = hl.filter(l => HEALTHY_STATUSES.includes(l.status));
    r.uptime.push(hl.length > 0 ? Math.round((hh.length / hl.length) * 100) : 100);
    const ll = hl.filter(l => l.response_time_ms != null);
    r.latency.push(ll.length > 0 ? Math.round(ll.reduce((a, l) => a + (l.response_time_ms || 0), 0) / ll.length) : 0);
    r.messages.push(msgs.filter(m => { const t = new Date(m.created_at); return t >= s && t < e; }).length);
  }
  return r;
}

export function useMonitoringData(onConnectionsUpdate?: (c: ConnectionInfo[]) => void) {
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [healthLogs, setHealthLogs] = useState<HealthLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageStats, setMessageStats] = useState<MessageStats>({ incoming: 0, outgoing: 0, total: 0, hourlyData: [] });
  const [uptime, setUptime] = useState<UptimeInfo>({ percentage: 0, totalChecks: 0, healthyChecks: 0, lastDowntime: null });
  const [sparklines, setSparklines] = useState<SparklineData>({ messages: [], latency: [], uptime: [] });
  const [instanceUptimes, setInstanceUptimes] = useState<InstanceUptime[]>([]);

  const fetchData = useCallback(async (period: TimePeriod = '12h') => {
    try {
      const now = new Date();
      const since = new Date(now.getTime() - periodMs[period]);
      const [connRes, logsRes, msgRes] = await Promise.all([
        supabase.from('whatsapp_connections').select('id, instance_id, phone_number, status, health_status, health_response_ms, last_health_check, updated_at'),
        supabase.from('connection_health_logs').select('*').gte('checked_at', since.toISOString()).order('checked_at', { ascending: false }).limit(2000),
        supabase.from('messages').select('sender, created_at').gte('created_at', since.toISOString()).order('created_at', { ascending: true }),
      ]);

      if (connRes.data) { setConnections(connRes.data as ConnectionInfo[]); onConnectionsUpdate?.(connRes.data as ConnectionInfo[]); }
      if (logsRes.data) {
        setHealthLogs(logsRes.data);
        setUptime(computeUptime(logsRes.data, now));
        setInstanceUptimes(computeInstanceUptimes(logsRes.data, now));
      }
      if (msgRes.data) {
        const incoming = msgRes.data.filter(m => m.sender === 'contact').length;
        const outgoing = msgRes.data.filter(m => m.sender === 'agent').length;
        const bucketCount = periodBuckets[period];
        const bucketSize = periodMs[period] / bucketCount;
        const buckets: Record<string, { incoming: number; outgoing: number }> = {};
        for (let i = bucketCount - 1; i >= 0; i--) {
          const bTime = new Date(now.getTime() - i * bucketSize);
          const key = period === '7d' || period === '24h'
            ? `${bTime.getDate().toString().padStart(2, '0')}/${(bTime.getMonth() + 1).toString().padStart(2, '0')} ${bTime.getHours().toString().padStart(2, '0')}h`
            : `${bTime.getHours().toString().padStart(2, '0')}:00`;
          buckets[key] = { incoming: 0, outgoing: 0 };
        }
        msgRes.data.forEach(m => {
          const mTime = new Date(m.created_at);
          const key = period === '7d' || period === '24h'
            ? `${mTime.getDate().toString().padStart(2, '0')}/${(mTime.getMonth() + 1).toString().padStart(2, '0')} ${mTime.getHours().toString().padStart(2, '0')}h`
            : `${mTime.getHours().toString().padStart(2, '0')}:00`;
          if (buckets[key]) { if (m.sender === 'contact') buckets[key].incoming++; else buckets[key].outgoing++; }
        });
        setMessageStats({ incoming, outgoing, total: msgRes.data.length, hourlyData: Object.entries(buckets).map(([hour, d]) => ({ hour, ...d })) });
      }
      if (logsRes.data && msgRes.data) setSparklines(computeSparklines(logsRes.data, msgRes.data, now, period));
    } catch (err) {
      log.error('Monitoring fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [onConnectionsUpdate]);

  return { connections, healthLogs, loading, messageStats, uptime, sparklines, instanceUptimes, fetchData };
}
