import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { aggregateScores } from '@/lib/ai-values';

export type PeriodOption = 7 | 14 | 30;

export interface TrendData {
  direction: 'up' | 'down' | 'stable';
  change: number;
  percentage: number;
}

export interface SentimentAlert {
  id: string;
  contactId: string | null;
  createdAt: string;
  contact_name?: string;
  sentiment_score?: number;
  consecutive_low?: number;
}

export interface AIStats {
  totalAnalyses: number;
  /** Média que exclui amostras ausentes; `null` quando não há nenhuma válida. */
  avgSentimentScore: number | null;
  positiveSentiment: number;
  negativeSentiment: number;
  neutralSentiment: number;
  transcriptionsCount: number;
  activeAlerts: SentimentAlert[];
  sentimentTrend: { date: string; score: number | null; positive: number; negative: number; neutral: number }[];
  trends: {
    analyses: TrendData;
    sentiment: TrendData;
    negative: TrendData;
    transcriptions: TrendData;
  };
}

export const calculateTrend = (current: number | null, previous: number | null): TrendData => {
  // Sem amostra válida de um dos lados não há variação a afirmar (IA-023):
  // estável/0 em vez de inventar um número para a média que não existe.
  if (current === null || previous === null) return { direction: 'stable', change: 0, percentage: 0 };
  if (previous === 0 && current === 0) return { direction: 'stable', change: 0, percentage: 0 };
  if (previous === 0) return { direction: 'up', change: current, percentage: 100 };
  const change = current - previous;
  const percentage = (change / previous) * 100;
  if (Math.abs(percentage) < 1) return { direction: 'stable', change: 0, percentage: 0 };
  return { direction: change > 0 ? 'up' : 'down', change, percentage };
};

export function useAIStats(selectedPeriod: PeriodOption) {
  return useQuery({
    queryKey: ['ai-stats-widget', selectedPeriod],
    queryFn: async (): Promise<AIStats> => {
      const now = new Date();
      const periodStart = subDays(now, selectedPeriod);
      const previousPeriodStart = subDays(now, selectedPeriod * 2);

      const { data: currentAnalyses, error } = await supabase
        .from('conversation_analyses')
        .select('sentiment, sentiment_score, created_at')
        .gte('created_at', periodStart.toISOString())
        .order('created_at', { ascending: true });
      if (error) throw error;

      const { data: previousAnalyses } = await supabase
        .from('conversation_analyses')
        .select('sentiment, sentiment_score, created_at')
        .gte('created_at', previousPeriodStart.toISOString())
        .lt('created_at', periodStart.toISOString());

      const totalAnalyses = currentAnalyses?.length || 0;
      // Média que EXCLUI ausente/inválido em vez de tratá-lo como 0 (IA-023):
      // sem nenhuma amostra válida devolve `null` (nunca 0 nem 50).
      const avgSentimentScore = aggregateScores((currentAnalyses || []).map(a => a.sentiment_score)).average;
      const positiveSentiment = currentAnalyses?.filter(a => a.sentiment === 'positive').length || 0;
      const negativeSentiment = currentAnalyses?.filter(a => a.sentiment === 'negative').length || 0;
      const neutralSentiment = currentAnalyses?.filter(a => a.sentiment === 'neutral').length || 0;

      const prevTotal = previousAnalyses?.length || 0;
      const prevAvgSentiment = aggregateScores((previousAnalyses || []).map(a => a.sentiment_score)).average;
      const prevNegative = previousAnalyses?.filter(a => a.sentiment === 'negative').length || 0;

      const trendMap = new Map<string, { scores: Array<number | null>; positive: number; negative: number; neutral: number }>();
      for (let i = selectedPeriod - 1; i >= 0; i--) {
        const date = format(subDays(new Date(), i), 'yyyy-MM-dd');
        trendMap.set(date, { scores: [], positive: 0, negative: 0, neutral: 0 });
      }
      currentAnalyses?.forEach(a => {
        const date = format(new Date(a.created_at), 'yyyy-MM-dd');
        const existing = trendMap.get(date) || { scores: [], positive: 0, negative: 0, neutral: 0 };
        existing.scores.push(a.sentiment_score);
        if (a.sentiment === 'positive') existing.positive++;
        else if (a.sentiment === 'negative') existing.negative++;
        else existing.neutral++;
        trendMap.set(date, existing);
      });

      const sentimentTrend = Array.from(trendMap.entries()).map(([date, data]) => ({
        date: format(new Date(date), 'dd/MM', { locale: ptBR }),
        // Dia sem amostra válida é `null` — não 50 (IA-023).
        score: aggregateScores(data.scores).average,
        positive: data.positive, negative: data.negative, neutral: data.neutral,
      }));

      const { count: currentTranscriptions } = await supabase
        .from('messages').select('*', { count: 'exact', head: true })
        .not('transcription', 'is', null).gte('created_at', periodStart.toISOString());

      const { count: prevTranscriptions } = await supabase
        .from('messages').select('*', { count: 'exact', head: true })
        .not('transcription', 'is', null)
        .gte('created_at', previousPeriodStart.toISOString()).lt('created_at', periodStart.toISOString());

      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: alertData } = await supabase
        .from('audit_logs').select('*').eq('action', 'sentiment_alert')
        .gte('created_at', last24h).order('created_at', { ascending: false }).limit(5);

      const activeAlerts: SentimentAlert[] = (alertData || []).map(log => ({
        id: log.id, contactId: log.entity_id, createdAt: log.created_at,
        ...((log.details || {}) as Record<string, unknown>),
      }));

      return {
        totalAnalyses,
        avgSentimentScore: avgSentimentScore === null ? null : Math.round(avgSentimentScore * 100) / 100,
        positiveSentiment, negativeSentiment, neutralSentiment,
        transcriptionsCount: currentTranscriptions || 0,
        activeAlerts, sentimentTrend,
        trends: {
          analyses: calculateTrend(totalAnalyses, prevTotal),
          sentiment: calculateTrend(avgSentimentScore, prevAvgSentiment),
          negative: calculateTrend(negativeSentiment, prevNegative),
          transcriptions: calculateTrend(currentTranscriptions || 0, prevTranscriptions || 0),
        },
      };
    },
    refetchInterval: 60000,
  });
}
