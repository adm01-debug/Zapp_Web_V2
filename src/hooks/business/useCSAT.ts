import { useMemo } from 'react';
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
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
      case 'week': {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return weekAgo;
      }
      case 'month': {
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return monthAgo;
      }
    }
  };

  const surveysQuery = useQuery({
    queryKey: ['csat-surveys', period],
    queryFn: async () => {
      const now = new Date();
      const currentStart = getDateFilter();
      // Mesma duracao da janela atual, imediatamente antes dela: e a base
      // honesta da tendencia. Sem isso o `trend` do card era um 0 cravado.
      const previousStart = new Date(currentStart.getTime() - (now.getTime() - currentStart.getTime()));

      // Leitura paginada (keyset). O teto de linhas do PostgREST cortaria a
      // consulta e o card mostraria media/total sobre uma amostra silenciosa.
      const rows = await fetchSurveysKeyset<CSATSurvey>('*', previousStart);

      const currentStartMs = currentStart.getTime();
      return {
        current: rows.filter((r) => new Date(r.created_at).getTime() >= currentStartMs),
        previous: rows.filter((r) => new Date(r.created_at).getTime() < currentStartMs),
      };
    },
  });

  // R2-MOD-028: stats e DERIVADO do resultado atual de surveys (mesma fonte de
  // verdade), nao uma query separada. Antes, stats era uma query com key estavel
  // por periodo cujo queryFn lia surveysQuery.data: na invalidacao pos-submissao
  // as duas queries refaziam juntas e stats podia recalcular sobre o array antigo,
  // permanecendo no snapshot anterior depois de surveys ja trazer as avaliacoes
  // novas (a key de stats nao mudava, entao nao havia novo recalculo). Derivando,
  // media/total/distribuicao mudam sempre junto com a lista.
  // Fatia estavel do resultado (mesma referencia entre renders): o React
  // Compiler exige que as dependencias do useMemo batam com as expressoes lidas
  // no corpo, por isso derivamos antes em vez de ler `surveysQuery.data` no deps.
  const currentSurveys = surveysQuery.data?.current;
  const previousSurveys = surveysQuery.data?.previous;

  const stats = useMemo<CSATStats>(() => {
    const surveys = currentSurveys || [];
    const previous = previousSurveys || [];
    if (surveys.length === 0) {
      return { average: 0, total: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, trend: 0 };
    }

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;
    surveys.forEach(s => {
      distribution[s.rating] = (distribution[s.rating] || 0) + 1;
      sum += s.rating;
    });
    const average = sum / surveys.length;

    // Tendencia real: variacao percentual da media contra a janela anterior de
    // mesma duracao. Sem base anterior nao ha variacao a afirmar -> 0 (nunca um
    // numero inventado).
    let trend = 0;
    if (previousSurveys.length > 0) {
      const previousAverage = previousSurveys.reduce((acc, s) => acc + s.rating, 0) / previousSurveys.length;
      if (previousAverage !== 0) trend = Math.round(((average - previousAverage) / previousAverage) * 100);
    }

    return {
      average,
      total: surveys.length,
      distribution,
      trend,
    };
  }, [currentSurveys, previousSurveys]);

  const submitSurvey = useMutation<void, Error, { contact_id: string; agent_id?: string; rating: number; feedback?: string }>({
    mutationFn: async (data) => {
      const { error } = await supabase.from('csat_surveys').insert({
        contact_id: data.contact_id,
        // agent_id is nullable in DB but Supabase generated type wrongly marks it as required
        agent_id: (data.agent_id ?? null) as unknown as string,
        rating: data.rating,
        feedback: data.feedback || null,
        conversation_resolved_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['csat-surveys'] });
      toast({ title: 'Avaliação enviada!', description: 'Obrigado pelo feedback.' });
    },
    onError: () => {
      toast({ title: 'Erro ao enviar avaliação', variant: 'destructive' });
    },
  });

  return {
    surveys: currentSurveys || [],
    stats,
    isLoading: surveysQuery.isLoading,
    // Erro exposto de proposito: sem isso a tela so via `total: 0` e anunciava
    // "Sem avaliacoes no periodo" para uma falha de leitura (erro virava zero).
    error: surveysQuery.error,
    isError: surveysQuery.isError,
    refetch: surveysQuery.refetch,
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
  id: string;
  agent_id: string | null;
  rating: number;
  created_at: string;
  agent: { name: string } | null;
  contact: { queue_id: string | null } | null;
}

