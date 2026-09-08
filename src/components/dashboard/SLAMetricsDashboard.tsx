import { useMemo, useState } from 'react';
import { Target, CheckCircle2, XCircle, TrendingUp, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useSLAMetrics, type PeriodFilter } from '@/hooks/sla/useSLAMetrics';
import { useSLAHistory } from '@/hooks/sla/useSLAHistory';
import { DashboardKpiCard, type KpiDelta } from './overview/DashboardKpiCard';
import { SLAAgentTable } from './sla/SLAAgentTable';
import { SLASummaryCard } from './sla/SLASummaryCard';
import { SLAConfigTable } from './sla/SLAConfigTable';
import { getSLARateTone, SLA_RATE_TEXT_CLASS } from './sla/slaRate';

const KPI_HELP: Record<string, string> = {
  'Taxa Geral SLA': 'Percentual de conversas cuja 1ª resposta ficou dentro do prazo definido no SLA aplicável.',
  'No Prazo': 'Quantidade de conversas cuja 1ª resposta foi enviada dentro do prazo de SLA.',
  'Violações': 'Quantidade de conversas cuja 1ª resposta ultrapassou o prazo de SLA.',
  'Total Conversas': 'Total de conversas com SLA aplicável no período selecionado.',
};

function trendToDelta(trend: { direction: 'up' | 'down' | 'stable'; percentage: number } | undefined, invert = false): KpiDelta {
  if (!trend || trend.direction === 'stable') return null;
  const positive = trend.direction === 'up';
  return { pct: Math.round(positive ? trend.percentage : -trend.percentage), invert, label: 'vs. semana anterior' };
}

function HelpIcon({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex text-muted-foreground/70 hover:text-foreground cursor-help"><Info className="w-3.5 h-3.5" /></span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[240px] text-[12px]">{text}</TooltipContent>
    </Tooltip>
  );
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

  const rateTone = getSLARateTone(overallRate);
  const rateLineColor = rateTone === 'success' ? 'green' : rateTone === 'warning' ? 'amber' : 'red';

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <DashboardKpiCard
            index={0} size="hero" chart="line"
            label="Taxa Geral SLA" labelAdornment={<HelpIcon text={KPI_HELP['Taxa Geral SLA']} />}
            value={loading ? '—' : `${overallRate}%`}
            valueClassName={loading ? undefined : SLA_RATE_TEXT_CLASS[rateTone]}
            delta={trendToDelta(history?.trends.overall)}
            tile="blue" icon={Target} bars={sparklines.rate} barsColor={rateLineColor}
          />
          <DashboardKpiCard
            index={1} size="hero" chart="line"
            label="No Prazo" labelAdornment={<HelpIcon text={KPI_HELP['No Prazo']} />}
            value={loading ? '—' : String(onTime)}
            valueClassName={loading ? undefined : 'text-dash-green'}
            delta={trendToDelta(history?.trends.overall)}
            tile="green" icon={CheckCircle2} bars={sparklines.onTime} barsColor="green"
          />
          <DashboardKpiCard
            index={2} size="hero" chart="line"
            label="Violações" labelAdornment={<HelpIcon text={KPI_HELP['Violações']} />}
            value={loading ? '—' : String(breached)}
            valueClassName={loading ? undefined : 'text-dash-red'}
            delta={trendToDelta(history?.trends.firstResponse, true)}
            tile="red" icon={XCircle} bars={sparklines.breached} barsColor="red"
          />
          <DashboardKpiCard
            index={3} size="hero" chart="line"
            label="Total Conversas" labelAdornment={<HelpIcon text={KPI_HELP['Total Conversas']} />}
            value={loading ? '—' : String(total)}
            delta={null}
            tile="blue" icon={TrendingUp} bars={sparklines.total} barsColor="blue"
          />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4">
          <SLAAgentTable agents={agents} />
          <div className="space-y-4">
            <SLASummaryCard
              periodFilter={period}
              onPeriodChange={setPeriod}
              overallRate={overallRate}
              onTime={onTime}
              breached={breached}
              overallTrend={history?.trends.overall}
              firstResponseTrend={history?.trends.firstResponse}
            />
            <SLAConfigTable />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
