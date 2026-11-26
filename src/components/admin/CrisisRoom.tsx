import { useMemo } from 'react';
import {
  useCrisisRoomMetrics,
  CRISIS_THRESHOLDS,
  METRIC_LABELS,
  type CrisisMetricKey,
} from '@/hooks/business/useCrisisRoomMetrics';
import { useConnectionsHealth, type ConnectionHealth } from '@/hooks/connections/useConnectionsHealth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Users, Clock, MessageSquare, Siren, Smartphone } from 'lucide-react';
import { motion } from 'framer-motion';

interface CrisisMetric {
  label: string;
  /** `null` = não medido (não é "zero medido"). */
  value: number | null;
  threshold: number;
  unit: string;
  severity: 'ok' | 'warning' | 'critical' | 'unknown';
  icon: typeof AlertTriangle;
}

/** Ícone de cada métrica do agregado (`crisis_room_snapshot` devolve só os números). */
const METRIC_ICONS: Record<CrisisMetricKey, typeof AlertTriangle> = {
  unanswered_messages: MessageSquare,
  queue_ratio: Users,
  sla_breached: Clock,
  online_agents: Users,
};

/**
 * Cartões em "não medido" — enquanto não há agregado bom (primeira carga, permissão
 * negada, rede). Valor "—" com severidade `unknown`: zero NUNCA pode nascer de uma
 * leitura que falhou (PF-02), porque zero é uma medida legítima (operação calma).
 */
const SEM_MEDICAO: CrisisMetric[] = (Object.keys(CRISIS_THRESHOLDS) as CrisisMetricKey[]).map((key) => ({
  label: METRIC_LABELS[key].label,
  value: null,
  threshold: CRISIS_THRESHOLDS[key].attention,
  unit: METRIC_LABELS[key].unit,
  severity: 'unknown',
  icon: METRIC_ICONS[key],
}));

/**
 * Cartão "Canais no WhatsApp" — o eixo "canais ativos" do monitor de realtime
 * (paridade com o `ConnectionsHealthBlock` da `AdminRealtimeMonitorPage` da V3).
 *
 * Régua, com o número de conexões cadastradas como teto: TODAS conectadas = normal;
 * alguma fora do ar = atenção; NENHUMA conectada = crítico (a operação não recebe nem
 * envia). Sem conexão cadastrada — ou com a leitura pendente/falha — sai "não medido"
 * (—), como o estado vazio da V3: nem zero que parece medido, nem alarme falso.
 */
function connectionsMetric(
  connections: ConnectionHealth[],
  loading: boolean,
  error: string | null,
): CrisisMetric {
  const total = connections.length;
  const online = connections.filter((connection) => connection.healthy).length;
  const measured = !loading && !error && total > 0;
  return {
    label: 'Canais no WhatsApp',
    value: measured ? online : null,
    threshold: total,
    unit: 'online',
    severity: !measured ? 'unknown' : online === 0 ? 'critical' : online < total ? 'warning' : 'ok',
    icon: Smartphone,
  };
}

export function CrisisRoom() {
  // As quatro métricas de operação (pendências, carga, SLA e agentes online) vêm do
  // agregado `public.crisis_room_snapshot()`, medido no banco (R2-AUTH-036/PF-02).
  // Antes a tela somava 4 consultas soltas no navegador, cortadas em 1.000 linhas pelo
  // PostgREST e sem checar `.error` — falha de leitura virava zero e selo verde.
  const crisis = useCrisisRoomMetrics();
  // Estado global dos canais de WhatsApp: o app já mantém UMA assinatura de realtime
  // (`useConnectionsHealth`); a Sala de Crise lê esse estado em vez de abrir canal próprio.
  const connectionsHealth = useConnectionsHealth();

  // O que a tela mostra: as quatro métricas de operação + os canais de WhatsApp.
  const metrics = useMemo(
    () => [
      ...(crisis.metrics
        ? crisis.metrics.map((readout) => ({
            label: readout.label,
            value: readout.value,
            threshold: readout.attention,
            unit: readout.unit,
            severity: readout.severity,
            icon: METRIC_ICONS[readout.key],
          }))
        : SEM_MEDICAO),
      connectionsMetric(connectionsHealth.connections, connectionsHealth.loading, connectionsHealth.error),
    ],
    [crisis.metrics, connectionsHealth.connections, connectionsHealth.loading, connectionsHealth.error],
  );
  // Crise = alguma métrica crítica, derivada do que está na tela (inclui os canais).
  const isCrisis = useMemo(() => metrics.some((metric) => metric.severity === 'critical'), [metrics]);
  // Sem agregado bom: nem "Operação normal", nem cartão zerado.
  const semMedicao = !crisis.metrics;

  const severityConfig = {
    ok: { bg: 'bg-success/10', border: 'border-success/30', text: 'text-success', label: 'Normal' },
    warning: { bg: 'bg-warning/10', border: 'border-warning/30', text: 'text-warning', label: 'Atenção' },
    critical: { bg: 'bg-destructive/10', border: 'border-destructive/30', text: 'text-destructive', label: 'Crítico' },
    unknown: { bg: 'bg-muted/20', border: 'border-muted', text: 'text-muted-foreground', label: 'Sem medição' },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Siren className={`w-5 h-5 ${isCrisis ? 'text-destructive animate-pulse' : 'text-primary'}`} />
            Sala de Crise
          </h2>
          <p className="text-sm text-muted-foreground">Monitor em tempo real da operação</p>
        </div>
        <Badge variant={isCrisis ? 'destructive' : 'outline'} className="text-xs">
          {isCrisis ? '🔴 MODO CRISE ATIVO' : semMedicao ? '⚪ Sem medição' : '🟢 Operação normal'}
        </Badge>
      </div>

      {/* Overall status banner */}
      {isCrisis && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-center"
        >
          <AlertTriangle className="w-8 h-8 mx-auto text-destructive mb-2" />
          <p className="text-sm font-bold text-destructive">Operação em estado crítico!</p>
          <p className="text-xs text-muted-foreground mt-1">Uma ou mais métricas excederam limites aceitáveis</p>
        </motion.div>
      )}

      {/* Leitura falhou: os cartões ficam em "—" até o agregado voltar. */}
      {semMedicao && !crisis.isFirstLoad && (
        <div role="alert" className="p-3 rounded-xl bg-muted/40 border border-muted text-xs text-muted-foreground">
          Sem medição{crisis.error?.message ? `: ${crisis.error.message}` : ''}. Os cartões ficam em "—" até a
          leitura da operação voltar.
        </div>
      )}

      {crisis.isFirstLoad ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4,5].map(i => <div key={i} className="h-32 bg-muted/20 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map((m, idx) => {
            const cfg = severityConfig[m.severity];
            const Icon = m.icon;
            return (
              <motion.div key={m.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}>
                <Card className={`border ${cfg.border}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Icon className={`w-5 h-5 ${cfg.text}`} />
                      <Badge variant="outline" className={`text-3xs ${cfg.text}`}>
                        {cfg.label}
                      </Badge>
                    </div>
                    <div>
                      <p className={`text-3xl font-bold ${cfg.text}`}>{m.value ?? '—'}</p>
                      <p className="text-3xs text-muted-foreground">{m.label}</p>
                    </div>
                    <div className="text-3xs text-muted-foreground">
                      Limite: {m.threshold} {m.unit}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={crisis.refetch}
          disabled={crisis.isRefreshing}
          aria-busy={crisis.isRefreshing}
          className="text-xs"
        >
          🔄 Atualizar métricas
        </Button>
      </div>
    </div>
  );
}
