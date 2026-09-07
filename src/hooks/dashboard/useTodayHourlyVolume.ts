import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { subDays, startOfDay, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

type MessageRow = { created_at: string };

export function aggregateTodayHourlyVolume(rows: MessageRow[], now = new Date()) {
  const todayStart = startOfDay(now);
  const currentHour = now.getHours();

  const todayByHour: (number | null)[] = Array.from({ length: 24 }, (_, h) => (h > currentHour ? null : 0));

  // últimos 7 dias, hoje incluído (para o select "Últimos 7 dias (por dia)").
  const last7Keys = Array.from({ length: 7 }, (_, i) => format(startOfDay(subDays(now, 6 - i)), 'yyyy-MM-dd'));
  const countsByDay = new Map<string, number>(last7Keys.map((k) => [k, 0]));

  // 7 dias ANTERIORES a hoje (exclui hoje) — base do avg7dCurrentHour.
  const priorKeys = Array.from({ length: 7 }, (_, i) => format(startOfDay(subDays(now, i + 1)), 'yyyy-MM-dd'));
  const countsAtHourByPriorDay = new Map<string, number>(priorKeys.map((k) => [k, 0]));

  for (const row of rows) {
    const t = new Date(row.created_at);
    const dayStart = startOfDay(t);
    const dayKey = format(dayStart, 'yyyy-MM-dd');

    if (countsByDay.has(dayKey)) countsByDay.set(dayKey, (countsByDay.get(dayKey) ?? 0) + 1);

    if (dayStart.getTime() === todayStart.getTime()) {
      const h = t.getHours();
      if (h <= currentHour) todayByHour[h] = (todayByHour[h] ?? 0) + 1;
    } else if (countsAtHourByPriorDay.has(dayKey) && t.getHours() === currentHour) {
      countsAtHourByPriorDay.set(dayKey, (countsAtHourByPriorDay.get(dayKey) ?? 0) + 1);
    }
  }

  const last7ByDay = last7Keys.map((date) => ({ date, count: countsByDay.get(date) ?? 0 }));
  const currentHourCount = todayByHour[currentHour] ?? 0;
  const priorCounts = [...countsAtHourByPriorDay.values()];
  const avg7dCurrentHour = priorCounts.length
    ? Math.round((priorCounts.reduce((a, b) => a + b, 0) / priorCounts.length) * 10) / 10
    : null;

  return { todayByHour, last7ByDay, currentHour, currentHourCount, avg7dCurrentHour };
}

export function useTodayHourlyVolume() {
  return useQuery({
    queryKey: ['today-hourly-volume'],
    queryFn: async () => {
      const since = startOfDay(subDays(new Date(), 7)).toISOString();
      const { data, error } = await supabase.from('messages').select('created_at').gte('created_at', since);
      if (error) throw error;
      return aggregateTodayHourlyVolume((data ?? []) as MessageRow[]);
    },
    staleTime: 60_000,
  });
}
