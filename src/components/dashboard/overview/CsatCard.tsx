import { Smile, Star } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { DashboardCard, SectionHeader, CardSelect } from './DashboardCard';
import { useCSAT } from '@/hooks/business/useCSAT';
import { cn } from '@/lib/utils';

interface CsatCardProps {
  period: 'today' | 'week' | 'month';
  onPeriodChange: (period: 'today' | 'week' | 'month') => void;
}

const BAR_COLOR: Record<number, string> = {
  5: 'bg-dash-green',
  4: 'bg-dash-green',
  3: 'bg-dash-yellow',
  2: 'bg-dash-red',
  1: 'bg-dash-red',
};

export function CsatCard({ period, onPeriodChange }: CsatCardProps) {
  const { stats } = useCSAT(period);
  const reducedMotion = useReducedMotion();

  const total = stats?.total ?? 0;
  const average = stats?.average ?? 0;
  const trend = stats?.trend ?? 0;
  const distribution = stats?.distribution ?? {};

  return (
    <DashboardCard testid="csat-card" className="min-h-[173px]">
      <SectionHeader
        icon={Smile}
        title="Satisfação do Cliente (CSAT)"
        tileSize={34}
        right={(
          <CardSelect
            testid="csat-select"
            value={period}
            onValueChange={(v) => onPeriodChange(v as 'today' | 'week' | 'month')}
            options={[{ value: 'today', label: 'Hoje' }, { value: 'week', label: 'Esta semana' }, { value: 'month', label: 'Últimos 30 dias' }]}
          />
        )}
      />
      {total === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[12px] text-muted-foreground min-h-[100px]">
          Sem avaliações no período
        </div>
      ) : (
        <div className="grid grid-cols-[96px_1fr] gap-3">
          <div className="flex flex-col items-start">
            <p className="text-[30px] font-bold tabular-nums text-foreground leading-none">{average.toFixed(1)}</p>
            <div className="flex gap-0.5 mt-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} className={cn('w-3 h-3', n <= Math.round(average) ? 'fill-dash-amber text-dash-amber' : 'fill-muted-foreground/40 text-muted-foreground/40')} />
              ))}
            </div>
            <p className={cn('text-[11px] font-semibold mt-1.5', trend >= 0 ? 'text-dash-green' : 'text-dash-red')}>
              {trend > 0 ? '+' : ''}{trend}%
            </p>
            <p className="text-[11px] text-foreground-secondary">vs. período anterior</p>
          </div>
          <div className="flex flex-col gap-0.5 justify-center">
            {[5, 4, 3, 2, 1].map((n) => {
              const count = distribution[n] ?? 0;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={n} data-testid="csat-row" className="h-5 flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground w-7 shrink-0">{n} ★</span>
                  <div className="h-2.5 rounded-full bg-muted/60 flex-1 overflow-hidden">
                    <motion.div
                      className={cn('h-full rounded-full', BAR_COLOR[n])}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={reducedMotion ? { duration: 0 } : { duration: 0.5 }}
                    />
                  </div>
                  <span className="text-[11px] font-semibold text-foreground w-8 text-right shrink-0">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </DashboardCard>
  );
}
