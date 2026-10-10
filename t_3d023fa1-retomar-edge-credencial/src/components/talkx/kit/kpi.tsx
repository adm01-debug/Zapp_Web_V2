import type { LucideIcon } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import { TalkXNoData } from './states';
import { cn } from '@/lib/utils';
import type { TileColor } from './constants';
import { IconTile } from './primitives';

// ════════════════════════════════════════════════════════════════════════════
// E13 — KpiCard: card de métrica hero com barras/anel e variação calculada
// ════════════════════════════════════════════════════════════════════════════

export type KpiComparisonKind = 'relative' | 'points';

export interface KpiComparison {
  /** Valor do período anterior. Sem ele (ou <= 0) não há variação. */
  previous?: number | null;
  /** 'relative' = % de variação; 'points' = diferença em pontos percentuais. */
  kind: KpiComparisonKind;
  /** Base mínima para exibir a variação (evita ruído em bases pequenas). */
  minBase?: number;
  /** Base do cálculo relativo (default: previous). */
  baseValue?: number;
  /** Sentido "bom" — controla a cor. Default: 'up'. */
  goodWhen?: 'up' | 'down';
}

export type KpiVisual = 'bars' | 'ring' | 'none';

interface KpiCardProps {
  icon: LucideIcon;
  color?: TileColor;
  label: string;
  value?: number | string | null;
  /** Variação vs. período anterior — o card decide sozinho se mostra. */
  comparison?: KpiComparison;
  visual?: KpiVisual;
  bars?: number[];
  hint?: string;
  index?: number;
  compact?: boolean;
}

interface Variation {
  text: string;
  arrow: '↗' | '↘';
  tone: 'good' | 'bad';
  title: string;
}

function toBR(n: number, digits = 0): string {
  return n.toFixed(digits).replace('.', ',');
}

/** Calcula a variação exibida. Só existe com base válida (previous > 0 e >= minBase). */
function computeVariation(
  value: number | string | null | undefined,
  comparison?: KpiComparison,
): Variation | null {
  if (!comparison || typeof value !== 'number') return null;
  const prev = comparison.previous;
  if (prev == null || prev <= 0) return null;
  const base = comparison.baseValue ?? prev;
  if (base < (comparison.minBase ?? 0)) return null;

  const raw = comparison.kind === 'points'
    ? value - prev
    : ((value - prev) / base) * 100;
  const up = raw >= 0;
  const good = comparison.goodWhen === 'down' ? !up : up;
  const magnitude = comparison.kind === 'points'
    ? toBR(Math.abs(raw), 1)
    : String(Math.round(Math.abs(raw)));
  const title = comparison.kind === 'points'
    ? 'vs. período anterior · pontos percentuais'
    : 'vs. período anterior';

  return {
    text: `${up ? '+' : '-'}${magnitude}%`,
    arrow: up ? '↗' : '↘',
    tone: good ? 'good' : 'bad',
    title,
  };
}

function Ring({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const circumference = 2 * Math.PI * 15;
  return (
    <div className="absolute bottom-3 right-3 w-8 h-8" aria-hidden="true">
      <svg viewBox="0 0 36 36" className="w-8 h-8 -rotate-90">
        <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3" className="stroke-border" />
        <circle
          cx="18" cy="18" r="15" fill="none" strokeWidth="3" className="stroke-primary"
          strokeDasharray={`${(pct / 100) * circumference} ${circumference}`}
        />
      </svg>
    </div>
  );
}

export function KpiCard({
  icon, color = 'blue', label, value, comparison, visual, bars, hint, index = 0, compact = false,
}: KpiCardProps) {
  const reduceMotion = useReducedMotion() ?? false;

  if (value === null || value === undefined) {
    return <TalkXNoData hint={hint} />;
  }

  const variation = computeVariation(value, comparison);
  const display = typeof value === 'number' ? value.toLocaleString('pt-BR') : value;
  const barData = bars && bars.length >= 2 ? bars : null;
  const showBars = !!barData && visual !== 'ring' && visual !== 'none';
  const showRing = visual === 'ring' && typeof value === 'number';
  const maxBar = barData ? Math.max(...barData, 1) : 1;
  const animation = reduceMotion ? undefined : { animationDelay: `${index * 40}ms` };

  return (
    <div
      data-testid="kpi-card"
      className={cn(
        'relative bg-card border border-border/70 rounded-xl flex overflow-hidden gap-3',
        'hover:border-primary/30 hover:shadow-[var(--glow-primary-sm)] transition-all duration-150',
        compact ? 'px-3 h-[72px] items-center gap-2.5' : 'p-4 h-24 items-start',
      )}
      style={animation}
      title={hint}
    >
      <IconTile icon={icon} color={color} size={compact ? 32 : 40} glow />
      <div className="flex-1 min-w-0">
        <p className={cn(
          'font-medium text-muted-foreground leading-none mb-1 uppercase tracking-wide truncate',
          compact ? 'text-3xs' : 'text-2xs',
        )}>
          {label}
        </p>
        <div className="flex items-baseline gap-2">
          <span className={cn(
            'font-semibold tracking-tight text-foreground leading-none tabular-nums',
            compact ? 'text-lg' : 'text-2xl',
          )}>
            {display}
          </span>
          {variation && (
            <span
              data-testid="kpi-comparison"
              title={variation.title}
              className={cn(
                'flex items-center gap-0.5 text-2xs font-semibold',
                variation.tone === 'bad' ? 'text-destructive' : 'text-success',
              )}
            >
              <span aria-hidden="true">{variation.arrow}</span>
              <span>{variation.text}</span>
            </span>
          )}
        </div>
      </div>
      {showBars && (
        <div className="talkx-kpi-bars absolute bottom-3 right-3">
          {barData!.slice(-7).map((h, i) => (
            <span key={i} style={{ height: `${Math.max(4, Math.round((h / maxBar) * 28))}px` }} />
          ))}
        </div>
      )}
      {showRing && <Ring value={value as number} />}
    </div>
  );
}

export function KpiCardSkeleton({ compact = false }: { compact?: boolean } = {}) {
  return <div className={cn('bg-card border border-border/70 rounded-xl animate-pulse', compact ? 'h-[72px]' : 'h-24')} />;
}

export { TalkXNoData };
