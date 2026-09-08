import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
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
  amber: 'bg-dash-amber',
} as const;

const lineStrokeVar = {
  blue: 'hsl(var(--dash-blue))',
  red: 'hsl(var(--dash-red))',
  green: 'hsl(var(--dash-green))',
  violet: 'hsl(var(--dash-violet))',
  amber: 'hsl(var(--dash-amber))',
} as const;

/** Caixa do sparkline por tamanho de card. Hero = geometria dos mockups (barras grossas / linha 100x44). */
const chartDims = {
  compact: { w: 55, h: 28, barW: 3, barGap: 3 },
  tall: { w: 55, h: 28, barW: 3, barGap: 3 },
  hero: { w: 100, h: 44, barW: 10, barGap: 5 },
} as const;

type KpiSize = keyof typeof chartDims;

interface KpiBarsProps {
  bars: number[] | null;
  color: keyof typeof barsColorClass;
  size?: KpiSize;
}

function KpiBars({ bars, color, size = 'compact' }: KpiBarsProps) {
  const reducedMotion = useReducedMotion();
  const dims = chartDims[size];
  if (!bars) return <div style={{ width: dims.w, height: dims.h }} className="shrink-0" data-testid="kpi-bars-empty" />;
  const max = Math.max(...bars, 1);
  return (
    <div className="flex items-end shrink-0" style={{ height: dims.h, gap: dims.barGap }} data-testid="kpi-bars">
      {bars.map((v, i) => {
        const heightPct = Math.max(15, Math.round((v / max) * 100));
        return (
          <motion.div
            key={i}
            className={cn('origin-bottom', size === 'hero' ? 'rounded-[3px]' : 'rounded-[1px]', barsColorClass[color])}
            style={{ height: `${heightPct}%`, width: dims.barW }}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.4, delay: Math.min(i, 12) * 0.02 }}
          />
        );
      })}
    </div>
  );
}

/** Sparkline de linha — path suave via pathLength 0→1. No hero ganha área com gradiente (como nos mockups). */
function KpiLine({ bars, color, size = 'compact' }: KpiBarsProps) {
  const reducedMotion = useReducedMotion();
  const dims = chartDims[size];
  if (!bars || bars.length < 2) return <div style={{ width: dims.w, height: dims.h }} className="shrink-0" data-testid="kpi-line-empty" />;
  const { w: width, h: height } = dims;
  const pad = size === 'hero' ? 3 : 0;
  const max = Math.max(...bars);
  const min = Math.min(...bars);
  const range = max - min || 1;
  const stepX = (width - pad * 2) / (bars.length - 1);
  const points = bars.map((v, i) => [pad + i * stepX, pad + (height - pad * 2) - ((v - min) / range) * (height - pad * 2)]);
  // Catmull-Rom → bezier, para a curva suave dos mockups
  const d = points.reduce((acc, [x, y], i) => {
    if (i === 0) return `M${x.toFixed(1)},${y.toFixed(1)}`;
    const [px, py] = points[i - 1];
    const cx = ((px + x) / 2).toFixed(1);
    return `${acc} C${cx},${py.toFixed(1)} ${cx},${y.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`;
  }, '');
  const gradId = `kpi-grad-${color}`;
  const area = `${d} L${points[points.length - 1][0].toFixed(1)},${height} L${points[0][0].toFixed(1)},${height} Z`;
  return (
    <div style={{ width, height }} className="shrink-0" data-testid="kpi-line">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none">
        {size === 'hero' && (
          <>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineStrokeVar[color]} stopOpacity={0.35} />
                <stop offset="100%" stopColor={lineStrokeVar[color]} stopOpacity={0} />
              </linearGradient>
            </defs>
            <motion.path d={area} fill={`url(#${gradId})`} initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.3 }} />
          </>
        )}
        <motion.path
          d={d}
          stroke={lineStrokeVar[color]}
          strokeWidth={size === 'hero' ? 2 : 1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reducedMotion ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.6, ease: 'easeOut' }}
        />
      </svg>
    </div>
  );
}

export type KpiDelta =
  | { pct: number; invert?: boolean; label?: string; /** hero: renderiza como pill (mockup Metas) */ pill?: boolean }
  | { text: string; tone: 'success' | 'muted' }
  | null;

const tileColorClass = {
  blue: 'bg-dash-tile-blue',
  red: 'bg-dash-tile-red',
  green: 'bg-dash-tile-green',
  violet: 'bg-dash-tile-violet',
  amber: 'bg-dash-tile-amber',
} as const;

const kpiCardHeightClass = {
  compact: 'h-[95px]',
  tall: 'h-[122px]',
  hero: 'min-h-[132px]',
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
  /** Posição na grade — só usada para o pequeno stagger do fade de entrada. */
  index?: number;
  /** 'bars' (padrão, comportamento atual) ou 'line' (sparkline de linha). 'none' esconde o gráfico. */
  chart?: 'bars' | 'line' | 'none';
  /** Conteúdo extra abaixo do valor (barra de progresso, sublegenda). Default: nada. */
  footer?: ReactNode;
  /** 'compact' (95px), 'tall' (122px) ou 'hero' (mockups das abas: tile 56, valor 32, sparkline 100x44). */
  size?: KpiSize;
  /** Classe extra no valor — ex.: cor por faixa (SLA 32% vermelho). */
  valueClassName?: string;
  /** Pill no canto superior direito (ex.: "Positivo", "Ativo"). Só renderiza no hero. */
  badge?: ReactNode;
  /** Ícone/tooltip ao lado do label (ex.: Info em SLA). */
  labelAdornment?: ReactNode;
  /** Substitui o sparkline por conteúdo arbitrário (ex.: ícone + "Sem avaliações no período"). */
  aside?: ReactNode;
}

