import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TileColor } from './constants';
import { IconTile } from './primitives';


// ════════════════════════════════════════════════════════════════════════════
// E13 — KpiCard: card de métrica hero com mini-barras e delta
// ════════════════════════════════════════════════════════════════════════════
interface KpiCardProps {
  icon: LucideIcon; color?: TileColor; label: string; value: string;
  delta?: { value: number; suffix?: '%' | 'p.p.'; tone?: 'up' | 'down' };
  bars?: number[]; // 7 valores reais (% de altura relativa 0-100)
  hint?: string;
  index?: number; // para delay de animação
  /** E17 (Catálogo): 72px, sem mini-barras, ícone à esquerda, texto menor. */
  compact?: boolean;
}

export function KpiCard({ icon, color = 'blue', label, value, delta, bars, hint, index = 0, compact = false }: KpiCardProps) {
  const maxBar = bars ? Math.max(...bars, 1) : 1;
  if (compact) {
    return (
      <div
        className={cn('relative bg-card border border-border/70 rounded-xl px-3 flex items-center gap-2.5 h-[72px] overflow-hidden',
          'hover:border-primary/30 hover:shadow-[var(--glow-primary-sm)] transition-all duration-150'
        )}
        style={{ animationDelay: `${index * 40}ms` }}
        title={hint}
      >
        <IconTile icon={icon} color={color} size={32} glow />
        <div className="flex-1 min-w-0">
          <p className="text-3xs font-medium text-muted-foreground leading-none mb-1 uppercase tracking-wide truncate">{label}</p>
          <span className="text-lg font-semibold tracking-tight text-foreground leading-none tabular-nums">{value}</span>
        </div>
      </div>
    );
  }
  return (
    <div
      className={cn('relative bg-card border border-border/70 rounded-xl p-4 flex items-start gap-3 h-24 overflow-hidden',
        'hover:border-primary/30 hover:shadow-[var(--glow-primary-sm)] transition-all duration-150'
      )}
      style={{ animationDelay: `${index * 40}ms` }}
      title={hint}
    >
      <IconTile icon={icon} color={color} size={40} glow />
      <div className="flex-1 min-w-0">
        <p className="text-2xs font-medium text-muted-foreground leading-none mb-1 uppercase tracking-wide truncate">{label}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tracking-tight text-foreground leading-none">{value}</span>
          {delta && (
            <span className={cn('flex items-center gap-0.5 text-2xs font-semibold', delta.tone === 'down' ? 'text-destructive' : 'text-success')}>
              {delta.tone === 'down' ? '↓' : '↑'}{Math.abs(delta.value).toFixed(1)}{delta.suffix ?? '%'}
            </span>
          )}
        </div>
      </div>
      {bars && bars.length >= 2 && (
        <div className="talkx-kpi-bars absolute bottom-3 right-3">
          {bars.slice(-7).map((h, i, arr) => (
            <span key={i} style={{ height: `${Math.max(4, Math.round((h / maxBar) * 28))}px` }}
              className={i === arr.length - 1 ? '' : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}

export function KpiCardSkeleton({ compact = false }: { compact?: boolean } = {}) {
  return <div className={cn('bg-card border border-border/70 rounded-xl animate-pulse', compact ? 'h-[72px]' : 'h-24')} />;
}
