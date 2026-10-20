import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, startOfWeek, startOfMonth } from 'date-fns';
import { fetchAllRows } from '@/lib/fetchAllRows';
import {
  firstResponseRatePctOrZero,
  tallyFirstResponse,
  type FirstResponseFields,
  type FirstResponseTally,
} from './slaFirstResponse';

export type PeriodFilter = 'today' | 'week' | 'month' | 'all';

interface SLAMetric {
  /** Conversas AVALIADAS (no prazo + violadas) — o denominador da taxa. */
  total: number;
  onTime: number;
  breached: number;
  /** Conversas ainda sem desfecho de 1ª resposta: não contam como "no prazo". */
  pending: number;
  /** Taxa sobre as avaliadas; sem nenhuma avaliada é 0 — nunca 100 (R2-SLA-001). */
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
    /** Conversas com SLA no período: avaliadas + pendentes. */
    totalConversations: number;
    /** `false` quando o período não tem nenhuma conversa avaliada (a taxa não existe). */
    hasSample: boolean;
    overallRate: number;
  };
  byAgent: AgentSLAMetric[];
}

/** Linhas de `conversation_sla` usadas no cálculo (o join traz o agente dono do contato). */
interface SLAMetricsRow extends FirstResponseFields {
  id: string;
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

/**
 * Métrica de 1ª resposta a partir do MESMO tally que o histórico usa (R2-SLA-001): o denominador é
 * sempre `no prazo + violadas` e a pendente não entra em nenhum dos dois lados da conta.
 */
function buildMetric(tally: FirstResponseTally): SLAMetric {
  return {
    total: tally.evaluated,
    onTime: tally.onTime,
    breached: tally.breached,
    pending: tally.pending,
    rate: firstResponseRatePctOrZero(tally),
  };
}

async function fetchSLAMetrics(period: PeriodFilter): Promise<SLADashboardData> {
  const start = getPeriodStart(period);
  const startIso = start ? start.toISOString() : null;

  const [slaRead, profilesResult] = await Promise.all([
    // Leitura paginada: sem `.range()` o PostgREST corta a consulta no teto de linhas do projeto
    // e o total do período passa a ser calculado sobre uma amostra.
    fetchAllRows<SLAMetricsRow>(
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

  // Overall — uma conta só, a mesma que o histórico usa (R2-SLA-001).
  const tallyOverall = tallyFirstResponse(slaData);
  const firstResponse = buildMetric(tallyOverall);
  const totalConversations = slaData.length;

  const overall = {
    firstResponse,
    totalConversations,
    hasSample: tallyOverall.evaluated > 0,
    overallRate: firstResponse.rate,
  };

  // By agent — mesmo critério, por agente.
  const rowsByAgent = new Map<string, SLAMetricsRow[]>();

  for (const sla of slaData) {
    const agentId = sla.contacts?.assigned_to;
    if (!agentId) continue;

    const rows = rowsByAgent.get(agentId);
    if (rows) rows.push(sla);
    else rowsByAgent.set(agentId, [sla]);
  }

  const byAgent: AgentSLAMetric[] = Array.from(rowsByAgent.entries())
    .map(([agentId, rows]) => {
      const profile = profiles.find(p => p.id === agentId);
      const fr = buildMetric(tallyFirstResponse(rows));
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
