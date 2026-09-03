import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, subDays, startOfWeek, startOfMonth } from 'date-fns';

export type PeriodFilter = 'today' | 'week' | 'month' | 'all';

interface SLAMetric {
  total: number;
  onTime: number;
  breached: number;
  rate: number;
}

interface AgentSLAMetric {
  agentId: string;
  agentName: string;
  avatarUrl?: string;
  firstResponse: SLAMetric;
  overallRate: number;
}

export interface SLADashboardData {
  overall: {
    firstResponse: SLAMetric;
    totalConversations: number;
    overallRate: number;
  };
  byAgent: AgentSLAMetric[];
}

function getStartDate(period: PeriodFilter): Date {
  const now = new Date();
  switch (period) {
    case 'today': return startOfDay(now);
    case 'week': return startOfWeek(now, { weekStartsOn: 1 });
    case 'month': return startOfMonth(now);
    case 'all': return subDays(now, 365);
  }
}

function buildMetric(onTime: number, breached: number): SLAMetric {
  const total = onTime + breached;
  return { total, onTime, breached, rate: total > 0 ? (onTime / total) * 100 : 100 };
}

async function fetchSLAMetrics(period: PeriodFilter): Promise<SLADashboardData> {
  const startDate = getStartDate(period).toISOString();

  const [slaResult, profilesResult] = await Promise.all([
    supabase
      .from('conversation_sla')
      .select('*, contacts!inner(assigned_to)')
      .gte('created_at', startDate),
    supabase.from('profiles').select('id, name, avatar_url'),
  ]);

  if (slaResult.error) throw slaResult.error;
  if (profilesResult.error) throw profilesResult.error;

  const slaData = slaResult.data || [];
  const profiles = profilesResult.data || [];

  // Overall
  const frOnTime = slaData.filter(s => s.first_response_at && !s.first_response_breached).length;
  const frBreached = slaData.filter(s => s.first_response_breached).length;

  const firstResponse = buildMetric(frOnTime, frBreached);
  const totalConversations = slaData.length;

  const overall = {
    firstResponse,
    totalConversations,
    overallRate: firstResponse.rate,
  };

  // By agent
  const agentMap = new Map<string, { frOn: number; frBr: number }>();

  for (const sla of slaData) {
    const agentId = sla.contacts?.assigned_to;
    if (!agentId) continue;

    const stats = agentMap.get(agentId) || { frOn: 0, frBr: 0 };
    if (sla.first_response_at && !sla.first_response_breached) stats.frOn++;
    if (sla.first_response_breached) stats.frBr++;
    agentMap.set(agentId, stats);
  }

  const byAgent: AgentSLAMetric[] = Array.from(agentMap.entries())
    .map(([agentId, s]) => {
      const profile = profiles.find(p => p.id === agentId);
      const fr = buildMetric(s.frOn, s.frBr);
      return {
        agentId,
        agentName: profile?.name || 'Agente',
        avatarUrl: profile?.avatar_url || undefined,
        firstResponse: fr,
        overallRate: fr.rate,
      };
    })
    .sort((a, b) => b.overallRate - a.overallRate);

  return { overall, byAgent };
}

export const useSLAMetrics = (period: PeriodFilter = 'today') => {
  const { data = null, isLoading: loading } = useQuery({
    queryKey: ['sla-metrics', period],
    queryFn: () => fetchSLAMetrics(period),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  return { data, loading };
};
