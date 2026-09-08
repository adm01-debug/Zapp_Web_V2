import { useQuery } from '@tanstack/react-query';
import { fromTable } from '@/lib/supabaseHelpers';

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

function buildRateByMinute(data: { sent_at: string | null; delivered_at: string | null }[]): RatePoint[] {
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
  const query = useQuery({
    queryKey: ['talkx-monitor-recipients', campaignId, statusFilter],
    queryFn: async () => {
      let q = fromTable('talkx_recipients')
        .select('id, contact_id, status, sent_at, delivered_at, error_message, personalized_message')
        .eq('campaign_id', campaignId!)
        .order('sent_at', { ascending: false })
        .limit(2000);
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as MonitorRecipient[];
    },
    enabled: !!campaignId,
    refetchInterval: 5_000,
  });

  return {
    recipients: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    rateByMinute: buildRateByMinute(query.data ?? []),
    refetch: query.refetch,
  };
}
