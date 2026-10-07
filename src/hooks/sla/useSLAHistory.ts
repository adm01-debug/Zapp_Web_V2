import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, subDays, format, eachDayOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { fetchAllRows } from '@/lib/fetchAllRows';

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

/** Tamanho de página da leitura (o teto do PostgREST por requisição é 1000). */
const HISTORY_PAGE_SIZE = 1000;

/** Linhas de `conversation_sla` usadas no histórico (só o que o recorte diário lê). */
interface SLAHistoryRow {
  id: string;
  created_at: string;
  first_response_breached: boolean | null;
}

/**
 * Primeiro dia civil da janela do rótulo: "7 dias" são hoje + 6 anteriores (7 datas civis).
 * Antes o recorte partia de `subDays(now, days)`, então o gráfico e o total iam até o 8º dia
 * (R2-SLA-002 — "a janela histórica contém um dia extra").
 */
export function historyWindowStart(period: HistoryPeriod, now: Date = new Date()): Date {
  return startOfDay(subDays(now, PERIOD_DAYS[period] - 1));
}

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
  const startDate = historyWindowStart(period);

  // Leitura paginada: sem `.range()` o PostgREST devolve só a primeira página e o total do
  // período fica subcontado em silêncio. A ordem por chave única (`id`) mantém a paginação
  // estável (a de `created_at` sozinha não é única).
  const read = await fetchAllRows<SLAHistoryRow>(
    (from, to) =>
      supabase
        .from('conversation_sla')
        .select('id, created_at, first_response_breached')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    { pageSize: HISTORY_PAGE_SIZE }
  );

  if (read.incomplete) {
    throw read.error ?? new Error('Leitura de conversation_sla excedeu o teto de paginação');
  }

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

  read.rows.forEach(record => {
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
