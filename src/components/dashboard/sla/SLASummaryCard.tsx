import { Target, CheckCircle2, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { DashboardCard, SectionHeader, CardSelect } from '../overview/DashboardCard';
import type { PeriodFilter } from '@/hooks/sla/useSLAMetrics';
import { getSLARateTone, SLA_RATE_TEXT_CLASS, SLA_RATE_BG_CLASS } from './slaRate';

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
}

function TrendLine({ trend, invert }: { trend?: TrendInfo; invert?: boolean }) {
  if (!trend || trend.direction === 'stable') {
    return <p className="text-[11px] text-muted-foreground mt-1">sem variação no período anterior</p>;
  }
  const positive = trend.direction === 'up';
  const good = invert ? !positive : positive;
  const Arrow = positive ? TrendingUp : TrendingDown;
  return (
    <p className={`flex items-center gap-1 text-[11px] font-semibold mt-1 ${good ? 'text-dash-green' : 'text-dash-red'}`}>
      <Arrow className="w-3 h-3" />
      {positive ? '+' : '-'}{Math.round(trend.percentage)}%
      <span className="text-muted-foreground font-normal">vs. período anterior</span>
    </p>
  );
}

export function SLASummaryCard({ periodFilter, onPeriodChange, overallRate, onTime, breached, overallTrend }: SLASummaryCardProps) {
  const tone = getSLARateTone(overallRate);

  return (
    <DashboardCard testid="sla-summary-card">
      <SectionHeader
        icon={Target}
        title="Resumo Geral"
        tileSize={34}
        right={<CardSelect value={periodFilter} onValueChange={(v) => onPeriodChange(v as PeriodFilter)} options={PERIOD_OPTIONS} testid="sla-summary-period" />}
      />
      <div className="p-3 rounded-xl bg-muted/20 border border-border/40">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[12px] text-muted-foreground">Taxa de 1ª Resposta no Prazo</span>
          <span className={`text-[20px] font-bold tabular-nums ${SLA_RATE_TEXT_CLASS[tone]}`}>{Math.round(overallRate)}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full ${SLA_RATE_BG_CLASS[tone]}`} style={{ width: `${Math.min(overallRate, 100)}%` }} />
        </div>
        <TrendLine trend={overallTrend} />
      </div>
      <div className="grid grid-cols-2 gap-2.5 mt-2.5">
        <div className="p-2.5 rounded-lg bg-muted/20 border border-border/40">
          <div className="w-7 h-7 rounded-md bg-dash-tile-green flex items-center justify-center mb-1.5"><CheckCircle2 className="w-4 h-4 text-white/90" /></div>
          <p className="text-[18px] font-bold text-foreground tabular-nums leading-none">{onTime}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Respostas no Prazo</p>
        </div>
        <div className="p-2.5 rounded-lg bg-muted/20 border border-border/40">
          <div className="w-7 h-7 rounded-md bg-dash-tile-red flex items-center justify-center mb-1.5"><AlertTriangle className="w-4 h-4 text-white/90" /></div>
          <p className="text-[18px] font-bold text-foreground tabular-nums leading-none">{breached}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Respostas com Violação</p>
        </div>
      </div>
    </DashboardCard>
  );
}
