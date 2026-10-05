import { useQuery } from '@tanstack/react-query';
import { format, subDays, eachDayOfInterval } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

export type ActivityMetric = 'messages' | 'conversations' | 'resolutions';
export type ActivityPeriod = '3m' | '6m' | '1y';

export interface ActivityData {
  date: Date;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

const PERIOD_DAYS: Record<ActivityPeriod, number> = { '3m': 90, '6m': 180, '1y': 365 };

function toLevel(count: number): ActivityData['level'] {
  if (count > 80) return 4;
  if (count > 50) return 3;
  if (count > 20) return 2;
  if (count > 0) return 1;
  return 0;
}

const dayKey = (iso: string) => format(new Date(iso), 'yyyy-MM-dd');

/**
 * Contagem por dia da métrica pedida — DASH-CONTROLS-001: antes o queryFn
 * ignorava `metric` e sempre contava mensagens, então o select de métrica era
 * decorativo. Fontes:
 *   - `messages`: uma linha de `messages` = uma mensagem;
 *   - `conversations`: contatos distintos com mensagem no dia (neste schema a
 *     conversa é o contato — não existe tabela `conversations`);
 *   - `resolutions`: linhas de `conversation_closures`, o evento canônico de
 *     conversa encerrada/resolvida.
 */
export async function fetchDailyActivity(metric: ActivityMetric, startDate: Date): Promise<Map<string, number>> {
  if (metric === 'resolutions') {
    const { data, error } = await supabase
      .from('conversation_closures')
      .select('created_at')
      .gte('created_at', startDate.toISOString());
    if (error) throw error;
    const counts = new Map<string, number>();
    (data ?? []).forEach(r => counts.set(dayKey(r.created_at), (counts.get(dayKey(r.created_at)) ?? 0) + 1));
    return counts;
  }

  const { data: messages, error } = await supabase
    .from('messages')
    .select('created_at, contact_id')
    .gte('created_at', startDate.toISOString());
  if (error) throw error;

  if (metric === 'conversations') {
    const contactsByDay = new Map<string, Set<string>>();
    (messages ?? []).forEach((m, i) => {
      const key = dayKey(m.created_at);
      const set = contactsByDay.get(key) ?? new Set<string>();
      set.add(m.contact_id ?? `sem-contato-${i}`);
      contactsByDay.set(key, set);
    });
    return new Map([...contactsByDay.entries()].map(([k, s]) => [k, s.size]));
  }

  const counts = new Map<string, number>();
  (messages ?? []).forEach(m => counts.set(dayKey(m.created_at), (counts.get(dayKey(m.created_at)) ?? 0) + 1));
  return counts;
}

export function useActivityHeatmapData(period: ActivityPeriod, metric: ActivityMetric, enabled: boolean) {
  return useQuery({
    queryKey: ['activity-heatmap', period, metric],
    queryFn: async (): Promise<ActivityData[]> => {
      const startDate = subDays(new Date(), PERIOD_DAYS[period]);
      const dayCounts = await fetchDailyActivity(metric, startDate);
      return eachDayOfInterval({ start: startDate, end: new Date() }).map(date => ({
        date,
        count: dayCounts.get(format(date, 'yyyy-MM-dd')) ?? 0,
        level: toLevel(dayCounts.get(format(date, 'yyyy-MM-dd')) ?? 0),
      }));
    },
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}
