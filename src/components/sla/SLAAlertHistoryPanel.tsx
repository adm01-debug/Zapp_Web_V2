import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useUserRole } from '@/hooks/system/useUserRole';
import {
  DEFAULT_SLA_ALERT_FILTERS,
  useSlaAlertEvents,
  type SlaAlertFilters,
  type SlaAlertStatusFilter,
} from '@/hooks/sla/useSlaAlertEvents';
import { slaAlertContactLabel } from './slaAlertLabels';
import {
  SLA_ALERT_SEVERITIES,
  SLA_ALERT_SEVERITY_LABELS,
  SLA_ALERT_TYPES,
  SLA_ALERT_TYPE_LABELS,
} from '@/hooks/sla/slaAlertPreferences';

const STATUS_LABELS: Record<SlaAlertStatusFilter, string> = {
  ativos: 'Abertos',
  resolvidos: 'Resolvidos',
  todos: 'Todos',
};

const quando = (iso: string): string =>
  formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });

/**
 * Histórico auditável dos alertas de SLA (`sla_alert_events`) com a resolução da supervisão.
 *
 * O registro é feito pelo monitor de SLA a cada risco/estouro detectado (`record_sla_alert`), então
 * esta lista é a trilha do que o sistema avisou — inclusive para quem desligou os avisos na própria
 * preferência. Resolver aqui fecha o ciclo (`resolve_sla_alert`, exclusivo de staff no servidor).
 */
export const SLAAlertHistoryPanel = () => {
  const [filters, setFilters] = useState<SlaAlertFilters>(DEFAULT_SLA_ALERT_FILTERS);
  const { alerts, isLoading, isError, refetch, resolve, resolvingId } = useSlaAlertEvents(filters);
  const { isSupervisor } = useUserRole();

  return (
    <Card className="p-5" data-testid="sla-alertas-painel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <ShieldAlert className="h-5 w-5 text-warning" />
            Alertas de SLA
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cada prazo em risco ou violado vira um registro auditável. Resolver um alerta registra quem
            fechou e quando.
          </p>
        </div>
        <ToggleGroup
          type="single"
          value={filters.status}
          onValueChange={(valor) => {
            if (!valor) return;
            setFilters((atual) => ({ ...atual, status: valor as SlaAlertStatusFilter }));
          }}
          className="rounded-lg bg-muted/50 p-1"
        >
          {(Object.keys(STATUS_LABELS) as SlaAlertStatusFilter[]).map((chave) => (
            <ToggleGroupItem key={chave} value={chave} className="px-3 text-xs">
              {STATUS_LABELS[chave]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="font-medium">Prazo</span>
          <ToggleGroup
            type="single"
            value={filters.type}
            onValueChange={(valor) => {
              if (!valor) return;
              setFilters((atual) => ({ ...atual, type: valor as SlaAlertFilters['type'] }));
            }}
            className="rounded-lg bg-muted/50 p-1"
          >
            <ToggleGroupItem value="todos" className="px-3 text-xs">Todos</ToggleGroupItem>
            {SLA_ALERT_TYPES.map((tipo) => (
              <ToggleGroupItem key={tipo} value={tipo} className="px-3 text-xs">
                {SLA_ALERT_TYPE_LABELS[tipo]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-medium">Severidade</span>
          <ToggleGroup
            type="single"
            value={filters.severity}
            onValueChange={(valor) => {
              if (!valor) return;
              setFilters((atual) => ({ ...atual, severity: valor as SlaAlertFilters['severity'] }));
            }}
            className="rounded-lg bg-muted/50 p-1"
          >
            <ToggleGroupItem value="todas" className="px-3 text-xs">Todas</ToggleGroupItem>
            {SLA_ALERT_SEVERITIES.map((severidade) => (
              <ToggleGroupItem key={severidade} value={severidade} className="px-3 text-xs">
                {SLA_ALERT_SEVERITY_LABELS[severidade]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-4 space-y-2" data-testid="sla-alertas-carregando">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : isError ? (
        <div className="mt-6 text-center" data-testid="sla-alertas-erro">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-destructive" />
          <h3 className="text-sm font-semibold text-foreground">
            Não foi possível carregar os alertas de SLA
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            A consulta falhou — isto não é ausência de alerta.
          </p>
          <Button variant="outline" className="mt-4 gap-2" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
            Tentar de novo
          </Button>
        </div>
      ) : alerts.length === 0 ? (
        <div className="mt-6 text-center" data-testid="sla-alertas-vazio">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-success" />
          <h3 className="text-sm font-semibold text-foreground">
            {filters.status === 'ativos'
              ? 'Nenhum alerta de SLA aberto'
              : 'Nenhum alerta de SLA registrado'}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {filters.status === 'ativos'
              ? 'Nenhum prazo em risco ou violado neste momento.'
              : 'Mude o filtro ou aguarde o monitor registrar um risco ou estouro de prazo.'}
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {alerts.map((alerta) => {
            const resolvendo = resolvingId === alerta.id;
            return (
              <li
                key={alerta.id}
                data-testid={`sla-alerta-${alerta.id}`}
                className="flex flex-col gap-2 rounded-xl border border-border/60 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-foreground">
                      {slaAlertContactLabel(alerta)}
                    </span>
                    <Badge variant="subtle">{SLA_ALERT_TYPE_LABELS[alerta.alertType]}</Badge>
                    <Badge variant={alerta.severity === 'breached' ? 'destructive' : 'warning'}>
                      {SLA_ALERT_SEVERITY_LABELS[alerta.severity]}
                    </Badge>
                    {alerta.resolvedAt ? (
                      <Badge variant="success">Resolvido</Badge>
                    ) : (
                      <Badge variant="outline">Aberto</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Registrado {quando(alerta.createdAt)}
                    {alerta.resolvedAt ? ` · resolvido ${quando(alerta.resolvedAt)}` : ''}
                  </p>
                </div>

                {alerta.resolvedAt ? null : isSupervisor ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2 self-start sm:self-auto"
                    disabled={resolvendo}
                    onClick={() => resolve(alerta.id)}
                  >
                    {resolvendo ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Resolver
                  </Button>
                ) : (
                  <span className="self-start text-xs text-muted-foreground sm:self-auto">
                    Só a supervisão resolve
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
};
