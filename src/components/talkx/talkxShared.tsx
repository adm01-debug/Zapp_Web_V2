/* eslint-disable react-refresh/only-export-components */
import React, { useState as _useState, useEffect as _useEffect } from 'react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ChevronLeft, ChevronRight, ChevronRight as Chevron, Inbox, AlertTriangle, Database, Lock, Plus,
  RefreshCw, MessageSquare, Search, MoreHorizontal, Loader2, Lightbulb, AlignJustify, LayoutGrid,
} from 'lucide-react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Pill, PrimaryButton, GhostButton } from '@/components/dashboard/overview/DashboardCard';

/* ------------------------------------------------------------------ */
/* Tipos                                                              */
/* ------------------------------------------------------------------ */

export type PillTone = 'success' | 'danger' | 'warning' | 'info' | 'violet' | 'muted';
export type TileColor = 'blue' | 'red' | 'green' | 'violet' | 'amber';

export const CAMPAIGN_STATUS: Record<string, { label: string; tone: PillTone }> = {
  draft: { label: 'Rascunho', tone: 'muted' },
  scheduled: { label: 'Agendada', tone: 'violet' },
  sending: { label: 'Em andamento', tone: 'info' },
  paused: { label: 'Pausada', tone: 'warning' },
  completed: { label: 'Concluída', tone: 'success' },
  cancelled: { label: 'Cancelada', tone: 'danger' },
};

export const RECIPIENT_STATUS: Record<string, { label: string; tone: PillTone }> = {
  pending: { label: 'Na fila', tone: 'muted' },
  sending: { label: 'Enviando', tone: 'info' },
  sent: { label: 'Enviada', tone: 'info' },
  delivered: { label: 'Entregue', tone: 'success' },
  failed: { label: 'Falha', tone: 'danger' },
  skipped: { label: 'Suprimido', tone: 'muted' },
};

export const OBJECTIVES = [
  { value: 'vendas', label: 'Vendas' },
  { value: 'engajamento', label: 'Engajamento' },
  { value: 'reativacao', label: 'Reativação' },
  { value: 'relacionamento', label: 'Relacionamento' },
  { value: 'pesquisa', label: 'Pesquisa' },
  { value: 'institucional', label: 'Institucional' },
] as const;

/** Perfis de velocidade → intervalo entre envios (segundos). Digitação fica com o editor. */
export const SPEED_PROFILES = [
  { value: 'slow', label: 'Lenta (mais segura)', interval: [15, 30] as [number, number] },
  { value: 'moderate', label: 'Moderada (recomendado)', interval: [8, 20] as [number, number] },
  { value: 'fast', label: 'Rápida', interval: [3, 8] as [number, number] },
] as const;

export const SUPPRESSION_ORIGIN: Record<string, { label: string; tone: PillTone }> = {
  manual: { label: 'Bloqueio manual', tone: 'warning' },
  optout: { label: 'Opt-out solicitado', tone: 'danger' },
  system: { label: 'Número inválido', tone: 'muted' },
  lgpd: { label: 'LGPD', tone: 'violet' },
  list: { label: 'Sem permissão comercial', tone: 'info' },
};

export const TEMPLATE_CATEGORIES = [
  'boas-vindas', 'vendas', 'promocao', 'follow-up', 'pos-venda', 'reativacao', 'catalogo', 'sazonal', 'financeiro', 'geral',
] as const;

export const TEMPLATE_STATUS: Record<string, { label: string; tone: PillTone }> = {
  draft: { label: 'Rascunho', tone: 'muted' },
  review: { label: 'Em revisão', tone: 'warning' },
  approved: { label: 'Aprovado', tone: 'success' },
};

export const VARIABLE_KEYS = ['{{nome}}', '{{nome_completo}}', '{{apelido}}', '{{empresa}}', '{{saudacao}}'] as const;

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

export const fmtInt = (n: number | null | undefined) => (n ?? 0).toLocaleString('pt-BR');
export const fmtPct = (num: number, den: number, digits = 1) =>
  den > 0 ? `${((num / den) * 100).toFixed(digits).replace('.', ',')}%` : '—';
