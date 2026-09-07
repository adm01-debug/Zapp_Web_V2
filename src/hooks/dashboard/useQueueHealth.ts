import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { startOfDay } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

interface QueueHealthContact {
  id: string;
  queue_id: string | null;
  assigned_to: string | null;
}

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

type SlaRow = { contact_id: string | null; first_message_at: string; first_response_at: string | null; first_response_breached: boolean | null };

export function useQueueHealth(contacts: QueueHealthContact[] | undefined, queues: QueueHealthQueue[] | undefined) {
  const slaQuery = useQuery({
    queryKey: ['queue-health'],
    queryFn: async () => {
      const since = startOfDay(new Date()).toISOString();
      const { data, error } = await supabase
        .from('conversation_sla')
        .select('contact_id, first_message_at, first_response_at, first_response_breached')
        .gte('first_message_at', since);
      if (error) throw error;
      return (data ?? []) as SlaRow[];
    },
    staleTime: 60_000,
  });

  const rows = useMemo<QueueHealthRow[]>(() => {
    if (!contacts || !queues) return [];
    const slaByContact = new Map((slaQuery.data ?? []).filter((r) => r.contact_id).map((r) => [r.contact_id as string, r]));
    return queues
      .map((q) => {
        const queueContacts = contacts.filter((c) => c.queue_id === q.id);
        const waiting = queueContacts.filter((c) => !c.assigned_to).length;
        const inService = queueContacts.filter((c) => c.assigned_to).length;
        const slaRows = queueContacts.map((c) => slaByContact.get(c.id)).filter((r): r is SlaRow => !!r);
        const answered = slaRows.filter((r) => r.first_response_at);
        const avgResponse = answered.length
          ? Math.round(answered.reduce((a, r) => a + (Date.parse(r.first_response_at as string) - Date.parse(r.first_message_at)) / 1000, 0) / answered.length)
          : null;
        const onTime = slaRows.filter((r) => r.first_response_breached === false).length;
        const slaRate = slaRows.length ? Math.round((onTime / slaRows.length) * 100) : null;
        const status: QueueHealthRow['status'] = slaRate === null ? null : slaRate >= 95 ? 'excelente' : slaRate >= 85 ? 'bom' : 'atencao';
        return { queueId: q.id, name: q.name, color: q.color ?? null, waiting, inService, avgResponse, slaRate, status };
      })
      .sort((a, b) => b.waiting + b.inService - (a.waiting + a.inService));
  }, [contacts, queues, slaQuery.data]);

  const busiestQueue = rows.length ? rows[0] : null;

  return { rows, busiestQueue, isLoading: slaQuery.isLoading };
}