const CSAT_PAGE_SIZE = 1000;
const CSAT_MAX_PAGES = 50;

/**
 * PostgREST corta a resposta no teto de linhas do projeto (db-max-rows). Sem
 * paginar, uma janela com mais linhas que o teto devolveria apenas as mais
 * antigas e a tela perderia silenciosamente as recentes.
 *
 * Paginacao keyset por (created_at, id): offset com .range() dependeria de o
 * teto do servidor ser exatamente CSAT_PAGE_SIZE e, sem desempate estavel,
 * repetiria ou pularia linhas quando varias linhas compartilham o mesmo
 * created_at. O cursor avanca pela ultima linha lida e o loop para quando a
 * pagina volta vazia, qualquer que seja o teto real.
 */
async function fetchSurveysKeyset<T extends { id: string; created_at: string }>(
  select: string,
  start: Date
): Promise<T[]> {
  const rows: T[] = [];
  let cursor: { createdAt: string; id: string } | null = null;

  // <= e nao <: com exatamente CSAT_MAX_PAGES paginas cheias, a iteracao extra
  // volta vazia e retorna normalmente. Com < , esse caso exato cairia no throw
  // sem existir pagina seguinte.
  for (let page = 0; page <= CSAT_MAX_PAGES; page++) {
    let query = supabase
      .from('csat_surveys')
      .select(select)
      .gte('created_at', start.toISOString())
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(CSAT_PAGE_SIZE);

    if (cursor) {
      // Aspas obrigatorias: o timestamptz serializado carrega ':' e '+', que o
      // parser de filtro do PostgREST trataria como separadores.
      const ts = `"${cursor.createdAt}"`;
      query = query.or(`created_at.gt.${ts},and(created_at.eq.${ts},id.gt.${cursor.id})`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const batch = (data || []) as unknown as T[];
    if (batch.length === 0) return rows;

    rows.push(...batch);
    const last = batch[batch.length - 1];
    cursor = { createdAt: last.created_at, id: last.id };
  }

  // Devolver o que deu tempo de ler seria a mesma perda silenciosa que esta
  // funcao existe para evitar: o erro sobe e o card mostra estado de falha.
  throw new Error(`[useCSAT] paginacao excedeu ${CSAT_MAX_PAGES} paginas (${rows.length} linhas)`);
}

const CSAT_BREAKDOWN_SELECT =
  'id, agent_id, rating, created_at, agent:profiles!csat_surveys_agent_id_fkey(name), contact:contacts!csat_surveys_contact_id_fkey(queue_id)';

function fetchSurveysSince(start: Date): Promise<CSATBreakdownRow[]> {
  return fetchSurveysKeyset<CSATBreakdownRow>(CSAT_BREAKDOWN_SELECT, start);
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
      // Janela = os ultimos `periodDays` dias de calendario local, incluindo hoje.
      // Ancorar no inicio do dia local mantem headline, distribuicao e timeline
      // cobrindo exatamente o mesmo intervalo -- antes o dia mais antigo entrava
      // nas metricas mas nao aparecia na Evolucao.
      const now = new Date();
      const currentStart = new Date(now);
      currentStart.setDate(currentStart.getDate() - (periodDays - 1));
      currentStart.setHours(0, 0, 0, 0);
      const previousStart = new Date(currentStart);
      previousStart.setDate(previousStart.getDate() - periodDays);

      const [surveys, { data: queues, error: queuesError }] = await Promise.all([
        fetchSurveysSince(previousStart),
        supabase.from('queues').select('id, name'),
      ]);

      if (queuesError) throw queuesError;

      const queueNameById = new Map((queues || []).map((q) => [q.id, q.name]));
      const rows = surveys;

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

        const day = format(new Date(r.created_at), 'yyyy-MM-dd');
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
        const key = format(d, 'yyyy-MM-dd');
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
