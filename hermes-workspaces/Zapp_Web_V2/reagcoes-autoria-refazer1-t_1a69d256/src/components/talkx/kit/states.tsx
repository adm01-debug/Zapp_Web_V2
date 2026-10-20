import { useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import {
  AlertTriangle, ClipboardList, Info, Copy, Database, DatabaseZap, ExternalLink, Filter,
  Inbox, Lock, MessageSquare, MoreVertical, Plus, RefreshCw, ServerCrash,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PrimaryButton, GhostButton } from '@/components/dashboard/overview/DashboardCard';

/* ------------------------------------------------------------------ */
/* Estados do sistema (prancha 17)                                    */
/* ------------------------------------------------------------------ */

type IconLike = ComponentType<{ className?: string }>;

export function StateShell({
  icon: Icon = Info, tone = 'muted', title, description, compact = false, children, footer,
}: {
  icon: IconLike;
  tone: 'muted' | 'danger' | 'warning' | 'success';
  title: string;
  description?: string;
  compact?: boolean;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const ring = {
    muted: 'border-border/70 text-muted-foreground',
    danger: 'border-dash-red/50 text-dash-red',
    warning: 'border-dash-amber/50 text-dash-amber',
    success: 'border-dash-green/50 text-dash-green',
  }[tone];
  const isError = tone === 'danger';
  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      className={cn(
        'rounded-2xl border border-dashed border-border/70 bg-card/60 flex flex-col items-center justify-center text-center gap-3',
        compact ? 'px-4 py-6' : 'px-6 py-12',
      )}
    >
      <div className={cn('rounded-2xl border-2 flex items-center justify-center', compact ? 'w-11 h-11' : 'w-16 h-16', ring)}>
        <Icon className={compact ? 'w-5 h-5' : 'w-7 h-7'} />
      </div>
      <p className={cn('font-bold text-foreground', compact ? 'text-sm' : 'text-[15px]')}>{title}</p>
      {description && <p className="text-xs text-foreground-secondary max-w-sm leading-relaxed">{description}</p>}
      {children && <div className="flex items-center gap-2 mt-1 flex-wrap justify-center">{children}</div>}
      {footer}
    </div>
  );
}

/* Logo do WhatsApp (SVG inline) — herda a cor via currentColor. */
export function WhatsAppLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

export function TalkXEmptyState({
  title, description, actionLabel, onAction, icon, preset, onClearFilters,
}: {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: IconLike;
  preset?: 'emptyCampaigns' | 'filtered';
  onClearFilters?: () => void;
}) {
  const isCampaigns = preset === 'emptyCampaigns';
  const isFiltered = preset === 'filtered';
  const resolvedIcon = isFiltered ? Filter : isCampaigns ? ClipboardList : icon ?? Inbox;
  const resolvedTitle = title ?? (isCampaigns ? 'Nenhuma campanha encontrada' : isFiltered ? 'Nenhum resultado encontrado' : '');
  const resolvedDescription = description ?? (isCampaigns
    ? 'Crie sua primeira campanha no Talk X e comece a se conectar com seus clientes.'
    : isFiltered ? 'Ajuste ou limpe os filtros para ver mais resultados.' : undefined);
  const resolvedActionLabel = actionLabel ?? (isCampaigns ? 'Nova Campanha' : undefined);
  const filteredClear = isFiltered ? onClearFilters : undefined;
  return (
    <StateShell icon={resolvedIcon} tone="muted" title={resolvedTitle} description={resolvedDescription}>
      {resolvedActionLabel && (onAction || isCampaigns) && (
        <PrimaryButton icon={Plus} onClick={onAction ?? (() => undefined)}>{resolvedActionLabel}</PrimaryButton>
      )}
      {filteredClear && <GhostButton icon={Filter} onClick={filteredClear}>Limpar filtros</GhostButton>}
    </StateShell>
  );
}

/** Vazio por filtro — sempre oferece "Limpar filtros". */
export function TalkXFilteredEmptyState({
  title = 'Nenhum resultado encontrado',
  description = 'Ajuste ou limpe os filtros para ver mais resultados.',
  onClearFilters,
}: {
  title?: string;
  description?: string;
  onClearFilters?: () => void;
}) {
  return (
    <StateShell icon={Filter} tone="muted" title={title} description={description}>
      {onClearFilters && <GhostButton icon={Filter} onClick={onClearFilters}>Limpar filtros</GhostButton>}
    </StateShell>
  );
}

export function TalkXErrorState({
  message, onRetry, entity, error, code,
}: {
  message?: string;
  onRetry?: () => void;
  entity?: string;
  error?: unknown;
  code?: string;
}) {
  const [open, setOpen] = useState(false);
  const title = entity ? `Não foi possível carregar as ${entity}` : 'Não foi possível carregar';
  const detail = message
    || (error instanceof Error ? error.message : typeof error === 'string' ? error : undefined)
    || 'Ocorreu um erro inesperado. Tente novamente em alguns instantes.';
  const rawCode = code ?? (error && typeof error === 'object' && (error as { code?: unknown }).code != null
    ? String((error as { code?: unknown }).code) : undefined);
  const when = new Date().toLocaleString('pt-BR');
  const copyText = `${detail}${rawCode ? `\nCódigo: ${rawCode}` : ''}\nHorário: ${when}`;
  return (
    <StateShell
      icon={AlertTriangle}
      tone="danger"
      title={title}
      description={error ? undefined : detail}
      footer={(
        <div className="w-full max-w-sm text-left">
          <button type="button" onClick={() => setOpen(!open)}
            className="cursor-pointer select-none text-xs font-semibold text-foreground-secondary hover:text-foreground inline-flex items-center gap-1.5">
            <ServerCrash className="w-3.5 h-3.5" /> Ver detalhes
          </button>
          {open && (
          <div className="mt-2 rounded-xl border border-border/70 bg-muted/30 p-3 space-y-1.5">
            <p className="text-xs text-foreground-secondary break-words">{detail}</p>
            {rawCode && <p className="text-2xs text-muted-foreground">Código: <span className="font-mono">{rawCode}</span></p>}
            <p className="text-2xs text-muted-foreground">Horário: {when}</p>
            <GhostButton icon={Copy} onClick={() => { void navigator.clipboard?.writeText(copyText); }}>Copiar</GhostButton>
          </div>
          )}
        </div>
      )}
    >
      {onRetry && <GhostButton icon={RefreshCw} onClick={onRetry}>Tentar novamente</GhostButton>}
    </StateShell>
  );
}

export function TalkXDataUnavailableState({ what = 'Os dados' }: { what?: string }) {
  return <StateShell icon={Database} tone="warning" title="Dados indisponíveis" description={`${what} estão temporariamente indisponíveis.`} />;
}

/** CRM 360 fora do ar. */
export function TalkXCrmUnavailableState({
  onViewStatus, description,
}: {
  onViewStatus?: () => void;
  description?: string;
}) {
  return (
    <StateShell
      icon={DatabaseZap}
      tone="warning"
      title="CRM 360 indisponível"
      description={description ?? 'Não foi possível conectar ao CRM 360. Alguns recursos podem estar limitados no momento.'}
    >
      {onViewStatus && <GhostButton icon={ExternalLink} onClick={onViewStatus}>Ver status dos serviços</GhostButton>}
    </StateShell>
  );
}

export function TalkXWhatsAppDisconnectedState({ onConnect }: { onConnect?: () => void }) {
  return (
    <StateShell
      icon={WhatsAppLogo}
      tone="danger"
      title="Conexão WhatsApp desconectada"
      description="Conecte sua conta para criar e enviar campanhas pelo Talk X."
    >
      {onConnect && <PrimaryButton icon={MessageSquare} onClick={onConnect}>Conectar WhatsApp</PrimaryButton>}
    </StateShell>
  );
}

export function TalkXNoPermissionState({
  onContactAdmin, title, description,
}: {
  onContactAdmin?: () => void;
  title?: string;
  description?: string;
}) {
  return (
    <StateShell
      icon={Lock}
      tone="muted"
      title={title ?? 'Você não tem permissão para acessar Campanhas'}
      description={description ?? 'Solicite acesso ao seu administrador para utilizar este módulo.'}
    >
      {onContactAdmin && <GhostButton icon={MessageSquare} onClick={onContactAdmin}>Falar com o administrador</GhostButton>}
    </StateShell>
  );
}

export function TalkXSkeletonRows({
  rows = 4, variant = 'rows',
}: {
  rows?: number;
  variant?: 'rows' | 'cards' | 'kpi' | 'rail';
}) {
  const n = Math.max(1, rows);
  if (variant === 'kpi') {
    return (
      <div aria-busy="true" className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-pulse">
        {Array.from({ length: n }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border/50 p-4 space-y-3">
            <div className="h-2.5 w-2/3 bg-muted/60 rounded" />
            <div className="h-6 w-1/2 bg-muted/60 rounded" />
          </div>
        ))}
      </div>
    );
  }
  if (variant === 'cards') {
    return (
      <div aria-busy="true" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-pulse">
        {Array.from({ length: n }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border/50 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-muted/60" />
              <div className="h-3 w-1/2 bg-muted/60 rounded" />
            </div>
            <div className="h-2.5 bg-muted/50 rounded w-2/3" />
            <div className="h-2.5 bg-muted/50 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }
  if (variant === 'rail') {
    return (
      <div aria-busy="true" className="flex gap-3 animate-pulse overflow-hidden">
        {Array.from({ length: n }).map((_, i) => (
          <div key={i} className="w-40 shrink-0 rounded-xl border border-border/50 p-3 space-y-2">
            <div className="h-3 w-2/3 bg-muted/60 rounded" />
            <div className="h-2.5 w-1/2 bg-muted/50 rounded" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div aria-busy="true" className="space-y-2 animate-pulse">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-border/50">
          <div className="w-9 h-9 rounded-lg bg-muted/60" />
          <div className="flex-1 space-y-2"><div className="h-3 bg-muted/60 rounded w-1/3" /><div className="h-2.5 bg-muted/50 rounded w-1/2" /></div>
          <MoreVertical className="w-4 h-4 text-muted-foreground/50 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** Estado vazio de um KPI sem valor. */
export function TalkXNoData({ hint }: { hint?: string } = {}) {
  return (
    <div
      className="bg-card border border-border/70 rounded-xl h-24 flex items-center justify-center text-muted-foreground"
      title={hint}
    >
      <span className="text-sm font-medium">Sem dados ainda</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* X047 — Boundary de consulta (prancha 17)                           */
/* ------------------------------------------------------------------ */

/** Subconjunto de estado de uma consulta (react-query ou compatível). */
export interface TalkXQueryLike {
  isLoading?: boolean;
  isFetching?: boolean;
  isError?: boolean;
  error?: Error | null;
}

export interface TalkXQueryBoundaryProps {
  /** Estado da consulta que alimenta o conteúdo. */
  query: TalkXQueryLike;
  /** Entidade no plural, ex.: 'campanhas' -> "Não foi possível carregar as campanhas". */
  entity: string;
  /** Dispara o refetch da consulta (botão "Tentar novamente" no erro). */
  onRetry?: () => void;
  /** Renderizado durante o carregamento inicial. */
  skeleton: ReactNode;
  /** Indica que o conteúdo resolvido está vazio. */
  isEmpty: boolean;
  /** Renderizado quando não há erro e o conteúdo está vazio. */
  empty: ReactNode;
  /** Conteúdo renderizado quando há dados. */
  children: ReactNode;
}

/**
 * Decide o que mostrar para uma consulta, nesta ordem:
 * carregando -> erro -> vazio -> conteúdo.
 *
 * REGRA CRÍTICA: nunca mostra o vazio quando há erro — se a consulta falhou,
 * mostra o erro (com retry), nunca "não há nada".
 */
export function TalkXQueryBoundary({
  query, entity, onRetry, skeleton, isEmpty, empty, children,
}: TalkXQueryBoundaryProps) {
  // 1. Carregando (primeira carga) — nunca é erro/vazio enquanto carrega.
  if (query.isLoading) {
    return (
      <div aria-busy="true" data-talkx-query="loading">
        {skeleton}
      </div>
    );
  }

  // 2. Erro — tem precedência sobre o vazio. Nunca mostra o vazio com erro.
  if (query.isError) {
    return <TalkXErrorState entity={entity} error={query.error} onRetry={onRetry} />;
  }

  // 3. Vazio (apenas quando NÃO há erro nem carregamento).
  if (isEmpty) {
    return <div data-talkx-query="empty">{empty}</div>;
  }

  // 4. Conteúdo — marca aria-busy quando há refetch em andamento.
  return (
    <div aria-busy={query.isFetching ? 'true' : undefined} data-talkx-query="content">
      {children}
    </div>
  );
}