function DeltaLine({ delta, size = 'compact' }: { delta: KpiDelta; size?: KpiSize }) {
  const hero = size === 'hero';
  const textCls = hero ? 'text-[13px]' : 'text-[11px]';
  if (delta === null) {
    return <p className={cn(textCls, 'text-muted-foreground')}>—</p>;
  }
  if ('text' in delta) {
    return (
      <p className={cn(textCls, 'font-semibold', delta.tone === 'success' ? 'text-dash-green' : 'text-muted-foreground')}>
        {delta.text}
      </p>
    );
  }
  const positive = delta.pct >= 0;
  const good = delta.invert ? !positive : positive;
  const Arrow = positive ? TrendingUp : TrendingDown;
  const tone = good ? 'text-dash-green' : 'text-dash-red';
  if (hero && delta.pill) {
    return (
      <span className={cn('inline-flex items-center gap-1 h-6 px-2 rounded-full text-[12px] font-semibold', good ? 'bg-dash-green/15 text-dash-green' : 'bg-dash-red/15 text-dash-red')}>
        <Arrow className="w-3.5 h-3.5" />
        {positive ? '+' : ''}{delta.pct}%
      </span>
    );
  }
  return (
    <p className={cn('flex items-center gap-1 font-semibold', textCls, tone)}>
      <Arrow className={hero ? 'w-3.5 h-3.5' : 'w-3 h-3'} />
      {positive ? '+' : ''}{delta.pct}%
      <span className="text-muted-foreground font-normal">{delta.label ?? 'vs. ontem'}</span>
    </p>
  );
}

export function DashboardKpiCard({
  label, value, delta, tile, icon: Icon, bars, barsColor, testid, index = 0,
  chart = 'bars', footer, size = 'compact', valueClassName, badge, labelAdornment, aside,
}: DashboardKpiCardProps) {
  const reducedMotion = useReducedMotion();
  const hero = size === 'hero';
  const graph = aside ?? (chart === 'none' ? null : chart === 'line'
    ? <KpiLine bars={bars} color={barsColor} size={size} />
    : <KpiBars bars={bars} color={barsColor} size={size} />);

  if (!hero) {
    return (
      <motion.div
        data-testid={testid ?? 'kpi-card'}
        className={cn('rounded-xl bg-card border border-border/70 p-3 flex flex-col gap-1.5', kpiCardHeightClass[size])}
        initial={reducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15, delay: Math.min(index, 12) * 0.02 }}
      >
        <div className="flex gap-3">
          <div data-testid="kpi-tile" className={cn('w-[34px] h-[34px] rounded-lg flex items-center justify-center shrink-0', tileColorClass[tile])}>
            <Icon className="w-[18px] h-[18px] text-white/90" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-foreground-secondary truncate">{label}</p>
            <p data-testid="kpi-value" className={cn('text-[22px] font-bold tabular-nums text-foreground leading-tight', valueClassName)}>
              <CountUp value={value} />
            </p>
            <DeltaLine delta={delta} />
          </div>
          {graph}
        </div>
        {footer && <div className="min-w-0">{footer}</div>}
      </motion.div>
    );
  }

  // ---- HERO (mockups das abas): tile 56, label 14, valor 32, delta 13, sparkline 100x44 ----
  const isPill = delta !== null && 'pct' in delta && delta.pill;
  return (
    <motion.div
      data-testid={testid ?? 'kpi-card'}
      className={cn('relative rounded-2xl bg-card border border-border/70 p-5 flex flex-col gap-3', kpiCardHeightClass.hero)}
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, delay: Math.min(index, 12) * 0.02 }}
    >
      {badge && <div className="absolute top-4 right-4">{badge}</div>}
      <div className="flex gap-4 items-start">
        <div data-testid="kpi-tile" className={cn('w-14 h-14 rounded-2xl flex items-center justify-center shrink-0', tileColorClass[tile])}>
          <Icon className="w-[26px] h-[26px] text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[14px] font-medium text-foreground-secondary">
            <span className="truncate">{label}</span>
            {labelAdornment}
            {isPill && <span className="ml-auto">{<DeltaLine delta={delta} size="hero" />}</span>}
          </div>
          <p data-testid="kpi-value" className={cn('text-[32px] font-bold tabular-nums text-foreground leading-none mt-1 tracking-[-0.02em]', valueClassName)}>
            <CountUp value={value} />
          </p>
          {!isPill && <div className="mt-1.5"><DeltaLine delta={delta} size="hero" /></div>}
        </div>
        {graph && <div className="self-center">{graph}</div>}
      </div>
      {footer && <div className="min-w-0">{footer}</div>}
    </motion.div>
  );
}