export const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0);
export const fmtDateTime = (d: string | null | undefined) =>
  d ? format(new Date(d), "dd MMM yyyy, HH:mm", { locale: ptBR }) : '—';
export const fmtDate = (d: string | null | undefined) =>
  d ? format(new Date(d), 'dd/MM/yyyy', { locale: ptBR }) : '—';
export const fmtTime = (d: string | null | undefined) => (d ? format(new Date(d), 'HH:mm') : '—');
export const fmtAgo = (d: string | null | undefined) =>
  d ? formatDistanceToNowStrict(new Date(d), { locale: ptBR, addSuffix: true }) : '—';

export function personalizePreview(template: string, contact?: { name?: string | null; nickname?: string | null; company?: string | null } | null) {
  const c = contact ?? { name: 'João Silva', nickname: null, company: 'Sua Empresa' };
  const firstName = (c.name || '').split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  return template
    .replace(/\{\{nome\}\}/gi, firstName)
    .replace(/\{\{nome_completo\}\}/gi, c.name || '')
    .replace(/\{\{apelido\}\}/gi, c.nickname || firstName)
    .replace(/\{\{empresa\}\}/gi, c.company || '')
    .replace(/\{\{saudacao\}\}/gi, greeting);
}

export function extractVariables(template: string): string[] {
  const found = new Set<string>();
  for (const m of template.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)) found.add(`{{${m[1].toLowerCase()}}}`);
  return Array.from(found);
}

/** Estima duração (segundos) de uma campanha dado o nº de contatos e as médias de digitação/intervalo (ms). */
export function estimateSeconds(count: number, typingMin: number, typingMax: number, intervalMin: number, intervalMax: number) {
  return count * (((typingMin + typingMax) / 2 + (intervalMin + intervalMax) / 2) / 1000);
}
export function fmtDurationShort(seconds: number) {
  const m = Math.ceil(seconds / 60);
  if (m < 1) return '< 1 min';
  if (m < 60) return `~${m} min`;
  return `~${Math.floor(m / 60)}h ${m % 60 > 0 ? `${m % 60}min` : ''}`.trim();
}

/** Série de barras (sparkline) para os últimos `n` dias a partir de timestamps. */
export function barsByDay(dates: (string | null | undefined)[], n = 8): number[] {
  const now = new Date();
  const buckets = Array.from({ length: n }, () => 0);
  for (const d of dates) {
    if (!d) continue;
    const diff = Math.floor((now.getTime() - new Date(d).getTime()) / 86_400_000);
    if (diff >= 0 && diff < n) buckets[n - 1 - diff] += 1;
  }
  return buckets;
}

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
    <div style={{ width: size, height: size }} className={cn(soft || glow ? '' : '', bgCls, radiusCls, 'flex items-center justify-center shrink-0', className)}>
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
          <h1 className="text-[26px] leading-tight font-bold font-display text-foreground tracking-[-0.02em] truncate">{title}</h1>
          {subtitle && <p className="text-[13px] text-foreground-secondary mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="flex items-center gap-2 shrink-0 flex-wrap">{right}</div>}
    </div>
  );
}

/** Card do rail direito. */
export function RailCard({ icon, color = 'blue', title, subtitle, right, children, className, glow }: { icon?: LucideIcon; color?: TileColor; title: string; subtitle?: string; right?: ReactNode; children?: ReactNode; className?: string; glow?: boolean }) {
  return (
    <section className={cn('rounded-2xl bg-card border border-border/70 p-4 flex flex-col gap-3 min-w-0', glow && 'relative overflow-hidden', className)}>
      {glow && <div className="pointer-events-none absolute -top-16 -right-16 w-48 h-48 rounded-full bg-primary/15 blur-3xl" />}
      <div className="flex items-start gap-3 relative">
        {icon && <IconTile icon={icon} color={color} size={40} />}
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-foreground leading-tight">{title}</p>
          {subtitle && <p className="text-[12px] text-foreground-secondary mt-0.5 leading-snug">{subtitle}</p>}
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
        {subtitle && <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>}
      </div>
      <Chevron className="w-4 h-4 text-muted-foreground shrink-0" />
    </button>
  );
}

