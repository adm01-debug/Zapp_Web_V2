import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/ui/use-toast';

export interface CSATSurvey {
  id: string;
  contact_id: string;
  agent_id: string | null;
  rating: number;
  feedback: string | null;
  conversation_resolved_at: string | null;
  created_at: string;
}

export interface CSATStats {
  average: number;
  total: number;
  distribution: Record<number, number>;
  trend: number; // percentage change vs previous period
}

export function useCSAT(period: 'today' | 'week' | 'month' = 'month') {
  const queryClient = useQueryClient();

  const getDateFilter = () => {
    const now = new Date();
    switch (period) {
      case 'today':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      case 'week':
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return weekAgo.toISOString();
      case 'month':
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return monthAgo.toISOString();
    }
  };

  const surveysQuery = useQuery({
    queryKey: ['csat-surveys', period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('csat_surveys')
        .select('*')
        .gte('created_at', getDateFilter())
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as CSATSurvey[];
    },
  });

  const statsQuery = useQuery({
    queryKey: ['csat-stats', period],
    queryFn: async () => {
      const surveys = surveysQuery.data || [];
      if (surveys.length === 0) {
        return { average: 0, total: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, trend: 0 } as CSATStats;
      }

      const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      let sum = 0;
      surveys.forEach(s => {
        distribution[s.rating] = (distribution[s.rating] || 0) + 1;
        sum += s.rating;
      });

      return {
        average: sum / surveys.length,
        total: surveys.length,
        distribution,
        trend: 0,
      } as CSATStats;
    },
    enabled: !!surveysQuery.data,
  });

  const submitSurvey = useMutation({
    mutationFn: async (data: { contact_id: string; agent_id?: string; rating: number; feedback?: string }) => {
      const { error } = await supabase.from('csat_surveys').insert({
        contact_id: data.contact_id,
        agent_id: data.agent_id || null,
        rating: data.rating,
        feedback: data.feedback || null,
        conversation_resolved_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['csat-surveys'] });
      queryClient.invalidateQueries({ queryKey: ['csat-stats'] });
      toast({ title: 'Avaliação enviada!', description: 'Obrigado pelo feedback.' });
    },
    onError: () => {
      toast({ title: 'Erro ao enviar avaliação', variant: 'destructive' });
    },
  });

  return {
    surveys: surveysQuery.data || [],
    stats: statsQuery.data,
    isLoading: surveysQuery.isLoading,
    submitSurvey,
  };
}

// --- Satisfaction dashboard breakdown (real data for src/components/dashboard/SatisfactionMetrics.tsx) ---

export interface CSATAgentBreakdown {
  agentId: string;
  agentName: string;
  csatPercent: number;
  responses: number;
}

export interface CSATQueueBreakdown {
  queueId: string;
  queueName: string;
  csatPercent: number;
  responses: number;
}

export interface CSATTimelinePoint {
  date: string;
  csatPercent: number | null;
  responses: number;
}

export interface SatisfactionBreakdown {
  totalResponses: number;
  /** % of responses with rating >= 4 (industry-standard CSAT calculation). null = no responses in period. */
  csatPercent: number | null;
  previousCsatPercent: number | null;
  trend: 'up' | 'down' | 'stable' | null;
  /** Percentage-point delta vs the immediately preceding period of the same length. */
  trendValue: number;
  distribution: { rating: number; count: number }[];
  byAgent: CSATAgentBreakdown[];
  byQueue: CSATQueueBreakdown[];
  timeline: CSATTimelinePoint[];
}

interface CSATBreakdownRow {
  agent_id: string | null;
  rating: number;
  created_at: string;
  agent: { name: string } | null;
  contact: { queue_id: string | null } | null;
}

function csatPercentFromRatings(ratings: number[]): number {
  return (ratings.filter((r) => r >= 4).length / ratings.length) * 100;
}

/**
 * Aggregates csat_surveys (joined with the responding agent's profile and the
 * contact's queue) into the breakdown shape the satisfaction dashboard needs:
 * overall CSAT %, trend vs previous period, rating distribution, per-agent and
 * per-queue CSAT, and a daily timeline. All derived from real rows — no mocked
 * values. Periods with zero surveys surface as `null`/empty arrays so the UI
 * can render an honest empty state instead of fabricated numbers.
 */
