import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Pill } from '@/components/dashboard/overview/DashboardCard';
import type { PillTone, TileColor } from './constants';

/* ------------------------------------------------------------------ */
/* Primitivos visuais (carvão)                                        */
/* ------------------------------------------------------------------ */

// Gradient tiles (glow=true) usam classes CSS em components.css
const tileGradient: Record<TileColor, string> = {
  blue: 'talkx-tile talkx-tile--blue', red: 'talkx-tile talkx-tile--red',
  green: 'talkx-tile talkx-tile--green', violet: 'talkx-tile talkx-tile--violet',
  amber: 'talkx-tile talkx-tile--amber',
};
// Flat tiles (legado, default quando glow=false)
const tileBg: Record<TileColor, string> = {
  blue: 'bg-dash-tile-blue', red: 'bg-dash-tile-red', green: 'bg-dash-tile-green',
  violet: 'bg-dash-tile-violet', amber: 'bg-dash-tile-amber',
};
// Soft tiles para linhas de tabela sem mídia
const tileSoft: Record<TileColor, string> = {
  blue: 'talkx-tile talkx-tile--soft-blue', red: 'talkx-tile talkx-tile--soft-red',
  green: 'talkx-tile talkx-tile--soft-green', violet: 'talkx-tile talkx-tile--soft-violet',
  amber: 'talkx-tile talkx-tile--soft-amber',
};
/** Tile quadrado com ícone (cabeçalhos de seção, itens do rail, tabela). */
export function IconTile({ icon: Icon, color = 'blue', size = 40, glow = false, soft = false, className }: { icon: LucideIcon; color?: TileColor; size?: 32 | 36 | 40 | 44 | 48 | 56; glow?: boolean; soft?: boolean; className?: string }) {
  const iconSize = size >= 48 ? 'w-6 h-6' : size >= 40 ? 'w-5 h-5' : 'w-4 h-4';
  const radiusCls = size <= 36 ? 'talkx-tile--sm' : '';
  const bgCls = soft ? tileSoft[color] : glow ? tileGradient[color] : cn('bg-dash-tile-' + color, 'rounded-xl flex items-center justify-center shrink-0');
  const iconColor = soft ? `text-${color === 'blue' ? 'primary' : color === 'green' ? 'success' : color === 'red' ? 'destructive' : 'foreground'}` : 'text-white/90';
  return (
    <div style={{ width: size, height: size }} className={cn(bgCls, radiusCls, 'flex items-center justify-center shrink-0', className)}>
      <Icon className={cn(iconSize, iconColor)} strokeWidth={2} />
    </div>
  );
}
/** Cabeçalho de página do módulo: tile grande + título + subtítulo + ações à direita. */
export function ModuleHeader({ icon, color = 'blue', title, subtitle, right }: { icon: LucideIcon; color?: TileColor; title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3.5 min-w-0">
        <IconTile icon={icon} color={color} size={56} className="rounded-2xl shadow-[0_8px_24px_-10px_hsl(var(--primary)/.6)]" />
        <div className="min-w-0">
          <h1 className="text-3xl leading-tight font-bold font-display text-foreground tracking-[-0.02em] truncate">{title}</h1>
          {subtitle && <p className="text-[13px] text-foreground-secondary mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="flex items-center gap-2 shrink-0 flex-wrap">{right}</div>}
    </div>
  );
}
/** Linha de metadado (label à esquerda, valor à direita) para resumos. */
export function MetaRow({ icon: Icon, label, value, valueClassName }: { icon?: LucideIcon; label: string; value: ReactNode; valueClassName?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border/50 last:border-0">
      <span className="flex items-center gap-2 text-xs text-foreground-secondary shrink-0">
        {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
        {label}
      </span>
      <span className={cn('text-xs font-medium text-foreground text-right min-w-0 break-words', valueClassName)}>{value}</span>
    </div>
  );
}
/** Cabeçalho de tabela padronizado. */
export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn('text-left text-2xs font-semibold text-foreground-secondary px-3 py-2.5 whitespace-nowrap', className)}>{children}</th>;
}
export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn('px-3 py-3 text-xs text-foreground align-middle', className)}>{children}</td>;
}
export function StatusPill({ status, map }: { status: string; map: Record<string, { label: string; tone: PillTone }> }) {
  const m = map[status] ?? { label: status, tone: 'muted' as PillTone };
  return <Pill label={m.label} tone={m.tone} dot />;
}
export function SegmentedToggle<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; icon: LucideIcon; label: string }[] }) {
  return (
    <div role="group" className="inline-flex rounded-lg border border-border/70 overflow-hidden bg-input/40">
      {options.map(o => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}
          title={o.label}
          className={cn('talkx-glow-ring h-9 w-9 flex items-center justify-center transition-colors',
            o.value === value ? 'bg-primary/15 text-primary border-r border-primary/20 last:border-r-0' : 'text-muted-foreground hover:text-foreground border-r border-border/50 last:border-r-0'
          )}
        >
          <o.icon className="w-4 h-4" />
        </button>
      ))}
    </div>
  );
}
// Wrapper com glow + tone para PrimaryButton (E15)
export function TalkXPrimaryButton({ children, onClick, icon: Icon, tone = 'primary', glow = true, loading = false, disabled = false, size = 'md', className }: {
  children?: ReactNode; onClick?: () => void; icon?: LucideIcon;
  tone?: 'primary' | 'danger' | 'success'; glow?: boolean; loading?: boolean; disabled?: boolean;
  size?: 'sm' | 'md' | 'lg'; className?: string;
}) {
  const h = size === 'lg' ? 'h-11 px-5 text-sm' : size === 'sm' ? 'h-8 px-3 text-xs' : 'h-9 px-4 text-[13px]';
  const bg = tone === 'danger' ? 'bg-destructive hover:bg-destructive/90' : tone === 'success' ? 'bg-success hover:bg-success/90' : 'bg-primary hover:bg-primary/90';
  const shadow = glow && tone === 'primary' ? 'shadow-[var(--shadow-glow-primary)] hover:shadow-[var(--glow-primary-md)]' : '';
  return (
    <button type="button" onClick={onClick} disabled={disabled || loading}
      className={cn('talkx-glow-ring inline-flex items-center gap-2 rounded-lg text-white font-semibold transition-all shrink-0', h, bg, shadow, (disabled || loading) && 'opacity-70 cursor-not-allowed', className)}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : Icon && <Icon className="w-4 h-4" />}
      {children}
    </button>
  );
}
export function AlertCard({ children, tone = 'warning', actionLabel, onAction }: { children: ReactNode; tone?: 'warning' | 'info' | 'danger'; actionLabel?: string; onAction?: () => void }) {
  const s = tone === 'danger' ? 'bg-destructive/8 border-destructive/25 text-destructive' : tone === 'info' ? 'bg-primary/8 border-primary/25 text-primary' : 'bg-warning/8 border-warning/25 text-warning';
  return (
    <div className={cn('p-3 rounded-xl border text-xs leading-snug', s)}>
      {children}
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className="mt-2 underline font-semibold text-2xs">{actionLabel}</button>
      )}
    </div>
  );
}