/** Linha de metadado (label à esquerda, valor à direita) para resumos. */
export function MetaRow({ icon: Icon, label, value, valueClassName }: { icon?: LucideIcon; label: string; value: ReactNode; valueClassName?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border/50 last:border-0">
      <span className="flex items-center gap-2 text-[12px] text-foreground-secondary shrink-0">
        {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
        {label}
      </span>
      <span className={cn('text-[12.5px] font-medium text-foreground text-right min-w-0 break-words', valueClassName)}>{value}</span>
    </div>
  );
}

/** Bolha de preview estilo WhatsApp (mensagem enviada). */
export function WhatsAppBubble({ text, mediaUrl, mediaType, time, senderName = 'Sua Empresa', className }: { text: string; mediaUrl?: string | null; mediaType?: string | null; time?: string; senderName?: string; className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-border/60 bg-[hsl(240_5%_7%)] overflow-hidden', className)}>
      <div className="flex items-center gap-2.5 px-3 py-2 border-b border-border/50 bg-card">
        <div className="w-8 h-8 rounded-full bg-whatsapp/20 flex items-center justify-center text-[11px] font-bold text-whatsapp">{senderName.slice(0, 1)}</div>
        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold text-foreground leading-tight truncate">{senderName}</p>
          <p className="text-[10.5px] text-whatsapp">online</p>
        </div>
      </div>
      <div className="p-3 bg-[radial-gradient(hsl(var(--primary)/.06)_1px,transparent_1px)] [background-size:14px_14px]">
        <div className="flex justify-center mb-2"><span className="text-[10px] px-2 py-0.5 rounded-md bg-muted/60 text-muted-foreground">Hoje</span></div>
        <div className="flex justify-end">
          <div className="max-w-[88%] rounded-2xl rounded-tr-sm bg-[hsl(150_45%_16%)] border border-whatsapp/25 px-3 py-2 text-[13px] text-foreground whitespace-pre-wrap leading-relaxed">
            {mediaUrl && mediaType === 'image' && <img src={mediaUrl} alt="" className="rounded-lg mb-2 max-h-40 w-full object-cover" loading="lazy" decoding="async" />}
            {mediaUrl && mediaType && mediaType !== 'image' && (
              <div className="rounded-lg mb-2 px-2.5 py-2 bg-black/20 text-[11px] text-muted-foreground">📎 {mediaType} anexado</div>
            )}
            {text || <span className="text-muted-foreground italic">Digite uma mensagem…</span>}
            <span className="block text-right text-[10px] text-muted-foreground mt-1">{time ?? format(new Date(), 'HH:mm')} ✓✓</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Barra de filtros: busca + selects + limpar. */
export interface FilterSelectDef { key: string; value: string; onChange: (v: string) => void; label: string; options: { value: string; label: string }[]; icon?: LucideIcon }
export function FilterBar({ search, onSearch, placeholder, selects, onClear, right }: { search: string; onSearch: (v: string) => void; placeholder: string; selects: FilterSelectDef[]; onClear?: () => void; right?: ReactNode }) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center gap-2">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => onSearch(e.target.value)} placeholder={placeholder} className="pl-9 h-9 text-[13px] bg-input/40 border-border/70 rounded-lg" />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {selects.map((s) => (
          <Select key={s.key} value={s.value} onValueChange={s.onChange}>
            <SelectTrigger className="h-9 rounded-lg bg-input/40 border-border/70 text-[12.5px] min-w-[140px] w-auto gap-2">
              {s.icon && <s.icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
              <SelectValue placeholder={s.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{s.label}</SelectItem>
              {s.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        ))}
        {onClear && (
          <button type="button" onClick={onClear} className="h-9 px-3 rounded-lg text-[12.5px] font-medium text-primary-glow hover:bg-primary/10 transition-colors">Limpar filtros</button>
        )}
        {right}
      </div>
    </div>
  );
}

/** Paginação estilo mockup: "Mostrando 1 a 8 de 24" + botões + tamanho da página. */
export function TalkXPagination({ page, pageSize, total, onPage, onPageSize, noun }: { page: number; pageSize: number; total: number; onPage: (p: number) => void; onPageSize: (n: number) => void; noun: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const visible = Array.from({ length: pages }, (_, i) => i + 1).filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 1);
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
      <p className="text-[12px] text-foreground-secondary">Mostrando {from} a {to} de {fmtInt(total)} {noun}</p>
      <div className="flex items-center gap-1.5">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="h-8 w-8 rounded-lg border border-border/70 bg-input/40 flex items-center justify-center disabled:opacity-40 hover:bg-muted/50"><ChevronLeft className="w-4 h-4" /></button>
        {visible.map((p, i) => (
          <span key={p} className="flex items-center gap-1.5">
            {i > 0 && visible[i - 1] !== p - 1 && <span className="text-muted-foreground text-xs px-1">…</span>}
            <button type="button" onClick={() => onPage(p)} className={cn('h-8 min-w-8 px-2 rounded-lg text-[12.5px] font-semibold border transition-colors', p === page ? 'bg-primary border-primary text-white' : 'border-border/70 bg-input/40 text-foreground-secondary hover:bg-muted/50')}>{p}</button>
          </span>
        ))}
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className="h-8 w-8 rounded-lg border border-border/70 bg-input/40 flex items-center justify-center disabled:opacity-40 hover:bg-muted/50"><ChevronRight className="w-4 h-4" /></button>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
          <SelectTrigger className="h-8 rounded-lg bg-input/40 border-border/70 text-[12px] w-auto gap-1.5 ml-2"><SelectValue /></SelectTrigger>
          <SelectContent>{[8, 10, 20, 50].map((n) => <SelectItem key={n} value={String(n)}>{n} por página</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </div>
  );
}

/** Cabeçalho de tabela padronizado. */
export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn('text-left text-[11.5px] font-semibold text-foreground-secondary px-3 py-2.5 whitespace-nowrap', className)}>{children}</th>;
}
export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn('px-3 py-3 text-[12.5px] text-foreground align-middle', className)}>{children}</td>;
}