export function useSatisfactionBreakdown(periodDays: 7 | 30 | 90 = 30) {
  return useQuery({
    queryKey: ['csat-breakdown', periodDays],
    queryFn: async (): Promise<SatisfactionBreakdown> => {
      const now = new Date();
      const currentStart = new Date(now);
      currentStart.setDate(currentStart.getDate() - periodDays);
      const previousStart = new Date(currentStart);
      previousStart.setDate(previousStart.getDate() - periodDays);

      const [{ data: surveys, error: surveysError }, { data: queues, error: queuesError }] = await Promise.all([
        supabase
          .from('csat_surveys')
          .select(
            'agent_id, rating, created_at, agent:profiles!csat_surveys_agent_id_fkey(name), contact:contacts!csat_surveys_contact_id_fkey(queue_id)'
          )
          .gte('created_at', previousStart.toISOString())
          .order('created_at', { ascending: true }),
        supabase.from('queues').select('id, name'),
      ]);

      if (surveysError) throw surveysError;
      if (queuesError) throw queuesError;

      const queueNameById = new Map((queues || []).map((q) => [q.id, q.name]));
      const rows = (surveys || []) as unknown as CSATBreakdownRow[];

      const currentStartMs = currentStart.getTime();
      const currentRows = rows.filter((r) => new Date(r.created_at).getTime() >= currentStartMs);
      const previousRows = rows.filter((r) => new Date(r.created_at).getTime() < currentStartMs);

      const csatPercent = currentRows.length > 0 ? csatPercentFromRatings(currentRows.map((r) => r.rating)) : null;
      const previousCsatPercent =
        previousRows.length > 0 ? csatPercentFromRatings(previousRows.map((r) => r.rating)) : null;

      let trend: SatisfactionBreakdown['trend'] = null;
      let trendValue = 0;
      if (csatPercent !== null && previousCsatPercent !== null) {
        trendValue = Math.round(csatPercent - previousCsatPercent);
        trend = trendValue > 0 ? 'up' : trendValue < 0 ? 'down' : 'stable';
      }

      const distribution = [5, 4, 3, 2, 1].map((rating) => ({
        rating,
        count: currentRows.filter((r) => r.rating === rating).length,
      }));

      const agentMap = new Map<string, { agentName: string; ratings: number[] }>();
      const queueMap = new Map<string, { queueName: string; ratings: number[] }>();
      const dayMap = new Map<string, number[]>();

      for (const r of currentRows) {
        if (r.agent_id) {
          const entry = agentMap.get(r.agent_id) || { agentName: r.agent?.name || 'Agente removido', ratings: [] };
          entry.ratings.push(r.rating);
          agentMap.set(r.agent_id, entry);
        }

        const queueId = r.contact?.queue_id;
        if (queueId) {
          const entry = queueMap.get(queueId) || {
            queueName: queueNameById.get(queueId) || 'Fila removida',
            ratings: [],
          };
          entry.ratings.push(r.rating);
          queueMap.set(queueId, entry);
        }

        const day = r.created_at.slice(0, 10);
        const dayRatings = dayMap.get(day) || [];
        dayRatings.push(r.rating);
        dayMap.set(day, dayRatings);
      }

      const byAgent: CSATAgentBreakdown[] = Array.from(agentMap.entries())
        .map(([agentId, v]) => ({
          agentId,
          agentName: v.agentName,
          csatPercent: csatPercentFromRatings(v.ratings),
          responses: v.ratings.length,
        }))
        .sort((a, b) => b.csatPercent - a.csatPercent);

      const byQueue: CSATQueueBreakdown[] = Array.from(queueMap.entries())
        .map(([queueId, v]) => ({
          queueId,
          queueName: v.queueName,
          csatPercent: csatPercentFromRatings(v.ratings),
          responses: v.ratings.length,
        }))
        .sort((a, b) => b.csatPercent - a.csatPercent);

      const timeline: CSATTimelinePoint[] = [];
      for (let i = periodDays - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const dayRatings = dayMap.get(key) || [];
        timeline.push({
          date: format(d, 'dd/MM'),
          csatPercent: dayRatings.length > 0 ? csatPercentFromRatings(dayRatings) : null,
          responses: dayRatings.length,
        });
      }

      return {
        totalResponses: currentRows.length,
        csatPercent,
        previousCsatPercent,
        trend,
        trendValue,
        distribution,
        byAgent,
        byQueue,
        timeline,
      };
    },
  });
}
