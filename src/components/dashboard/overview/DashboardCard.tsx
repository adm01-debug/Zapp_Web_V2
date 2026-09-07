import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface DashboardCardProps {
  children: ReactNode;
  className?: string;
  testid?: string;
}

export function DashboardCard({ children, className, testid }: DashboardCardProps) {
  return (
    <section
      data-testid={testid}
      className={cn(
        'rounded-xl bg-card border border-border/70 p-3.5 flex flex-col transition-all duration-150',
        'hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-8px_hsl(var(--primary)/.35)]',
        className,
      )}
    >
      {children}
    </section>
  );
}

interface SectionHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  tileSize: 44 | 34;
  right?: ReactNode;
}

export function SectionHeader({ icon: Icon, title, subtitle, tileSize, right }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <div
        data-testid="section-tile"
        className={cn(
          'rounded-[10px] bg-dash-tile-blue flex items-center justify-center shrink-0',
          tileSize === 44 ? 'w-11 h-11' : 'w-[34px] h-[34px]',
        )}
      >
        <Icon className={tileSize === 44 ? 'w-5 h-5 text-white/90' : 'w-4 h-4 text-white/90'} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold text-foreground truncate">{title}</p>
        {subtitle && <p className="text-[12px] text-foreground-secondary truncate">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

interface VerTodasButtonProps {
  onClick?: () => void;
}

export function VerTodasButton({ onClick }: VerTodasButtonProps) {
  return (
    <button
      type="button"
      data-testid="ver-todas"
      onClick={onClick}
      className="h-[26px] px-2.5 rounded-lg bg-muted/40 border border-border/60 text-[11px] font-medium text-foreground-secondary hover:bg-muted/60 flex items-center gap-1 shrink-0 transition-colors"
    >
      Ver todas
      <ArrowRight className="w-3 h-3" />
    </button>
  );
}

interface StatusChipProps {
  label: string;
  tone: 'success' | 'muted';
  pulse?: boolean;
}

export function StatusChip({ label, tone, pulse }: StatusChipProps) {
  return (
    <span
      className={cn(
        'h-[22px] px-2 rounded-md text-[11px] font-semibold flex items-center gap-1.5 shrink-0',
        tone === 'success' ? 'bg-success/15 border border-success/30 text-success' : 'bg-muted/40 border border-border/60 text-muted-foreground',
      )}
    >
      <span className="relative flex w-1.5 h-1.5">
        {pulse && tone === 'success' && (
          <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-60 animate-ping" />
        )}
        <span className={cn('relative inline-flex rounded-full w-1.5 h-1.5', tone === 'success' ? 'bg-success' : 'bg-muted-foreground')} />
      </span>
      {label}
    </span>
  );
}

interface CardSelectOption {
  value: string;
  label: string;
}

interface CardSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: CardSelectOption[];
  testid?: string;
}

export function CardSelect({ value, onValueChange, options, testid }: CardSelectProps) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger data-testid={testid} className="h-7 rounded-lg bg-input/60 border-border/60 text-[11px] font-medium w-auto gap-1.5">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
