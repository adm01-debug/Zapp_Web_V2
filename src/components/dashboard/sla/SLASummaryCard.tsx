import { Target, CheckCircle2, XCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { DashboardCard, SectionHeader, CardSelect } from '../overview/DashboardCard';
import type { PeriodFilter } from '@/hooks/sla/useSLAMetrics';
import { getSLARateTone, SLA_RATE_TEXT_CLASS, SLA_RATE_BG_CLASS } from './slaRate';
import { cn } from '@/lib/utils';

const PERIOD_OPTIONS = [
  { value: 'today', label: 'Hoje' },
  { value: 'week', label: 'Esta Semana' },
  { value: 'month', label: 'Este Mês' },
  { value: 'all', label: 'Todo Período' },
];

interface TrendInfo {
  direction: 'up' | 'down' | 'stable';
  percentage: number;
}

interface SLASummaryCardProps {
  periodFilter: PeriodFilter;
  onPeriodChange: (v: PeriodFilter) => void;
  overallRate: number;
  onTime: number;
  breached: number;
  overallTrend?: TrendInfo;
  firstResponseTrend?: TrendInfo;
}

function TrendLine({ trend, invert, compact }: { trend?: TrendInfo; invert?: boolean; compact?: boolean }) {
  if (!trend || trend.direction === 'stable') {
    return compact ? null : <p className="text-[12px] text-muted-foreground mt-2">sem variação no período anterior</p>;
  }
  const positive = trend.direction === 'up';
  const good = invert ? !positive : positive;
  const Arrow = positive ? TrendingUp : TrendingDown;
  return (
    <p className={cn('flex items-center gap-1 font-semibold', compact ? 'text-[12px]' : 'text-[13px] mt-2', good ? 'text-dash-green' : 'text-dash-red')}>
      <Arrow className="w-3.5 h-3.5" />
      {positive ? '+' : '-'}{Math.round(trend.percentage)}%
      {!compact && <span className="text-muted-foreground font-normal">vs. semana anterior</span>}
    </p>
  );
}

export function SLASummaryCard({ periodFilter, onPeriodChange, overallRate, onTime, breached, overallTrend, firstResponseTrend }: SLASummaryCardProps) {
  const tone = getSLARateTone(overallRate);

  return (
    <DashboardCard testid="sla-summary-card" variant="comfortable">
      <SectionHeader
        icon={Target}
        title="Resumo Geral"
        subtitle="Visão consolidada das métricas de SLA do período."
        tileSize={44}
        size="lg"
        right={<CardSelect value={periodFilter} onValueChange={(v) => onPeriodChange(v as PeriodFilter)} options={PERIOD_OPTIONS} testid="sla-summary-period" />}
      />
      <div className="p-4 rounded-xl bg-muted/20 border border-border/50">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[14px] font-medium text-foreground">Taxa de 1ª Resposta no Prazo</span>
          <span className={cn('text-[24px] font-bold tabular-nums leading-none', SLA_RATE_TEXT_CLASS[tone])}>{Math.round(overallRate)}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
          <div className={cn('h-full rounded-full', SLA_RATE_BG_CLASS[tone])} style={{ width: `${Math.min(overallRate, 100)}%` }} />
        </div>
        <TrendLine trend={overallTrend} />
      </div>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <div className="p-3.5 rounded-xl bg-muted/20 border border-border/50 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-dash-tile-green flex items-center justify-center shrink-0"><CheckCircle2 className="w-5 h-5 text-white" /></div>
          <div className="min-w-0">
            <p className="text-[12px] text-muted-foreground">Respostas no Prazo</p>
            <div className="flex items-baseline gap-2">
              <p className="text-[22px] font-bold text-foreground tabular-nums leading-none">{onTime}</p>
              <TrendLine trend={firstResponseTrend} compact />
            </div>
          </div>
        </div>
        <div className="p-3.5 rounded-xl bg-muted/20 border border-border/50 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-dash-tile-red flex items-center justify-center shrink-0"><XCircle className="w-5 h-5 text-white" /></div>
          <div className="min-w-0">
            <p className="text-[12px] text-muted-foreground">Respostas com Violação</p>
            <div className="flex items-baseline gap-2">
              <p className="text-[22px] font-bold text-foreground tabular-nums leading-none">{breached}</p>
              <TrendLine trend={firstResponseTrend} invert compact />
            </div>
          </div>
        </div>
      </div>
    </DashboardCard>
  );
}