export function StatusPill({ status, map }: { status: string; map: Record<string, { label: string; tone: PillTone }> }) {
  const m = map[status] ?? { label: status, tone: 'muted' as PillTone };
  return <Pill label={m.label} tone={m.tone} dot />;
}

/* ------------------------------------------------------------------ */
/* Estados do sistema (prancha 17)                                    */
/* ------------------------------------------------------------------ */

function StateShell({ icon: Icon, tone, title, description, children }: { icon: LucideIcon; tone: 'muted' | 'danger' | 'warning' | 'success'; title: string; description?: string; children?: ReactNode }) {
  const ring = { muted: 'border-border/70 text-muted-foreground', danger: 'border-dash-red/50 text-dash-red', warning: 'border-dash-amber/50 text-dash-amber', success: 'border-dash-green/50 text-dash-green' }[tone];
  return (
    <div className="rounded-2xl border border-dashed border-border/70 bg-card/60 flex flex-col items-center justify-center text-center px-6 py-12 gap-3">
      <div className={cn('w-16 h-16 rounded-2xl border-2 flex items-center justify-center', ring)}><Icon className="w-7 h-7" /></div>
      <p className="text-[15px] font-bold text-foreground">{title}</p>
      {description && <p className="text-[12.5px] text-foreground-secondary max-w-sm leading-relaxed">{description}</p>}
      {children && <div className="flex items-center gap-2 mt-1 flex-wrap justify-center">{children}</div>}
    </div>
  );
}

export function TalkXEmptyState({ title, description, actionLabel, onAction, icon = Inbox }: { title: string; description?: string; actionLabel?: string; onAction?: () => void; icon?: LucideIcon }) {
  return (
    <StateShell icon={icon} tone="muted" title={title} description={description}>
      {actionLabel && onAction && <PrimaryButton icon={Plus} onClick={onAction}>{actionLabel}</PrimaryButton>}
    </StateShell>
  );
}

