import { useQuery } from '@tanstack/react-query';
import { subDays, subHours } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { aggregateScores } from '@/lib/ai-values';
import { classifySentiment, type SentimentClass } from '@/lib/sentiment-classes';

/**
 * DASH-CONTROLS-001 (ponto 1): "Análises Recentes" era um estado vazio fixo e
 * o select de período do card "Insights de IA" não alimentava query nenhuma.
 * Os dois cards agora leem `conversation_analyses` de verdade.
 */

export interface RecentAnalysis {
  id: string;
  contactName: string;
  sentiment: SentimentClass | null;
  sentimentScore: number | null;
  createdAt: string;
}

export function useRecentAnalyses(limit = 5) {
  return useQuery({
    queryKey: ['ai-recent-analyses', limit],
    queryFn: async (): Promise<RecentAnalysis[]> => {
      const { data, error } = await supabase
        .from('conversation_analyses')
        .select('id, sentiment, sentiment_score, created_at, contacts(name)')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        id: string; sentiment: string | null; sentiment_score: number | null; created_at: string;
        contacts: { name: string | null } | { name: string | null }[] | null;
      }>;
      return rows.map(r => ({
        id: r.id,
        contactName: (Array.isArray(r.contacts) ? r.contacts[0]?.name : r.contacts?.name) ?? 'Contato',
        sentiment: classifySentiment(r.sentiment),
        sentimentScore: r.sentiment_score,
        createdAt: r.created_at,
      }));
    },
    staleTime: 60_000,
  });
}

export type InsightPeriod = '24h' | '7d' | '30d';

const INSIGHT_SINCE: Record<InsightPeriod, () => Date> = {
  '24h': () => subHours(new Date(), 24),
  '7d': () => subDays(new Date(), 7),
  '30d': () => subDays(new Date(), 30),
};

export interface AIInsights {
  /** Total de análises no período — 0 mantém o empty state honesto. */
  total: number;
  /** % de análises classificadas como negativas; classifySentiment converte critico em negativo e exclui desconhecido. */
  negativePct: number;
  /** Departamento/fila com mais análises negativas, ou null. */
  topNegativeDepartment: string | null;
  /** Média de sentiment_score excluindo ausentes; null sem amostra válida. */
  avgSentimentScore: number | null;
}

export function useAIInsights(period: InsightPeriod) {
  return useQuery({
    queryKey: ['ai-insights', period],
    queryFn: async (): Promise<AIInsights> => {
      const { data, error } = await supabase
        .from('conversation_analyses')
        .select('sentiment, sentiment_score, department')
        .gte('created_at', INSIGHT_SINCE[period]().toISOString());
      if (error) throw error;
      const rows = data ?? [];

      let negative = 0;
      const negativeByDept = new Map<string, { neg: number; total: number }>();
      for (const r of rows) {
        const dept = r.department?.trim() || 'Sem fila';
        const e = negativeByDept.get(dept) ?? { neg: 0, total: 0 };
        e.total += 1;
        if (classifySentiment(r.sentiment) === 'negativo') {
          negative += 1;
          e.neg += 1;
        }
        negativeByDept.set(dept, e);
      }
      const topNegativeDepartment =
        [...negativeByDept.entries()].filter(([, v]) => v.neg > 0)
          .sort((a, b) => b[1].neg - a[1].neg)[0]?.[0] ?? null;

      return {
        total: rows.length,
        negativePct: rows.length ? Math.round((negative / rows.length) * 100) : 0,
        topNegativeDepartment,
        avgSentimentScore: aggregateScores(rows.map(r => r.sentiment_score)).average,
      };
    },
    staleTime: 60_000,
  });
}
