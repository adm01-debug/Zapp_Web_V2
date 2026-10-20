import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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
  avgSentimentScore: number;
  positiveSentiment: number;
  negativeSentiment: number;
  neutralSentiment: number;
  transcriptionsCount: number;
  activeAlerts: SentimentAlert[];
  sentimentTrend: { date: string; score: number; positive: number; negative: number; neutral: number }[];
  trends: {
    analyses: TrendData;
    sentiment: TrendData;
    negative: TrendData;
    transcriptions: TrendData;
  };
}

export const calculateTrend = (current: number, previous: number): TrendData => {
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
      const avgSentimentScore = currentAnalyses?.reduce((acc, a) => acc + (a.sentiment_score || 0), 0) / (totalAnalyses || 1);
      const positiveSentiment = currentAnalyses?.filter(a => a.sentiment === 'positive').length || 0;
      const negativeSentiment = currentAnalyses?.filter(a => a.sentiment === 'negative').length || 0;
      const neutralSentiment = currentAnalyses?.filter(a => a.sentiment === 'neutral').length || 0;

      const prevTotal = previousAnalyses?.length || 0;
      const prevAvgSentiment = (previousAnalyses?.reduce((acc, a) => acc + (a.sentiment_score || 0), 0) ?? 0) / (prevTotal || 1);
      const prevNegative = previousAnalyses?.filter(a => a.sentiment === 'negative').length || 0;

      const trendMap = new Map<string, { scores: number[]; positive: number; negative: number; neutral: number }>();
      for (let i = selectedPeriod - 1; i >= 0; i--) {
        const date = format(subDays(new Date(), i), 'yyyy-MM-dd');
        trendMap.set(date, { scores: [], positive: 0, negative: 0, neutral: 0 });
      }
      currentAnalyses?.forEach(a => {
        const date = format(new Date(a.created_at), 'yyyy-MM-dd');
        const existing = trendMap.get(date) || { scores: [], positive: 0, negative: 0, neutral: 0 };
        existing.scores.push(a.sentiment_score || 50);
        if (a.sentiment === 'positive') existing.positive++;
        else if (a.sentiment === 'negative') existing.negative++;
        else existing.neutral++;
        trendMap.set(date, existing);
      });

      const sentimentTrend = Array.from(trendMap.entries()).map(([date, data]) => ({
        date: format(new Date(date), 'dd/MM', { locale: ptBR }),
        score: data.scores.length > 0 ? Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length) : 50,
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
        avgSentimentScore: Math.round(avgSentimentScore * 100) / 100,
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
