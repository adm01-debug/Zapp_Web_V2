import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Inbox, AlertTriangle, Database, Lock, RefreshCw, MessageSquare, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PrimaryButton, GhostButton } from '@/components/dashboard/overview/DashboardCard';

/* ------------------------------------------------------------------ */
/* Estados do sistema (prancha 17)                                    */
/* ------------------------------------------------------------------ */

function StateShell({ icon: Icon, tone, title, description, children }: { icon: LucideIcon; tone: 'muted' | 'danger' | 'warning' | 'success'; title: string; description?: string; children?: ReactNode }) {
  const ring = { muted: 'border-border/70 text-muted-foreground', danger: 'border-dash-red/50 text-dash-red', warning: 'border-dash-amber/50 text-dash-amber', success: 'border-dash-green/50 text-dash-green' }[tone];
  return (
    <div className="rounded-2xl border border-dashed border-border/70 bg-card/60 flex flex-col items-center justify-center text-center px-6 py-12 gap-3">
      <div className={cn('w-16 h-16 rounded-2xl border-2 flex items-center justify-center', ring)}><Icon className="w-7 h-7" /></div>
      <p className="text-[15px] font-bold text-foreground">{title}</p>
      {description && <p className="text-xs text-foreground-secondary max-w-sm leading-relaxed">{description}</p>}
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

