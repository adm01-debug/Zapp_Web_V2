import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useTransform, animate, useReducedMotion } from 'framer-motion';
import { TrendingUp, TrendingDown, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tile = 'blue' | 'green' | 'purple' | 'yellow';

const TILE_CLASSES: Record<Tile, { bg: string; fg: string }> = {
  blue:   { bg: 'bg-kpi-blue',   fg: 'text-kpi-blue-fg'   },
  green:  { bg: 'bg-kpi-green',  fg: 'text-kpi-green-fg'  },
  purple: { bg: 'bg-kpi-purple', fg: 'text-kpi-purple-fg' },
  yellow: { bg: 'bg-kpi-yellow', fg: 'text-kpi-yellow-fg' },
};

interface ContactKpiCardProps {
  label: string;
  value: number;
  deltaPct: number | null;
  tile: Tile;
  icon: LucideIcon;
  series: number[];
  chart: 'line' | 'bars';
}

function CountUp({ value }: { value: number }) {
  const reduceMotion = useReducedMotion();
  const motionValue = useMotionValue(0);
  const rounded = useTransform(motionValue, (v) => Math.round(v).toLocaleString('pt-BR'));
  const [display, setDisplay] = useState('0');

  useEffect(() => {
    if (reduceMotion) return;
    const controls = animate(motionValue, value, { duration: 0.6, ease: 'easeOut' });
    const unsubscribe = rounded.on('change', setDisplay);
    return () => { controls.stop(); unsubscribe(); };
  }, [value, reduceMotion, motionValue, rounded]);

  if (reduceMotion) return <span>{value.toLocaleString('pt-BR')}</span>;
  return <span>{display}</span>;
}

function Sparkline({ series, chart, className }: { series: number[]; chart: 'line' | 'bars'; className?: string }) {
  const reduceMotion = useReducedMotion();
  if (series.length === 0 || series.every((v) => v === 0)) return null;

  const w = 96;
  const h = 40;

  if (chart === 'bars') {
    const max = Math.max(...series, 1);
    const barW = 6;
    const gap = 4;
    const totalW = series.length * barW + (series.length - 1) * gap;
    const offsetX = (w - totalW) / 2;
    return (
      <svg width={w} height={h} className={className}>
        {series.map((v, i) => {
          const barH = Math.max((v / max) * (h - 4), 2);
          return (
            <rect
              key={i}
              x={offsetX + i * (barW + gap)}
              y={h - barH}
              width={barW}
              height={barH}
              rx={1}
              fill="currentColor"
            />
          );
        })}
      </svg>
    );
  }

  const max = Math.max(...series, 1);
  const min = Math.min(...series, 0);
  const range = max - min || 1;
  const padding = 3;
  const points = series.map((v, i) => {
    const x = padding + (i / (series.length - 1 || 1)) * (w - padding * 2);
    const y = h - padding - ((v - min) / range) * (h - padding * 2);
    return [x, y] as const;
  });
  const pathD = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
  const areaD = `${pathD} L${points[points.length - 1][0]},${h} L${points[0][0]},${h} Z`;
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg width={w} height={h} className={className}>
      <defs>
        <linearGradient id="kpi-spark-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#kpi-spark-area)" />
      {reduceMotion ? (
        <path d={pathD} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <motion.path
          d={pathD}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.7 }}
        />
      )}
      <circle cx={lastX} cy={lastY} r="3" fill="currentColor" />
    </svg>
  );
}

export function ContactKpiCard({ label, value, deltaPct, tile, icon: Icon, series, chart }: ContactKpiCardProps) {
  const { bg, fg } = TILE_CLASSES[tile];
  const noData = deltaPct === null;
  const flat = deltaPct === 0;

  return (
    <div
      data-testid="kpi-card"
      className="h-[96px] rounded-2xl border border-border/60 card-glow py-3 px-4 flex items-center gap-3"
    >
      <div data-testid="kpi-tile" className={cn('w-12 h-12 rounded-xl flex items-center justify-center shrink-0', bg)}>
        <Icon className={cn('w-[22px] h-[22px]', fg)} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-muted-foreground truncate leading-tight">{label}</p>
        <div className="flex items-baseline gap-2 mt-0.5 flex-wrap">
          <p data-testid="kpi-value" className="text-[26px] font-bold tabular-nums leading-none text-foreground">
            <CountUp value={value} />
          </p>
          {!noData && !flat && (
            <span className={cn('flex items-center gap-0.5 text-[13px] font-semibold shrink-0', deltaPct! > 0 ? 'text-success' : 'text-destructive')}>
              {deltaPct! > 0 ? <TrendingUp className="w-[14px] h-[14px]" /> : <TrendingDown className="w-[14px] h-[14px]" />}
              {deltaPct! > 0 ? '+' : ''}{deltaPct}%
            </span>
          )}
          {flat && <span className="text-[13px] font-semibold text-muted-foreground shrink-0">sem alteração</span>}
        </div>
        {!noData && (
          <p className="text-[12px] text-muted-foreground/70 mt-0.5 truncate hidden xl:block">vs. período anterior</p>
        )}
      </div>

      <Sparkline series={series} chart={chart} className={cn('shrink-0 ml-auto hidden sm:block', fg)} />
    </div>
  );
}
