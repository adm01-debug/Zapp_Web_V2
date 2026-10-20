import { AlertTriangle, Wifi, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { ConnectionHealth } from '@/hooks/connections/useConnectionsHealth';

/**
 * Cabeçalho compacto de saúde das conexões do WhatsApp na tela de Atendentes.
 *
 * Espelha o `ConnectionsHeader` da V3 (`agents-ops/ConnectionsHeader`): uma visão
 * rápida de conectado / instável / desconectado, sem abrir a tela de Conexões.
 * A fonte é a da própria V2 — `useConnectionsHealth`, o store global que já lê
 * `whatsapp_connections` (uma única inscrição de realtime, compartilhada) — então o
 * cabeçalho NÃO abre consulta nova.
 */

type Tone = 'success' | 'warning' | 'destructive';

interface StatusVisual {
  label: string;
  tone: Tone;
  Icon: typeof Wifi;
}

/** Mesma régua do `ConnectionCard` (V2): só "connected" é saudável; em progresso é instável. */
function connectionStatusVisual(status: string): StatusVisual {
  const s = (status ?? '').toLowerCase();
  if (s === 'connected') return { label: 'Conectado', tone: 'success', Icon: Wifi };
  if (['connecting', 'pending', 'qr_pending', 'degraded', 'unstable'].includes(s)) {
    return { label: 'Instável', tone: 'warning', Icon: AlertTriangle };
  }
  return { label: 'Desconectado', tone: 'destructive', Icon: WifiOff };
}

const toneText: Record<Tone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
};

export interface ConnectionsHeaderProps {
  connections: ConnectionHealth[];
  loading: boolean;
  error: string | null;
}

export function ConnectionsHeader({ connections, loading, error }: ConnectionsHeaderProps) {
  const total = connections.length;
  const connectedCount = connections.filter((connection) => connection.healthy).length;
  const troubledCount = total - connectedCount;

  return (
    <section
      aria-label="Saúde das conexões do WhatsApp"
      className="rounded-xl border border-secondary/20 bg-card p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          Conexões WhatsApp
        </h2>
        {!loading && !error && total > 0 && (
          <p className="text-xs text-muted-foreground">
            <span className={cn('font-medium', troubledCount > 0 ? 'text-warning' : 'text-success')}>
              {connectedCount} de {total}
            </span>{' '}
            {connectedCount === 1 ? 'conectada' : 'conectadas'}
            {troubledCount > 0 && ` — ${troubledCount} com problema`}
          </p>
        )}
      </div>

      <div className="mt-2">
        {loading ? (
          <p className="text-xs text-muted-foreground" role="status">
            Carregando conexões…
          </p>
        ) : error ? (
          <p className="text-xs text-destructive" role="alert">
            Não foi possível carregar as conexões do WhatsApp.
          </p>
        ) : total === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma conexão de WhatsApp cadastrada.</p>
        ) : (
          <ul className="flex flex-wrap gap-2" aria-label="Conexões do WhatsApp">
            {connections.map((connection) => {
              const visual = connectionStatusVisual(connection.status);
              const Icon = visual.Icon;
              return (
                <li
                  key={connection.id}
                  className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/50 px-2.5 py-1.5 text-xs"
                >
                  <Icon
                    className={cn('h-3.5 w-3.5 shrink-0', toneText[visual.tone])}
                    aria-hidden="true"
                  />
                  <span
                    className="font-medium text-foreground truncate max-w-[160px]"
                    title={connection.name || connection.instanceId || undefined}
                  >
                    {connection.instanceId ?? connection.name}
                  </span>
                  <Badge variant={visual.tone} className="text-3xs">
                    {visual.label}
                  </Badge>
                  {connection.isDefault && (
                    <span className="text-3xs text-muted-foreground">Padrão</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
