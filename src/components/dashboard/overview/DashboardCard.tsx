import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface DashboardCardProps {
  /** Handler de clique — opcional; quando presente, o card vira clicável (cursor-pointer). */
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  testid?: string;
  /** Posição na grade — só usada para o pequeno stagger do fade de entrada (máx 12 itens). */
  index?: number;
  /** 'dense' (padrão, Visão Geral: rounded-xl p-3.5) ou 'comfortable' (abas/mockups: rounded-2xl p-5). */
  variant?: 'dense' | 'comfortable';
}

export function DashboardCard({ children, className, testid, index = 0, onClick, variant = 'dense' }: DashboardCardProps) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.section
      data-testid={testid}
      onClick={onClick}
        className={cn(onClick && 'cursor-pointer',
        'min-w-0 bg-card border border-border/70 flex flex-col transition-all duration-150',
        variant === 'comfortable' ? 'rounded-2xl p-5' : 'rounded-xl p-3.5',
        'hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-8px_hsl(var(--primary)/.35)]',
        className,
      )}
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, delay: Math.min(index, 12) * 0.02 }}
    >
      {children}
    </motion.section>
  );
}

const sectionTileColor = {
  blue: 'bg-dash-tile-blue',
  red: 'bg-dash-tile-red',
  green: 'bg-dash-tile-green',
  violet: 'bg-dash-tile-violet',
  amber: 'bg-dash-tile-amber',
} as const;

interface SectionHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  tileSize: 44 | 34;
  right?: ReactNode;
  /** 'md' (padrão, 15px) ou 'lg' (mockups das abas: 18px + subtítulo 13px, tile rounded-xl). */
  size?: 'md' | 'lg';
  /** Cor do tile — padrão azul. Mockup "Alertas recentes de sentimento" usa vermelho. */
  tileColor?: keyof typeof sectionTileColor;
  /** Ícone em cor sólida sem tile (mockup "Destaque do dia" ★ amarelo). */
  iconClassName?: string;
}