export function TalkXErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <StateShell icon={AlertTriangle} tone="danger" title="Não foi possível carregar" description={message || 'Ocorreu um erro inesperado. Tente novamente em alguns instantes.'}>
      {onRetry && <GhostButton icon={RefreshCw} onClick={onRetry}>Tentar novamente</GhostButton>}
    </StateShell>
  );
}

export function TalkXDataUnavailableState({ what = 'Os dados' }: { what?: string }) {
  return <StateShell icon={Database} tone="warning" title="Dados indisponíveis" description={`${what} estão temporariamente indisponíveis.`} />;
}

export function TalkXWhatsAppDisconnectedState({ onConnect }: { onConnect?: () => void }) {
  return (
    <StateShell icon={MessageSquare} tone="danger" title="Conexão WhatsApp desconectada" description="Conecte sua conta para criar e enviar campanhas pelo Talk X.">
      {onConnect && <PrimaryButton icon={MessageSquare} onClick={onConnect}>Conectar WhatsApp</PrimaryButton>}
    </StateShell>
  );
}

export function TalkXNoPermissionState() {
  return <StateShell icon={Lock} tone="muted" title="Você não tem permissão para acessar Campanhas" description="Solicite acesso ao seu administrador para utilizar este módulo." />;
}

export function TalkXSkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-border/50">
          <div className="w-9 h-9 rounded-lg bg-muted/60" />
          <div className="flex-1 space-y-2"><div className="h-3 bg-muted/60 rounded w-1/3" /><div className="h-2.5 bg-muted/50 rounded w-1/2" /></div>
          <div className="w-16 h-5 rounded-full bg-muted/50" />
        </div>
      ))}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
// E13 — KpiCard: card de métrica hero com mini-barras e delta
// ═══════════════════════════════════════════════════════════════
interface KpiCardProps {
  icon: LucideIcon; color?: TileColor; label: string; value: string;
  delta?: { value: number; suffix?: '%' | 'p.p.'; tone?: 'up' | 'down' };
  bars?: number[]; // 7 valores reais (% de altura relativa 0-100)
  hint?: string;
  index?: number; // para delay de animação
}

