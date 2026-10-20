import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useVisiblePolling } from '@/hooks/realtime/useVisiblePolling';

interface RateLimitLog {
  id: string;
  ip_address: string;
  endpoint: string;
  user_id: string | null;
  request_count: number;
  blocked: boolean | null;
  user_agent: string | null;
  country: string | null;
  city: string | null;
  created_at: string;
}

interface RateLimitStats {
  totalRequests: number;
  blockedRequests: number;
  uniqueIPs: number;
  topEndpoints: { endpoint: string; count: number }[];
  topIPs: { ip: string; count: number; blocked: boolean }[];
}

export function useRateLimitLogs(enabled = true) {
  const [logs, setLogs] = useState<RateLimitLog[]>([]);
  const [stats, setStats] = useState<RateLimitStats | null>(null);
  const [loading, setLoading] = useState(true);

  const calculateStats = useCallback((data: RateLimitLog[]) => {
    const totalRequests = data.reduce((sum, log) => sum + log.request_count, 0);
    const blockedRequests = data.filter(log => log.blocked).length;
    const uniqueIPs = new Set(data.map(log => log.ip_address)).size;

    // Top endpoints
    const endpointCounts: Record<string, number> = {};
    data.forEach(log => {
      endpointCounts[log.endpoint] = (endpointCounts[log.endpoint] || 0) + log.request_count;
    });
    const topEndpoints = Object.entries(endpointCounts)
      .map(([endpoint, count]) => ({ endpoint, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Top IPs
    const ipData: Record<string, { count: number; blocked: boolean }> = {};
    data.forEach(log => {
      if (!ipData[log.ip_address]) {
        ipData[log.ip_address] = { count: 0, blocked: false };
      }
      ipData[log.ip_address].count += log.request_count;
      if (log.blocked) ipData[log.ip_address].blocked = true;
    });
    const topIPs = Object.entries(ipData)
      .map(([ip, { count, blocked }]) => ({ ip, count, blocked }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    setStats({
      totalRequests,
      blockedRequests,
      uniqueIPs,
      topEndpoints,
      topIPs
    });
  }, []);

  const fetchLogs = useCallback(async (signal: AbortSignal) => {
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
    try {
      const { data, error } = await supabase
        .from('rate_limit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
        .abortSignal(requestSignal);
      if (!requestSignal.aborted && !error && data) {
        setLogs(data);
        calculateStats(data);
      }
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [calculateStats]);

  // Security logs intentionally are not in the Realtime publication.
  // Use the existing authenticated/RLS-protected read, not a new publication.
  const refetch = useVisiblePolling(fetchLogs, 30_000, enabled);

  return {
    logs,
    stats,
    loading,
    refetch
  };
}
