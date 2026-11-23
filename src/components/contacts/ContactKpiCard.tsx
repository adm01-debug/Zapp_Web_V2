import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useTransform, animate, useReducedMotion } from 'framer-motion';
import { TrendingUp, TrendingDown, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tile = 'blue' | 'green' | 'purple' | 'yellow';

/**
 * Placa do ícone no formato do design (`zc-stat-icon`): 42×43px, raio 11px,
 * gradiente 150deg. As duas paradas vêm de token (`--contacts-stat-plate-*`),
 * nunca de hex solto — a função só escolhe qual tile usar. O amarelo (sem placa
 * própria no design de 4 indicadores) reaproveita o par do violeta.
 */
const TILE_CLASSES: Record<Tile, { plateFrom: string; plateTo: string; fg: string }> = {
  blue:   { plateFrom: 'var(--contacts-stat-plate-blue-from)',   plateTo: 'var(--contacts-stat-plate-blue-to)',   fg: 'text-kpi-blue-fg'   },
  green:  { plateFrom: 'var(--contacts-stat-plate-green-from)',  plateTo: 'var(--contacts-stat-plate-green-to)',  fg: 'text-kpi-green-fg'  },
  purple: { plateFrom: 'var(--contacts-stat-plate-purple-from)', plateTo: 'var(--contacts-stat-plate-purple-to)', fg: 'text-kpi-purple-fg' },
  yellow: { plateFrom: 'var(--contacts-stat-plate-purple-from)', plateTo: 'var(--contacts-stat-plate-purple-to)', fg: 'text-kpi-yellow-fg' },
};

interface ContactKpiCardProps {
  label: string;
  value: number;
  deltaPct: number | null;
  tile: Tile;
  icon: LucideIcon;
  series: number[];
  chart: 'line' | 'bars';
  /**
   * Quando `false`, o número é renderizado direto (sem CountUp): já aparece com o
   * valor real no primeiro frame. Usado pelo card "Total de Contatos", que precisa
   * bater com o badge da aba "Todos" no MESMO snapshot — o badge é estático e um
   * CountUp 0→N fazia o Total exibir um valor intermediário (a "divergência de 29"
   * da etapa 98). Default `true` preserva a animação dos demais cards.
   */
  animateValue?: boolean;
}

function CountUp({ value, enabled }: { value: number; enabled: boolean }) {
  const reduceMotion = useReducedMotion();
  const motionValue = useMotionValue(0);
  const rounded = useTransform(motionValue, (v) => Math.round(v).toLocaleString('pt-BR'));
  const [display, setDisplay] = useState('0');

  useEffect(() => {
    if (reduceMotion || !enabled) return;
    const controls = animate(motionValue, value, { duration: 0.6, ease: 'easeOut' });
    const unsubscribe = rounded.on('change', setDisplay);
    return () => { controls.stop(); unsubscribe(); };
  }, [value, reduceMotion, enabled, motionValue, rounded]);

  if (reduceMotion || !enabled) return <span>{value.toLocaleString('pt-BR')}</span>;
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
      <svg data-testid="kpi-sparkline" width={w} height={h} className={className}>
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
    <svg data-testid="kpi-sparkline" width={w} height={h} className={className}>
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

export function ContactKpiCard({ label, value, deltaPct, tile, icon: Icon, series, chart, animateValue = true }: ContactKpiCardProps) {
  const { plateFrom, plateTo, fg } = TILE_CLASSES[tile];
  const noData = deltaPct === null;
  const flat = deltaPct === 0;

  return (
    <div
      data-testid="kpi-card"
      className="min-h-[86px] rounded-[11px] border border-border/70 bg-card py-[15px] px-4 flex items-center gap-3 min-w-0 max-[1199px]:py-[13px] max-[1199px]:px-3 max-[1199px]:gap-[9px] max-[899px]:py-3 max-[899px]:px-[15px] max-[559px]:py-3 max-[559px]:px-2.5 max-[359px]:flex-col max-[359px]:items-start max-[359px]:gap-2"
    >
      <div
        data-testid="kpi-tile"
        className="w-[42px] h-[43px] rounded-[11px] hidden sm:flex items-center justify-center shrink-0 border border-border/60 max-[1199px]:w-9 max-[1199px]:h-[38px] max-[1199px]:rounded-[9px] max-[559px]:w-8 max-[559px]:h-[34px] max-[559px]:rounded-lg"
        style={{ background: `linear-gradient(150deg, hsl(${plateFrom}), hsl(${plateTo}))` }}
      >
        <Icon className={cn('w-[22px] h-[22px] max-[1199px]:w-5 max-[1199px]:h-5 max-[559px]:w-[18px] max-[559px]:h-[18px]', fg)} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-muted-foreground truncate leading-tight mb-0.5 max-[559px]:whitespace-normal max-[559px]:leading-[1.4]">{label}</p>
        <div className="flex items-baseline gap-2 flex-wrap">
          <p data-testid="kpi-value" className="font-display text-[29px] font-medium tracking-[-0.5px] tabular-nums leading-[1.05] text-foreground max-[1199px]:text-[28px] max-[559px]:text-[26px]">
            <CountUp value={value} enabled={animateValue} />
          </p>
          {!noData && !flat && (
            <span data-testid="kpi-delta" className={cn('flex items-center gap-0.5 text-xs font-semibold shrink-0', deltaPct! > 0 ? 'text-success' : 'text-destructive')}>
              {deltaPct! > 0 ? <TrendingUp className="w-[14px] h-[14px]" /> : <TrendingDown className="w-[14px] h-[14px]" />}
              {deltaPct! > 0 ? '+' : ''}{deltaPct}%
            </span>
          )}
          {flat && <span data-testid="kpi-delta" className="text-xs font-semibold text-muted-foreground shrink-0">sem alteração</span>}
        </div>
        {!noData && (
          <p className="text-xs text-muted-foreground/70 mt-0.5 truncate hidden xl:block">vs. período anterior</p>
        )}
      </div>

      <Sparkline series={series} chart={chart} className={cn('shrink-0 ml-auto hidden sm:block', fg)} />
    </div>
  );
}
