import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, AlertCircle, CheckCircle2, Clock, RefreshCw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  useConnectionIncidents,
  type ActiveAlert,
  type ConnectionIncident,
  type ConnectionUptime,
} from './hooks/useConnectionIncidents';

/**
 * Meta de disponibilidade da janela de 24 h — o MESMO alvo do painel de SLA
 * (`MonitoringSLAPanel`), para o card não anunciar aprovação com régua própria.
 */
const UPTIME_TARGET = 99.5;

/** Duração legível, sem depender de locale: s → min → h. */
function formatDuration(ms: number): string {
  const safe = Math.max(0, ms);
  if (safe < 60_000) return `${Math.round(safe / 1000)} s`;
  if (safe < 3_600_000) return `${Math.round(safe / 60_000)} min`;
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.round((safe % 3_600_000) / 60_000);
  return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
}

function relative(timestamp: string): string {
  return formatDistanceToNow(new Date(timestamp), { addSuffix: true, locale: ptBR });
}

const severityLabel: Record<ActiveAlert['severity'], string> = {
  critical: 'Crítico',
  warning: 'Atenção',
};

function ActiveAlertRow({ alert }: { alert: ActiveAlert }) {
  const critical = alert.severity === 'critical';
  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border',
        critical ? 'border-destructive/30 bg-destructive/5' : 'border-amber-500/30 bg-amber-500/5',
      )}
    >
      {critical
        ? <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
        : <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">{alert.instanceId}</span>
          <Badge variant={critical ? 'destructive' : 'outline'} className={cn('text-3xs', !critical && 'text-amber-600 border-amber-500/40')}>
            {alert.title}
          </Badge>
          <span className="text-3xs text-muted-foreground">{severityLabel[alert.severity]}</span>
        </div>
        <p className="text-2xs text-muted-foreground mt-1">Fora do ar desde {relative(alert.since)}</p>
      </div>
    </div>
  );
}

function UptimeRow({ item }: { item: ConnectionUptime }) {
  // R2-INF-027: sem checks na janela não há uptime a aprovar — "dado insuficiente", nunca 100%.
  const unknown = item.percentage === null;
  const met = !unknown && item.percentage! >= UPTIME_TARGET;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-sm truncate">{item.instanceId}</span>
        {unknown ? (
          <Badge variant="outline" className="text-3xs text-muted-foreground">Dado insuficiente</Badge>
        ) : (
          <Badge
            variant={met ? 'default' : 'destructive'}
            className={cn('text-3xs tabular-nums', met && 'bg-emerald-500/80 hover:bg-emerald-500/70')}
          >
            {item.percentage}%
          </Badge>
        )}
      </div>
      <Progress
        value={unknown ? 0 : Math.min(item.percentage!, 100)}
        aria-label={`Uptime de ${item.instanceId}`}
        className={cn(
          'h-1.5',
          unknown ? '[&>div]:bg-muted-foreground' : met ? '[&>div]:bg-emerald-500' : '[&>div]:bg-destructive',
        )}
      />
      <p className="text-3xs text-muted-foreground">
        {unknown
          ? 'Nenhum check nas últimas 24 h'
          : `${item.healthyChecks}/${item.totalChecks} checks saudáveis`}
      </p>
    </div>
  );
}

function IncidentRow({ incident }: { incident: ConnectionIncident }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{incident.instanceId}</span>
          {incident.ongoing ? (
            <Badge variant="destructive" className="text-3xs">Em aberto</Badge>
          ) : (
            <Badge variant="outline" className="text-3xs gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />Resolvido
            </Badge>
          )}
          <span className="text-3xs text-muted-foreground tabular-nums">{incident.checks} check(s)</span>
        </div>
        <p className="text-2xs text-muted-foreground mt-1">
          Início {relative(incident.startedAt)} · duração {formatDuration(incident.durationMs)}
        </p>
        {incident.cause && (
          <p className="text-2xs text-destructive mt-1 break-words">Causa: {incident.cause}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Painel de incidentes e uptime das conexões (janela de 24 h), derivado de
 * `connection_health_logs` pelo `useConnectionIncidents`. Sem realtime e sem
 * service externo: um botão de atualização recarrega a mesma janela.
 */
export function MonitoringIncidents() {
  const { uptime, incidents, activeAlerts, loading, error, truncated, lastUpdated, refresh } =
    useConnectionIncidents();

  const hasData = uptime.length > 0 || incidents.length > 0 || activeAlerts.length > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Incidentes e disponibilidade
            </CardTitle>
            <CardDescription>
              Uptime, incidentes e alertas ativos das conexões nas últimas 24 horas
              {truncated && <span className="text-amber-500"> · janela parcial (limite de registros de health check)</span>}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            disabled={loading}
            aria-label="Atualizar incidentes"
          >
            {loading
              ? <Loader2 className="w-3.5 h-3.5 motion-safe:animate-spin" />
              : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
        </div>
        {lastUpdated && !loading && !error && (
          <p className="text-3xs text-muted-foreground tabular-nums">
            Atualizado {relative(lastUpdated.toISOString())}
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-5">
        {error && (
          <div role="alert" className="p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading && !hasData && (
          <div role="status" aria-label="Carregando incidentes" className="py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="w-5 h-5 mx-auto mb-2 motion-safe:animate-spin" />
            Carregando incidentes…
          </div>
        )}

        {!loading && !error && !hasData && (
          <div className="py-8 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-500/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Sem incidentes nas últimas 24 horas.</p>
          </div>
        )}

        {activeAlerts.length > 0 && (
          <section role="status" aria-live="polite" aria-label="Alertas ativos" className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Alertas ativos ({activeAlerts.length})
            </h3>
            {activeAlerts.map((alert) => <ActiveAlertRow key={alert.id} alert={alert} />)}
          </section>
        )}

        {uptime.length > 0 && (
          <section aria-label="Uptime de 24 horas" className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Uptime 24 h por conexão
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              {uptime.map((item) => <UptimeRow key={item.connectionId} item={item} />)}
            </div>
          </section>
        )}

        {incidents.length > 0 && (
          <section aria-label="Histórico de incidentes" className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Incidentes ({incidents.length})
            </h3>
            <motion.div
              className="space-y-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              {incidents.map((incident) => <IncidentRow key={incident.id} incident={incident} />)}
            </motion.div>
          </section>
        )}

        {uptime.length === 0 && incidents.length === 0 && activeAlerts.length > 0 && (
          <p className="text-2xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />Sem checks suficientes na janela para calcular o uptime.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
