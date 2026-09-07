import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { motion, useMotionValue, animate, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface CountUpProps {
  value: string;
}

function CountUp({ value }: CountUpProps) {
  const numeric = /^-?\d+$/.test(value) ? parseInt(value, 10) : null;
  const reducedMotion = useReducedMotion();
  const motionValue = useMotionValue(0);
  const [animatedDisplay, setAnimatedDisplay] = useState('0');

  useEffect(() => {
    if (numeric === null || reducedMotion) return undefined;
    const controls = animate(motionValue, numeric, {
      duration: 0.6,
      onUpdate: (v) => setAnimatedDisplay(Math.round(v).toLocaleString('pt-BR')),
    });
    return () => controls.stop();
  }, [numeric, reducedMotion, motionValue]);

  if (numeric === null) return <span>{value}</span>;
  if (reducedMotion) return <span>{numeric.toLocaleString('pt-BR')}</span>;
  return <span>{animatedDisplay}</span>;
}

const barsColorClass = {
  blue: 'bg-dash-blue',
  red: 'bg-dash-red',
  green: 'bg-dash-green',
  violet: 'bg-dash-violet',
} as const;

interface KpiBarsProps {
  bars: number[] | null;
  color: keyof typeof barsColorClass;
}

function KpiBars({ bars, color }: KpiBarsProps) {
  const reducedMotion = useReducedMotion();
  if (!bars) return <div className="w-[55px] h-7 shrink-0" data-testid="kpi-bars-empty" />;
  const max = Math.max(...bars, 1);
  return (
    <div className="flex items-end gap-[3px] h-7 shrink-0" data-testid="kpi-bars">
      {bars.map((v, i) => {
        const heightPct = Math.max(15, Math.round((v / max) * 100));
        return (
          <motion.div
            key={i}
            className={cn('w-[3px] rounded-[1px] origin-bottom', barsColorClass[color])}
            style={{ height: `${heightPct}%` }}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.4, delay: Math.min(i, 12) * 0.02 }}
          />
        );
      })}
    </div>
  );
}

export type KpiDelta =
  | { pct: number; invert?: boolean; label?: string }
  | { text: string; tone: 'success' | 'muted' }
  | null;

const tileColorClass = {
  blue: 'bg-dash-tile-blue',
  red: 'bg-dash-tile-red',
  green: 'bg-dash-tile-green',
} as const;

interface DashboardKpiCardProps {
  label: string;
  value: string;
  delta: KpiDelta;
  tile: keyof typeof tileColorClass;
  icon: LucideIcon;
  bars: number[] | null;
  barsColor: keyof typeof barsColorClass;
  testid?: string;
}

function DeltaLine({ delta }: { delta: KpiDelta }) {
  if (delta === null) {
    return <p className="text-[11px] text-muted-foreground">—</p>;
  }
  if ('text' in delta) {
    return (
      <p className={cn('text-[11px] font-semibold', delta.tone === 'success' ? 'text-dash-green' : 'text-muted-foreground')}>
        {delta.text}
      </p>
    );
  }
  const positive = delta.pct >= 0;
  const good = delta.invert ? !positive : positive;
  const Arrow = positive ? TrendingUp : TrendingDown;
  return (
    <p className={cn('flex items-center gap-1 text-[11px] font-semibold', good ? 'text-dash-green' : 'text-dash-red')}>
      <Arrow className="w-3 h-3" />
      {positive ? '+' : ''}{delta.pct}%
      <span className="text-muted-foreground font-normal">{delta.label ?? 'vs. ontem'}</span>
    </p>
  );
}

export function DashboardKpiCard({ label, value, delta, tile, icon: Icon, bars, barsColor, testid }: DashboardKpiCardProps) {
  return (
    <div data-testid={testid ?? 'kpi-card'} className="h-[95px] rounded-xl bg-card border border-border/70 p-3 flex gap-3">
      <div data-testid="kpi-tile" className={cn('w-[34px] h-[34px] rounded-lg flex items-center justify-center shrink-0', tileColorClass[tile])}>
        <Icon className="w-[18px] h-[18px] text-white/90" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-foreground-secondary truncate">{label}</p>
        <p data-testid="kpi-value" className="text-[22px] font-bold tabular-nums text-foreground leading-tight">
          <CountUp value={value} />
        </p>
        <DeltaLine delta={delta} />
      </div>
      <KpiBars bars={bars} color={barsColor} />
    </div>
  );
}
