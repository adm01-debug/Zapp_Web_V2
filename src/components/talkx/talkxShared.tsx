/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ChevronLeft, ChevronRight, ChevronRight as Chevron, Inbox, AlertTriangle, Database, Lock, Plus,
  RefreshCw, MessageSquare, Search,
} from 'lucide-react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

const tileBg: Record<TileColor, string> = {
  blue: 'bg-dash-tile-blue', red: 'bg-dash-tile-red', green: 'bg-dash-tile-green', violet: 'bg-dash-tile-violet', amber: 'bg-dash-tile-amber',
};

/** Tile quadrado com ícone (cabeçalhos de seção, itens do rail, tabela). */
export function IconTile({ icon: Icon, color = 'blue', size = 40, className }: { icon: LucideIcon; color?: TileColor; size?: 32 | 36 | 40 | 44 | 48 | 56; className?: string }) {
  const iconSize = size >= 48 ? 'w-6 h-6' : size >= 40 ? 'w-5 h-5' : 'w-4 h-4';
  return (
    <div style={{ width: size, height: size }} className={cn('rounded-xl flex items-center justify-center shrink-0', tileBg[color], className)}>
      <Icon className={cn(iconSize, 'text-white/90')} />
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
