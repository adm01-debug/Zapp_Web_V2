import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, startOfWeek, startOfMonth } from 'date-fns';
import { fetchAllRows } from '@/lib/fetchAllRows';

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

/** Linhas de `conversation_sla` usadas no cálculo (o join traz o agente dono do contato). */
interface SLARow {
  id: string;
  first_response_at: string | null;
  first_response_breached: boolean | null;
  contacts: { assigned_to: string | null } | null;
}

/** Tamanho de página da leitura (o teto do PostgREST por requisição é 1000). */
const SLA_PAGE_SIZE = 1000;

/**
 * Início do recorte de cada período do seletor ("Hoje", "Esta Semana", "Este Mês", "Todos").
 * `null` = sem limite inferior — é o que o rótulo "Todos" promete (R2-SLA-002); antes o recorte
 * parava em 365 dias e os registros mais antigos sumiam do total anunciado.
 */
export function getPeriodStart(period: PeriodFilter, now: Date = new Date()): Date | null {
  switch (period) {
    case 'today': return startOfDay(now);
    case 'week': return startOfWeek(now, { weekStartsOn: 1 });
    case 'month': return startOfMonth(now);
    case 'all': return null;
  }
}

function buildMetric(onTime: number, breached: number): SLAMetric {
  const total = onTime + breached;
  return { total, onTime, breached, rate: total > 0 ? (onTime / total) * 100 : 100 };
}

async function fetchSLAMetrics(period: PeriodFilter): Promise<SLADashboardData> {
  const start = getPeriodStart(period);
  const startIso = start ? start.toISOString() : null;

  const [slaRead, profilesResult] = await Promise.all([
    // Leitura paginada: sem `.range()` o PostgREST corta a consulta no teto de linhas do projeto
    // e o total do período passa a ser calculado sobre uma amostra.
    fetchAllRows<SLARow>(
      (from, to) => {
        const base = supabase
          .from('conversation_sla')
          .select('*, contacts!inner(assigned_to)');
        const scoped = startIso ? base.gte('created_at', startIso) : base;
        // Ordem por chave única (`id`): sem ordem determinística a leitura paginada pode
        // repetir ou pular linhas.
        return scoped.order('id', { ascending: true }).range(from, to);
      },
      { pageSize: SLA_PAGE_SIZE }
    ),
    supabase.from('profiles').select('id, name, avatar_url'),
  ]);

  if (slaRead.incomplete) {
    throw slaRead.error ?? new Error('Leitura de conversation_sla excedeu o teto de paginação');
  }
  if (profilesResult.error) throw profilesResult.error;

  const slaData = slaRead.rows;
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