export function KpiCard({ icon, color = 'blue', label, value, delta, bars, hint, index = 0 }: KpiCardProps) {
  const maxBar = bars ? Math.max(...bars, 1) : 1;
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
        <p className="text-[11.5px] font-medium text-muted-foreground leading-none mb-1 uppercase tracking-wide truncate">{label}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-[22px] font-semibold tracking-tight text-foreground leading-none">{value}</span>
          {delta && (
            <span className={cn('flex items-center gap-0.5 text-[11px] font-semibold', delta.tone === 'down' ? 'text-destructive' : 'text-success')}>
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

export function KpiCardSkeleton() {
  return <div className="bg-card border border-border/70 rounded-xl h-24 animate-pulse" />;
}

// ═══════════════════════════════════════════════════════════════
// E15 — RowActionsMenu, SegmentedToggle, PrimaryButtonGlow
// ═══════════════════════════════════════════════════════════════
export interface RowAction { label: string; icon?: LucideIcon; onSelect: () => void; danger?: boolean; disabled?: boolean; }

export function RowActionsMenu({ actions, label = 'Ações' }: { actions: RowAction[]; label?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button" aria-label={label}
          className="talkx-glow-ring inline-flex items-center justify-center w-8 h-8 rounded-lg border border-border/60 bg-input/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        {actions.map((a, i) => (
          <DropdownMenuItem key={i} onClick={a.disabled ? undefined : a.onSelect} disabled={a.disabled}
            className={cn(a.danger && !a.disabled && 'text-destructive focus:text-destructive focus:bg-destructive/10')}
          >
            {a.icon && <a.icon className="w-3.5 h-3.5 mr-2 opacity-70" />} {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
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
export function TalkXPrimaryButton({ children, onClick, icon: Icon, tone = 'primary', glow = true, loading = false, size = 'md', className }: {
  children?: ReactNode; onClick?: () => void; icon?: LucideIcon;
  tone?: 'primary' | 'danger' | 'success'; glow?: boolean; loading?: boolean;
  size?: 'sm' | 'md' | 'lg'; className?: string;
}) {
  const h = size === 'lg' ? 'h-11 px-5 text-[14px]' : size === 'sm' ? 'h-8 px-3 text-[12px]' : 'h-9 px-4 text-[13px]';
  const bg = tone === 'danger' ? 'bg-destructive hover:bg-destructive/90' : tone === 'success' ? 'bg-success hover:bg-success/90' : 'bg-primary hover:bg-primary/90';
  const shadow = glow && tone === 'primary' ? 'shadow-[var(--shadow-glow-primary)] hover:shadow-[var(--glow-primary-md)]' : '';
  return (
    <button type="button" onClick={onClick} disabled={loading}
      className={cn('talkx-glow-ring inline-flex items-center gap-2 rounded-lg text-white font-semibold transition-all shrink-0', h, bg, shadow, loading && 'opacity-70 cursor-not-allowed', className)}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : Icon && <Icon className="w-4 h-4" />}
      {children}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════
// E17 — TalkXTable genérico
// ═══════════════════════════════════════════════════════════════
export interface TalkXColumn<T> {
  key: string; header: string; width?: string | number; align?: 'left' | 'center' | 'right';
  render: (row: T, idx: number) => ReactNode;
}

export function TalkXTable<T extends object>({
  columns, rows, getId, selectable = false, selected, onSelectionChange, stickyHeader = false, emptyState, className,
}: {
  columns: TalkXColumn<T>[]; rows: T[]; getId: (row: T) => string;
  selectable?: boolean; selected?: Set<string>; onSelectionChange?: (s: Set<string>) => void;
  stickyHeader?: boolean; emptyState?: ReactNode; className?: string;
}) {
  const allSelected = rows.length > 0 && selected && rows.every(r => selected.has(getId(r)));
  const someSelected = selected && rows.some(r => selected.has(getId(r))) && !allSelected;

  const toggleAll = () => {
    if (!onSelectionChange || !selected) return;
    const n = new Set(selected);
    if (allSelected) { rows.forEach(r => n.delete(getId(r))); } else { rows.forEach(r => n.add(getId(r))); }
    onSelectionChange(n);
  };
  const toggleRow = (id: string) => {
    if (!onSelectionChange || !selected) return;
    const n = new Set(selected);
    if (n.has(id)) n.delete(id); else n.add(id);
    onSelectionChange(n);
  };

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="talkx-table">
        <thead className={stickyHeader ? 'sticky top-0 bg-card z-10' : ''}>
          <tr>
            {selectable && (
              <th style={{ width: 44 }} className="pl-3">
                <input type="checkbox" checked={!!allSelected} ref={el => { if (el) el.indeterminate = !!someSelected; }}
                  onChange={toggleAll} className="w-3.5 h-3.5 accent-primary cursor-pointer" aria-label="Selecionar tudo" />
              </th>
            )}
            {columns.map(col => (
              <th key={col.key} style={col.width ? { width: col.width } : undefined}
                className={cn(col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left')}
              >{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length + (selectable ? 1 : 0)} className="h-32 text-center text-muted-foreground text-sm">{emptyState ?? 'Nenhum resultado.'}</td></tr>
          ) : rows.map((row, idx) => {
            const id = getId(row);
            const isSelected = selected?.has(id);
            return (
              <tr key={id} className={isSelected ? 'bg-primary/5' : ''}>
                {selectable && (
                  <td className="pl-3">
                    <input type="checkbox" checked={!!isSelected} onChange={() => toggleRow(id)}
                      className="w-3.5 h-3.5 accent-primary cursor-pointer" aria-label={`Selecionar ${id}`} />
                  </td>
                )}
                {columns.map(col => (
                  <td key={col.key} className={cn(col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : '')}>
                    {col.render(row, idx)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// E18 — Rail: HeroCard, RecentList, TipCard, AlertCard
// ═══════════════════════════════════════════════════════════════
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
          {subtitle && <p className="text-[12px] text-muted-foreground mt-0.5 leading-snug">{subtitle}</p>}
        </div>
      </div>
      {metrics && metrics.length > 0 && (
        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border/40">
          {metrics.map((m, i) => (
            <div key={i} className="text-center">
              <p className="text-[15px] font-bold text-foreground">{m.value}</p>
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{m.label}</p>
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
            <p className="text-[12.5px] font-medium text-foreground truncate">{item.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={cn('inline-flex h-1.5 w-1.5 rounded-full', item.statusTone === 'success' ? 'bg-success' : item.statusTone === 'warning' ? 'bg-warning' : 'bg-muted-foreground')} />
              <span className="text-[11px] text-muted-foreground">{item.statusLabel}{item.pct !== undefined ? ` · ${item.pct}%` : ''}</span>
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
        <p className="text-[11px] font-semibold text-success uppercase tracking-wide mb-0.5">Dica do dia</p>
        <p className="text-[12px] text-foreground leading-snug">{tip}</p>
      </div>
    </div>
  );
}

export function AlertCard({ children, tone = 'warning', actionLabel, onAction }: { children: ReactNode; tone?: 'warning' | 'info' | 'danger'; actionLabel?: string; onAction?: () => void }) {
  const s = tone === 'danger' ? 'bg-destructive/8 border-destructive/25 text-destructive' : tone === 'info' ? 'bg-primary/8 border-primary/25 text-primary' : 'bg-warning/8 border-warning/25 text-warning';
  return (
    <div className={cn('p-3 rounded-xl border text-[12px] leading-snug', s)}>
      {children}
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className="mt-2 underline font-semibold text-[11px]">{actionLabel}</button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// E19 — TalkXConfirmDialog: modal crítico com checks opcionais
// ═══════════════════════════════════════════════════════════════
export interface ConfirmCheck { id: string; label: string; }

export function TalkXConfirmDialog({ open, onClose, onConfirm, icon, iconColor = 'blue', title, description, entityName, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', tone = 'primary', checks = [], details = [], loading = false }: {
  open: boolean; onClose: () => void; onConfirm: () => void;
  icon: LucideIcon; iconColor?: TileColor; title: string; description: string;
  entityName?: string; confirmLabel?: string; cancelLabel?: string;
  tone?: 'primary' | 'danger' | 'success' | 'violet'; checks?: ConfirmCheck[];
  details?: { label: string; value: string }[]; loading?: boolean;
}) {
  const [checked, setChecked] = React.useState<Set<string>>(new Set());
  const allChecked = checks.length === 0 || checks.every(c => checked.has(c.id));
  const toneStyle = { danger: 'bg-destructive text-white', success: 'bg-success text-white', violet: 'bg-violet-600 text-white', primary: '' }[tone];

  const toggle = (id: string) => {
    const n = new Set(checked);
    if (n.has(id)) n.delete(id); else n.add(id);
    setChecked(n);
  };

  // Reset ao fechar
  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => { if (!open) setChecked(new Set()); }, [open]);

  return (
    <AlertDialog open={open} onOpenChange={v => !v && onClose()}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex flex-col items-center gap-3 pb-2">
            <IconTile icon={icon} color={iconColor} size={48} glow />
            <AlertDialogTitle className="text-center text-[17px]">{title}</AlertDialogTitle>
            <AlertDialogDescription className="text-center text-[13px]">
              {entityName ? <><span className="font-semibold text-foreground">"{entityName}"</span> — </> : null}{description}
            </AlertDialogDescription>
          </div>
        </AlertDialogHeader>

        {details.length > 0 && (
          <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 -mt-1">
            {details.map(d => (
              <div key={d.label} className="flex justify-between text-[12.5px]">
                <span className="text-muted-foreground">{d.label}</span>
                <span className="font-medium text-foreground">{d.value}</span>
              </div>
            ))}
          </div>
        )}

        {checks.length > 0 && (
          <div className="space-y-2 py-1">
            {checks.map(c => (
              <label key={c.id} className="flex items-start gap-2.5 cursor-pointer group">
                <input type="checkbox" checked={checked.has(c.id)} onChange={() => toggle(c.id)}
                  className="mt-0.5 w-4 h-4 accent-primary cursor-pointer rounded" />
                <span className="text-[12.5px] text-foreground leading-snug group-hover:text-foreground">{c.label}</span>
              </label>
            ))}
          </div>
        )}

        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel onClick={onClose} className="h-9 text-[13px]">{cancelLabel}</AlertDialogCancel>
          <TalkXPrimaryButton tone={tone === 'danger' ? 'danger' : tone === 'success' ? 'success' : 'primary'}
            glow={tone !== 'danger'} loading={loading} onClick={onConfirm}
            className={cn('h-9 text-[13px]', !allChecked && 'opacity-40 cursor-not-allowed')}
          >
            {confirmLabel}
          </TalkXPrimaryButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}


// E16 — FilterBarV2: busca debounced + selects + labeled + toggle
export interface FilterOption { value: string; label: string; }
export interface FilterDefinition { key: string; label: string; options: FilterOption[]; icon?: LucideIcon; labeled?: boolean; }

export function FilterBarV2({
  search, onSearch, placeholder = 'Buscar...', filters = [], values, onFilter, onClear, hasActive,
  view, onView, rightSlot,
}: {
  search?: string; onSearch?: (s: string) => void; placeholder?: string;
  filters?: FilterDefinition[]; values?: Record<string, string>; onFilter?: (key: string, val: string) => void;
  onClear?: () => void; hasActive?: boolean;
  view?: 'list' | 'grid'; onView?: (v: 'list' | 'grid') => void;
  rightSlot?: ReactNode;
}) {
  const [local, setLocal] = _useState(search ?? '');
  // eslint-disable-next-line react-hooks/set-state-in-effect
  _useEffect(() => { setLocal(search ?? ''); }, [search]);
  _useEffect(() => {
    if (!onSearch) return;
    const t = setTimeout(() => onSearch(local), 250);
    return () => clearTimeout(t);
  }, [local, onSearch]);
  return (
    <div className='flex flex-col gap-2'>
      <div className='flex flex-wrap items-center gap-2'>
        {onSearch !== undefined && (
          <div className='relative'>
            <Search className='absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none' />
            <Input value={local} onChange={e => setLocal(e.target.value)} placeholder={placeholder}
              className='h-9 pl-8 pr-3 w-52 text-[12.5px] bg-input/40 border-border/70 rounded-lg' />
          </div>
        )}
        {filters.map(fd => (
          <div key={fd.key} className='flex flex-col'>
            {fd.labeled && <label className='text-[10px] font-medium text-muted-foreground mb-0.5 px-0.5 uppercase tracking-wide'>{fd.label}</label>}
            <Select value={values?.[fd.key] ?? 'all'} onValueChange={v => onFilter?.(fd.key, v)}>
              <SelectTrigger className='h-9 text-[12.5px] bg-input/40 border-border/70 rounded-lg min-w-[120px]'>
                <SelectValue placeholder={!fd.labeled ? fd.label : undefined} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>Todos</SelectItem>
                {fd.options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ))}
        {hasActive && onClear && (
          <button type='button' onClick={onClear} className='h-9 px-3 rounded-lg text-[12.5px] font-medium text-primary hover:bg-primary/10 transition-colors'>
            Limpar filtros
          </button>
        )}
        <div className='ml-auto flex items-center gap-2'>
          {rightSlot}
          {onView && (
            <SegmentedToggle value={view ?? 'list'} onChange={onView}
              options={[{value:'list' as const,icon:AlignJustify,label:'Lista'},{value:'grid' as const,icon:LayoutGrid,label:'Grade'}]} />
          )}
        </div>
      </div>
    </div>
  );
}
