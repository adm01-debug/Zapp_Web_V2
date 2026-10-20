import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, subDays, format, eachDayOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export type HistoryPeriod = '7d' | '14d' | '30d' | '90d';

interface DailyViolation {
  date: string;
  dateLabel: string;
  firstResponseBreaches: number;
  totalBreaches: number;
  totalConversations: number;
  slaRate: number;
}

interface ViolationTrend {
  direction: 'up' | 'down' | 'stable';
  percentage: number;
}

interface SLAHistoryData {
  dailyData: DailyViolation[];
  totals: {
    firstResponseBreaches: number;
    totalBreaches: number;
    totalConversations: number;
    overallSLARate: number;
  };
  trends: {
    firstResponse: ViolationTrend;
    overall: ViolationTrend;
  };
  worstDays: DailyViolation[];
  bestDays: DailyViolation[];
}

const PERIOD_DAYS: Record<HistoryPeriod, number> = {
  '7d': 7, '14d': 14, '30d': 30, '90d': 90,
};

function calcTrend(
  firstHalf: DailyViolation[],
  secondHalf: DailyViolation[],
  getVal: (d: DailyViolation) => number
): ViolationTrend {
  const firstAvg = firstHalf.reduce((s, d) => s + getVal(d), 0) / (firstHalf.length || 1);
  const secondAvg = secondHalf.reduce((s, d) => s + getVal(d), 0) / (secondHalf.length || 1);

  if (firstAvg === 0 && secondAvg === 0) return { direction: 'stable', percentage: 0 };
  if (firstAvg === 0) return { direction: 'up', percentage: 100 };

  const change = ((secondAvg - firstAvg) / firstAvg) * 100;
  return {
    direction: change > 5 ? 'up' : change < -5 ? 'down' : 'stable',
    percentage: Math.abs(change),
  };
}

async function fetchSLAHistory(period: HistoryPeriod): Promise<SLAHistoryData> {
  const days = PERIOD_DAYS[period];
  const startDate = startOfDay(subDays(new Date(), days));

  const { data: slaRecords, error } = await supabase
    .from('conversation_sla')
    .select('*')
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: true });

  if (error) throw error;

  const allDays = eachDayOfInterval({ start: startDate, end: new Date() });
  const dailyMap = new Map<string, DailyViolation>();

  allDays.forEach(day => {
    const dateKey = format(day, 'yyyy-MM-dd');
    dailyMap.set(dateKey, {
      date: dateKey,
      dateLabel: format(day, 'dd MMM', { locale: ptBR }),
      firstResponseBreaches: 0,
      totalBreaches: 0,
      totalConversations: 0,
      slaRate: 100,
    });
  });

  slaRecords?.forEach(record => {
    const dateKey = format(new Date(record.created_at), 'yyyy-MM-dd');
    const dayData = dailyMap.get(dateKey);
    if (dayData) {
      dayData.totalConversations++;
      if (record.first_response_breached) { dayData.firstResponseBreaches++; dayData.totalBreaches++; }
    }
  });

  dailyMap.forEach(day => {
    if (day.totalConversations > 0) {
      day.slaRate = ((day.totalConversations - day.totalBreaches) / day.totalConversations) * 100;
    }
  });

  const dailyData = Array.from(dailyMap.values());

  const totals = dailyData.reduce(
    (acc, day) => ({
      firstResponseBreaches: acc.firstResponseBreaches + day.firstResponseBreaches,
      totalBreaches: acc.totalBreaches + day.totalBreaches,
      totalConversations: acc.totalConversations + day.totalConversations,
      overallSLARate: 0,
    }),
    { firstResponseBreaches: 0, totalBreaches: 0, totalConversations: 0, overallSLARate: 0 }
  );

  totals.overallSLARate = totals.totalConversations > 0
    ? ((totals.totalConversations - totals.totalBreaches) / totals.totalConversations) * 100
    : 100;

  const midpoint = Math.floor(dailyData.length / 2);
  const firstHalf = dailyData.slice(0, midpoint);
  const secondHalf = dailyData.slice(midpoint);

  const trends = {
    firstResponse: calcTrend(firstHalf, secondHalf, d => d.firstResponseBreaches),
    overall: calcTrend(firstHalf, secondHalf, d => d.slaRate),
  };

  const daysWithConversations = dailyData.filter(d => d.totalConversations > 0);
  const worstDays = [...daysWithConversations].sort((a, b) => a.slaRate - b.slaRate).slice(0, 5);
  const bestDays = [...daysWithConversations].sort((a, b) => b.slaRate - a.slaRate).slice(0, 5);

  return { dailyData, totals, trends, worstDays, bestDays };
}

export const useSLAHistory = (period: HistoryPeriod = '30d') => {
  const { data = null, isLoading: loading } = useQuery({
    queryKey: ['sla-history', period],
    queryFn: () => fetchSLAHistory(period),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  return { data, loading };
};