export function SectionHeader({ icon: Icon, title, subtitle, tileSize, right, size = 'md', tileColor = 'blue', iconClassName }: SectionHeaderProps) {
  const lg = size === 'lg';
  return (
    <div className={cn('flex items-center gap-3', lg ? 'mb-4' : 'mb-2')}>
      {iconClassName ? (
        <Icon className={cn('shrink-0', tileSize === 44 ? 'w-6 h-6' : 'w-5 h-5', iconClassName)} />
      ) : (
        <div
          data-testid="section-tile"
          className={cn(
            'flex items-center justify-center shrink-0',
            lg ? 'rounded-xl' : 'rounded-[10px]',
            sectionTileColor[tileColor],
            tileSize === 44 ? 'w-11 h-11' : 'w-[34px] h-[34px]',
          )}
        >
          <Icon className={tileSize === 44 ? 'w-5 h-5 text-white/90' : 'w-4 h-4 text-white/90'} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className={cn('font-bold text-foreground truncate', lg ? 'text-[18px] tracking-[-0.01em]' : 'text-[15px]')}>{title}</p>
        {subtitle && <p className={cn('text-foreground-secondary truncate', lg ? 'text-[13px] mt-0.5' : 'text-[12px]')}>{subtitle}</p>}
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
  const reducedMotion = useReducedMotion();
  return (
    <span
      className={cn(
        'h-[22px] px-2 rounded-md text-[11px] font-semibold flex items-center gap-1.5 shrink-0',
        tone === 'success' ? 'bg-success/15 border border-success/30 text-success' : 'bg-muted/40 border border-border/60 text-muted-foreground',
      )}
    >
      <span className="relative flex w-1.5 h-1.5">
        {pulse && tone === 'success' && !reducedMotion && (
          <motion.span
            className="absolute inline-flex h-full w-full rounded-full bg-success"
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{ scale: 1.6, opacity: 0 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
          />
        )}
        <span
        className={cn('relative inline-flex rounded-full w-1.5 h-1.5', tone === 'success' ? 'bg-success' : 'bg-muted-foreground')} />
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


/* ------------------------------------------------------------------ */
/* Primitivos adicionais para as abas (mockups): pill, avatar, botões  */
/* ------------------------------------------------------------------ */

const pillTone = {
  success: 'bg-dash-green/15 text-dash-green',
  danger: 'bg-dash-red/15 text-dash-red',
  warning: 'bg-dash-amber/15 text-dash-amber',
  info: 'bg-primary/15 text-primary-glow',
  violet: 'bg-dash-violet/15 text-dash-violet',
  muted: 'bg-muted/60 text-muted-foreground',
} as const;

interface PillProps {
  label: string;
  tone: keyof typeof pillTone;
  /** dot colorido à esquerda (mockup "● Ativo") */
  dot?: boolean;
  className?: string;
}

/** Pill de status/tipo dos mockups: h-6 rounded-full text-12 font-semibold, fundo 15% + texto na cor. */
export function Pill({ label, tone, dot, className }: PillProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[12px] font-semibold whitespace-nowrap', pillTone[tone], className)}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {label}
    </span>
  );
}

const avatarHue = ['bg-dash-tile-blue', 'bg-dash-tile-green', 'bg-dash-tile-violet', 'bg-dash-tile-amber', 'bg-dash-tile-red'] as const;

interface InitialsAvatarProps {
  name: string;
  size?: 24 | 28 | 32 | 36 | 44 | 56;
  src?: string | null;
  className?: string;
}

/** Avatar circular com iniciais em cor estável por nome (mockups: JS, MA, CR…). */
export function InitialsAvatar({ name, size = 32, src, className }: InitialsAvatarProps) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const bg = avatarHue[h % avatarHue.length];
  const font = size >= 44 ? 'text-[18px]' : size >= 32 ? 'text-[12px]' : 'text-[10px]';
  if (src) {
    return <img src={src} alt={name} style={{ width: size, height: size }} className={cn('rounded-full object-cover shrink-0', className)} />;
  }
  return (
    <span
      style={{ width: size, height: size }}
      className={cn('rounded-full flex items-center justify-center font-bold text-white shrink-0', bg, font, className)}
      aria-label={name}
    >
      {initials}
    </span>
  );
}

interface PrimaryButtonProps {
  children: ReactNode;
  onClick?: () => void;
  icon?: LucideIcon;
  className?: string;
  testid?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Usa semântica nativa para impedir ações inválidas, inclusive por teclado. */
  disabled?: boolean;
}

/** Botão azul sólido dos mockups ("+ Novo Relatório", "+ Novo SLA", "Selecionar outro período"). */
export function PrimaryButton({ children, onClick, icon: Icon, className, testid, size = 'md', disabled = false }: PrimaryButtonProps) {
  const h = size === 'lg' ? 'h-11 px-5 text-[14px]' : size === 'sm' ? 'h-8 px-3 text-[12px]' : 'h-9 px-4 text-[13px]';
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={onClick}
      disabled={disabled}
      className={cn('inline-flex items-center gap-2 rounded-lg bg-primary text-white font-semibold hover:bg-primary/90 transition-colors shrink-0 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50', h, className)}
    >
      {Icon && <Icon className="w-4 h-4" />}
      {children}
    </button>
  );
}

interface GhostButtonProps {
  children?: ReactNode;
  onClick?: () => void;
  icon?: LucideIcon;
  className?: string;
  title?: string;
  size?: 'sm' | 'md';
}

/** Botão bordado dos mockups ("Exportar", ícone download, chevron circular). */
export function GhostButton({ children, onClick, icon: Icon, className, title, size = 'md' }: GhostButtonProps) {
  const h = size === 'sm' ? 'h-8 text-[12px]' : 'h-9 text-[13px]';
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn('inline-flex items-center gap-2 rounded-lg border border-border/70 bg-input/40 text-foreground font-medium hover:bg-muted/50 transition-colors shrink-0', h, children ? 'px-3.5' : 'w-9 justify-center', className)}
    >
      {Icon && <Icon className="w-4 h-4" />}
      {children}
    </button>
  );
}

/** Barra de progresso fina dos mockups (h-1.5/h-2, fundo muted, fill colorido). */
export function ProgressBar({ value, tone = 'info', className, height = 6 }: { value: number; tone?: keyof typeof pillTone; className?: string; height?: 4 | 6 | 8 }) {
  const fill = { success: 'bg-dash-green', danger: 'bg-dash-red', warning: 'bg-dash-amber', info: 'bg-primary', violet: 'bg-dash-violet', muted: 'bg-muted-foreground' }[tone];
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('w-full rounded-full bg-muted/50 overflow-hidden', className)} style={{ height }}>
      <div className={cn('h-full rounded-full transition-[width] duration-500', fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}
