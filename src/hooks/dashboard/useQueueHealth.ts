import { useMemo } from 'react';
import type { DashboardQueueBreakdown } from './useDashboardStats';

interface QueueHealthQueue {
  id: string;
  name: string;
  color?: string | null;
}

export interface QueueHealthRow {
  queueId: string;
  name: string;
  color: string | null;
  waiting: number;
  inService: number;
  avgResponse: number | null;
  slaRate: number | null;
  status: 'excelente' | 'bom' | 'atencao' | null;
}

// E24/E25: breakdown por fila (waiting/inService/avgResponse/slaRate) já vem
// pronto da RPC dashboard_contact_counts (calculado em useDashboardStats),
// no lugar do fetch próprio de conversation_sla + filter() client-side sobre
// `contacts`/`queues` crus (mesma classe de truncamento do achado A11 que
// o cap `.limit(5000)` do E26 só mitigava).
export function useQueueHealth(breakdown: DashboardQueueBreakdown[] | undefined, queues: QueueHealthQueue[] | undefined) {
  const rows = useMemo<QueueHealthRow[]>(() => {
    if (!queues) return [];
    const byQueue = new Map((breakdown ?? []).map((b) => [b.queueId, b]));
    return queues
      .map((q) => {
        const b = byQueue.get(q.id);
        const waiting = b?.waiting ?? 0;
        const inService = b?.inService ?? 0;
        const avgResponse = b?.avgResponse ?? null;
        const slaRate = b?.slaRate ?? null;
        const status: QueueHealthRow['status'] = slaRate === null ? null : slaRate >= 95 ? 'excelente' : slaRate >= 85 ? 'bom' : 'atencao';
        return { queueId: q.id, name: q.name, color: q.color ?? null, waiting, inService, avgResponse, slaRate, status };
      })
      .sort((a, b) => b.waiting + b.inService - (a.waiting + a.inService));
  }, [breakdown, queues]);

  const busiestQueue = rows.length ? rows[0] : null;

  return { rows, busiestQueue };
}
