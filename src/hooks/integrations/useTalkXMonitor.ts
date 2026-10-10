import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseHelpers';

export interface RatePoint { label: string; Enviadas: number; Entregues: number }

export interface MonitorRecipient {
  id: string;
  contact_id: string | null;
  status: string;
  sent_at: string | null;
  delivered_at: string | null;
  error_message: string | null;
  personalized_message: string | null;
}

export function buildRateByMinute(data: { sent_at: string | null; delivered_at: string | null }[]): RatePoint[] {
  if (!data.length) return [];
  const now = Date.now();
  const windowMs = 60 * 60_000;
  const buckets = new Map<string, { sent: number; delivered: number }>();

  for (const r of data) {
    if (!r.sent_at) continue;
    const t = new Date(r.sent_at).getTime();
    if (now - t > windowMs) continue;
    const d = new Date(t);
    const key = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const b = buckets.get(key) ?? { sent: 0, delivered: 0 };
    b.sent += 1;
    if (r.delivered_at) b.delivered += 1;
    buckets.set(key, b);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, { sent, delivered }]) => ({ label, Enviadas: sent, Entregues: delivered }));
}

export function useTalkXMonitor(campaignId: string | null, statusFilter = 'all') {
  const [cursor, setCursor] = useState<string | null>(null);
  const [pageRows, setPageRows] = useState<MonitorRecipient[]>([]);
  const [pageNextCursor, setPageNextCursor] = useState<string | null>(null);

  type RpcResult = { rows: MonitorRecipient[]; next_cursor: string | null; total: number };

  const query = useQuery<RpcResult>({
    queryKey: ['talkx-monitor-recipients', campaignId, statusFilter, cursor],
    queryFn: async () => {
      const { data: rpcData, error: rpcError } = await supabase.rpc('talkx_campaign_recipients_page', {
        p_campaign_id: campaignId!,
        p_limit: 200,
        p_cursor: cursor ?? null,
        p_status: statusFilter === 'all' ? null : statusFilter,
        p_search: null,
      });
      if (rpcError) throw rpcError;
      return rpcData as RpcResult;
    },
    enabled: !!campaignId,
    refetchInterval: 5_000,
  });

  // Sync RPC result into local pagination state
  useEffect(() => {
    if (query.data) {
      setPageRows(query.data.rows);
      setPageNextCursor(query.data.next_cursor);
    }
  }, [query.data]);

  const loadMore = () => {
    if (pageNextCursor) setCursor(pageNextCursor);
  };

  return {
    recipients: pageRows,
    recipientsNextCursor: pageNextCursor,
    loadMoreRecipients: loadMore,
    isLoading: query.isLoading,
    isError: query.isError,
    rateByMinute: buildRateByMinute(pageRows),
    refetch: query.refetch,
  };
}
