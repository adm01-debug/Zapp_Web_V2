import { useMemo, useState } from 'react';
import { Target, CheckCircle2, XCircle, TrendingUp, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useSLAMetrics, type PeriodFilter } from '@/hooks/sla/useSLAMetrics';
import { useSLAHistory } from '@/hooks/sla/useSLAHistory';
import { DashboardKpiCard, type KpiDelta } from './overview/DashboardKpiCard';
import { SLAAgentTable } from './sla/SLAAgentTable';
import { SLASummaryCard } from './sla/SLASummaryCard';
import { SLAConfigTable } from './sla/SLAConfigTable';

const KPI_HELP: Record<string, string> = {
  'Taxa Geral SLA': 'Percentual de conversas cuja 1ª resposta ficou dentro do prazo definido no SLA aplicável.',
  'No Prazo': 'Quantidade de conversas cuja 1ª resposta foi enviada dentro do prazo de SLA.',
  'Violações': 'Quantidade de conversas cuja 1ª resposta ultrapassou o prazo de SLA.',
  'Total Conversas': 'Total de conversas com SLA aplicável no período selecionado.',
};

function trendToDelta(trend: { direction: 'up' | 'down' | 'stable'; percentage: number } | undefined, invert = false): KpiDelta {
  if (!trend || trend.direction === 'stable') return null;
  const positive = trend.direction === 'up';
  return { pct: Math.round(positive ? trend.percentage : -trend.percentage), invert, label: 'vs. período anterior' };
}

export function SLAMetricsDashboard() {
  const [period, setPeriod] = useState<PeriodFilter>('week');
  const { data, loading } = useSLAMetrics(period);
  const { data: history } = useSLAHistory('30d');

  const overallRate = Math.round(data?.overall.overallRate ?? 100);
  const onTime = data?.overall.firstResponse.onTime ?? 0;
  const breached = data?.overall.firstResponse.breached ?? 0;
  const total = data?.overall.totalConversations ?? 0;
  const agents = data?.byAgent ?? [];

  const sparklines = useMemo(() => {
    const days = history?.dailyData ?? [];
    if (days.length < 2) return { rate: null, onTime: null, breached: null, total: null };
    return {
      rate: days.map((d) => Math.round(d.slaRate)),
      onTime: days.map((d) => Math.max(d.totalConversations - d.totalBreaches, 0)),
      breached: days.map((d) => d.totalBreaches),
      total: days.map((d) => d.totalConversations),
    };
  }, [history]);

  const kpis = [
    { label: 'Taxa Geral SLA', value: loading ? '—' : `${overallRate}%`, tile: 'blue' as const, icon: Target, bars: sparklines.rate, barsColor: 'blue' as const, delta: trendToDelta(history?.trends.overall) },
    { label: 'No Prazo', value: loading ? '—' : String(onTime), tile: 'green' as const, icon: CheckCircle2, bars: sparklines.onTime, barsColor: 'green' as const, delta: null },
    { label: 'Violações', value: loading ? '—' : String(breached), tile: 'red' as const, icon: XCircle, bars: sparklines.breached, barsColor: 'red' as const, delta: trendToDelta(history?.trends.firstResponse, true) },
    { label: 'Total Conversas', value: loading ? '—' : String(total), tile: 'blue' as const, icon: TrendingUp, bars: sparklines.total, barsColor: 'blue' as const, delta: null },
  ];

  return (
    <TooltipProvider>
      <div className="space-y-2.5">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
          {kpis.map((k, i) => (
            <DashboardKpiCard
              key={k.label}
              index={i}
              label={k.label}
              value={k.value}
              delta={k.delta}
              tile={k.tile}
              icon={k.icon}
              bars={k.bars}
              barsColor={k.barsColor}
              chart="line"
              footer={(
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground cursor-help">
                      <Info className="w-3 h-3" /> sobre esta métrica
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[220px] text-[12px]">{KPI_HELP[k.label]}</TooltipContent>
                </Tooltip>
              )}
            />
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-2.5">
          <SLAAgentTable agents={agents} />
          <div className="space-y-2.5">
            <SLASummaryCard
              periodFilter={period}
              onPeriodChange={setPeriod}
              overallRate={overallRate}
              onTime={onTime}
              breached={breached}
              overallTrend={history?.trends.overall}
            />
            <SLAConfigTable />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
