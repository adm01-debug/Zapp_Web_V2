import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight as Chevron, MessageSquare, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PillTone, TileColor } from './constants';
import { IconTile } from './primitives';

/** Card do rail direito. */
export function RailCard({ icon, color = 'blue', title, subtitle, right, children, className, glow }: { icon?: LucideIcon; color?: TileColor; title: string; subtitle?: string; right?: ReactNode; children?: ReactNode; className?: string; glow?: boolean }) {
  return (
    <section className={cn('rounded-2xl bg-card border border-border/70 p-4 flex flex-col gap-3 min-w-0', glow && 'relative overflow-hidden', className)}>
      {glow && <div className="pointer-events-none absolute -top-16 -right-16 w-48 h-48 rounded-full bg-primary/15 blur-3xl" />}
      <div className="flex items-start gap-3 relative">
        {icon && <IconTile icon={icon} color={color} size={40} />}
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-foreground leading-tight">{title}</p>
          {subtitle && <p className="text-xs text-foreground-secondary mt-0.5 leading-snug">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

/** Linha clicável do rail (ações rápidas): tile + título + subtítulo + chevron. */
export function RailAction({ icon, color = 'blue', title, subtitle, onClick, disabled }: { icon: LucideIcon; color?: TileColor; title: string; subtitle?: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/50 hover:border-primary/40 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <IconTile icon={icon} color={color} size={36} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-foreground truncate">{title}</p>
        {subtitle && <p className="text-2xs text-muted-foreground truncate">{subtitle}</p>}
      </div>
      <Chevron className="w-4 h-4 text-muted-foreground shrink-0" />
    </button>
  );
}
// ════════════════════════════════════════════════════════════════════════════
// E18 — Rail: HeroCard, RecentList, TipCard, AlertCard
// ════════════════════════════════════════════════════════════════════════════
export function HeroCard({ icon, title, subtitle, metrics }: {
  icon: LucideIcon; title: string; subtitle?: string;
  metrics?: { label: string; value: string | number }[];
}) {
  return (
    <div className="talkx-card--hero rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <IconTile icon={icon} color="blue" size={48} glow />
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-foreground leading-tight">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{subtitle}</p>}
        </div>
      </div>
      {metrics && metrics.length > 0 && (
        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border/40">
          {metrics.map((m, i) => (
            <div key={i} className="text-center">
              <p className="text-[15px] font-bold text-foreground">{m.value}</p>
              <p className="text-3xs text-muted-foreground leading-tight mt-0.5">{m.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export interface RecentItem { id: string; name: string; statusLabel: string; statusTone: PillTone; pct?: number; thumb?: string; onOpen: () => void; }
export function RecentList({ items }: { items: RecentItem[] }) {
  return (
    <div className="flex flex-col gap-1">
      {items.map(item => (
        <button key={item.id} type="button" onClick={item.onOpen}
          className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-muted/30 transition-colors text-left group"
        >
          {item.thumb ? (
            <img src={item.thumb} alt="" className="w-8 h-8 rounded object-cover shrink-0 bg-muted" />
          ) : (
            <div className="w-8 h-8 rounded bg-primary/15 flex items-center justify-center shrink-0">
              <MessageSquare className="w-3.5 h-3.5 text-primary" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground truncate">{item.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={cn('inline-flex h-1.5 w-1.5 rounded-full', item.statusTone === 'success' ? 'bg-success' : item.statusTone === 'warning' ? 'bg-warning' : 'bg-muted-foreground')} />
              <span className="text-2xs text-muted-foreground">{item.statusLabel}{item.pct !== undefined ? ` · ${item.pct}%` : ''}</span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

export function TipCard({ tip }: { tip: string }) {
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-success/8 border border-success/20">
      <div className="w-6 h-6 rounded-full bg-success/20 flex items-center justify-center shrink-0 mt-0.5">
        <Lightbulb className="w-3 h-3 text-success" />
      </div>
      <div>
        <p className="text-2xs font-semibold text-success uppercase tracking-wide mb-0.5">Dica do dia</p>
        <p className="text-xs text-foreground leading-snug">{tip}</p>
      </div>
    </div>
  );
}
