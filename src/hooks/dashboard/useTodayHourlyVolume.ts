import { useQuery } from '@tanstack/react-query';
import { subDays, startOfDay, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

// Bucket agregado pela RPC dashboard_hourly_volume (E22): 1 linha por (dia, hora)
// com a contagem já somada no servidor — nunca mais linha por mensagem crua (achado
// A6: o cap silencioso de 1000 linhas do PostgREST truncava a amostra de 8 dias).
export type HourlyBucket = { day: string; hour: number; message_count: number };

export function aggregateHourlyVolume(buckets: HourlyBucket[], now = new Date()) {
  const todayStart = startOfDay(now);
  const currentHour = now.getHours();
  const todayKey = format(todayStart, 'yyyy-MM-dd');

  const todayByHour: (number | null)[] = Array.from({ length: 24 }, (_, h) => (h > currentHour ? null : 0));

  // últimos 7 dias, hoje incluído (para o select "Últimos 7 dias (por dia)").
  const last7Keys = Array.from({ length: 7 }, (_, i) => format(startOfDay(subDays(now, 6 - i)), 'yyyy-MM-dd'));
  const countsByDay = new Map<string, number>(last7Keys.map((k) => [k, 0]));

  // 7 dias ANTERIORES a hoje (exclui hoje) — base do avg7dCurrentHour.
  const priorKeys = Array.from({ length: 7 }, (_, i) => format(startOfDay(subDays(now, i + 1)), 'yyyy-MM-dd'));
  const countsAtHourByPriorDay = new Map<string, number>(priorKeys.map((k) => [k, 0]));

  for (const b of buckets) {
    if (countsByDay.has(b.day)) countsByDay.set(b.day, (countsByDay.get(b.day) ?? 0) + b.message_count);

    if (b.day === todayKey) {
      if (b.hour <= currentHour) todayByHour[b.hour] = (todayByHour[b.hour] ?? 0) + b.message_count;
    } else if (countsAtHourByPriorDay.has(b.day) && b.hour === currentHour) {
      countsAtHourByPriorDay.set(b.day, (countsAtHourByPriorDay.get(b.day) ?? 0) + b.message_count);
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

// dashboard_hourly_volume (E22) ja esta em producao (DDL aplicada via MCP), mas o
// types.ts gerado ainda nao foi sincronizado com essa RPC (nao ha generate_typescript_types
// para este projeto self-hosted; so o workflow types-sync semanal). Cast local via
// 'unknown' (evita @typescript-eslint/no-explicit-any) ate a proxima sincronizacao.
type DashboardHourlyVolumeRpc = (
  fn: 'dashboard_hourly_volume',
  args: { p_days: number },
) => Promise<{ data: unknown; error: { message: string } | null }>;

export function useTodayHourlyVolume() {
  return useQuery({
    queryKey: ['today-hourly-volume'],
    queryFn: async () => {
      const rpc = supabase.rpc as unknown as DashboardHourlyVolumeRpc;
      const { data, error } = await rpc('dashboard_hourly_volume', { p_days: 8 });
      if (error) throw error;
      return aggregateHourlyVolume((data ?? []) as HourlyBucket[]);
    },
    staleTime: 120_000, // E28: volume tolera 120s (gráfico por hora, não precisa de segundo a segundo)
  });
}
