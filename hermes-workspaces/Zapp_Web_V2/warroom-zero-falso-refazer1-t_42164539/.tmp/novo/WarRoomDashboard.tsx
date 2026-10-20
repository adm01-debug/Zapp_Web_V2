import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useWarRoomAlerts } from '@/hooks/business/useWarRoomAlerts';
import { useNotificationSettings } from '@/hooks/system/useNotificationSettings';
import { useWarRoomData, useWarRoomMetrics } from '@/hooks/business/useWarRoomData';
import type { WarRoomAgent, WarRoomQueue, WarRoomAlert } from '@/hooks/business/useWarRoomData';
import {
  AlertTriangle, Clock, Users, MessageSquare, TrendingUp,
  CheckCircle, XCircle, Activity, Bell, Volume2,
  VolumeX, Maximize2, Minimize2, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { WarRoomMetricCard } from './war-room/WarRoomMetricCard';
import { WarRoomQueueRow } from './war-room/WarRoomQueueRow';
import { WarRoomAlertRow } from './war-room/WarRoomAlertRow';
import { WarRoomAgentCard } from './war-room/WarRoomAgentCard';
import { AgentReassignmentPanel } from '@/components/inbox/AgentReassignmentPanel';

const REFRESH_INTERVAL_MS = 30000;

interface WarRoomDashboardProps {
  agents?: WarRoomAgent[];
  queues?: WarRoomQueue[];
  alerts?: WarRoomAlert[];
  onAgentClick?: (agentId: string) => void;
  onQueueClick?: (queueId: string) => void;
  onAlertDismiss?: (alertId: string) => void;
  className?: string;
}

function LoadingRows({ rows }: { rows: number }) {
  return (
    <div className="space-y-3" data-testid="warroom-loading">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
    </div>
  );
}

export function WarRoomDashboard({
  agents: propsAgents, queues: propsQueues, alerts: propsAlerts,
  onAgentClick, onQueueClick, onAlertDismiss, className,
}: WarRoomDashboardProps) {
  // `autoRefresh` liga/desliga o polling de verdade: vira `refetchInterval` do hook, não
  // só um carimbo de hora na tela.
  const [autoRefresh, setAutoRefresh] = useState(true);
  const realData = useWarRoomData({ refetchInterval: autoRefresh ? REFRESH_INTERVAL_MS : false });
  const { settings, updateSettings } = useNotificationSettings();
  // Modo controlado por prop (teste/embed): aí carregando/erro do hook não se aplicam.
  const controlled = propsAgents !== undefined || propsQueues !== undefined;
  const agents = propsAgents ?? realData.agents;
  const queues = propsQueues ?? realData.queues;
  // Som do War Room obedece à preferência do painel (não a um `true` cravado).
  const { alerts: realtimeAlerts, dismissAlert } = useWarRoomAlerts(settings.soundEnabled);
  const alerts = propsAlerts ?? realtimeAlerts.map(a => ({
    id: a.id, type: a.alert_type as 'critical' | 'warning' | 'info',
    title: a.title, message: a.message, timestamp: new Date(a.created_at), isNew: !a.is_read,
  }));
  const [isFullscreen, setIsFullscreen] = useState(false);

  const isLoading = !controlled && realData.isLoading;
  const isError = !controlled && realData.isError;
  const { refetch } = realData;
  // O carimbo 'Atualizado' vem da última leitura de verdade (`dataUpdatedAt`), não de um timer.
  const lastUpdate = realData.dataUpdatedAt ? new Date(realData.dataUpdatedAt) : null;

  const globalMetrics = useWarRoomMetrics(agents, queues);
  const hasSatisfactionSample = agents.some(a => a.satisfaction !== null);

  // Esc fecha a tela cheia: antes o estado local ficava preso no 'true'.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const hasCriticalAlerts = alerts.some(a => a.type === 'critical' && a.isNew);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) { void document.documentElement.requestFullscreen(); setIsFullscreen(true); }
    else { void document.exitFullscreen(); setIsFullscreen(false); }
  };

  return (
    <div className={cn("space-y-4 bg-background w-full min-w-0", hasCriticalAlerts && "animate-pulse-subtle", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2"><Activity className="w-6 h-6 text-primary" /><h1 className="text-2xl font-bold">War Room</h1></div>
          <Badge variant="outline" className="gap-1"><span className="w-2 h-2 rounded-full bg-success motion-safe:animate-pulse" />Ao vivo</Badge>
          <span className="text-sm text-muted-foreground">Atualizado: {lastUpdate ? lastUpdate.toLocaleTimeString() : '—'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label="Som de alertas" aria-pressed={settings.soundEnabled} onClick={() => updateSettings({ soundEnabled: !settings.soundEnabled })}>{settings.soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}</Button></TooltipTrigger><TooltipContent>Som de alertas</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label="Atualizar agora" onClick={() => void refetch()}><RefreshCw className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>Atualizar agora</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label="Auto-atualização" aria-pressed={autoRefresh} onClick={() => setAutoRefresh(!autoRefresh)}><Clock className={cn("w-4 h-4", autoRefresh && "animate-spin-slow")} /></Button></TooltipTrigger><TooltipContent>Auto-atualização</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'} onClick={toggleFullscreen}>{isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}</Button></TooltipTrigger><TooltipContent>Tela cheia</TooltipContent></Tooltip>
        </div>
      </div>

      {isError ? (
        <Card className="border-destructive/50">
          <CardContent className="py-10 flex flex-col items-center gap-3 text-center">
            <AlertTriangle className="w-8 h-8 text-destructive" />
            <div className="text-sm font-medium">Não foi possível carregar o War Room.</div>
            <p className="text-xs text-muted-foreground max-w-md">Os números não estão medidos neste momento — uma leitura que falhou não é zero de atendimento.</p>
            <Button variant="outline" onClick={() => void refetch()}>Tentar de novo</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <WarRoomMetricCard icon={Users} label="Na Fila" value={globalMetrics.totalWaiting} trend={globalMetrics.totalWaiting > 30 ? 'up' : 'stable'} alert={globalMetrics.totalWaiting > 50} />
            <WarRoomMetricCard icon={XCircle} label="SLA Violados" value={globalMetrics.totalBreaches} trend="up" alert={globalMetrics.totalBreaches > 5} critical={globalMetrics.totalBreaches > 10} />
            <WarRoomMetricCard icon={AlertTriangle} label="Em Risco" value={globalMetrics.totalWarnings ?? '—'} trend={globalMetrics.totalWarnings === null ? undefined : 'up'} alert={(globalMetrics.totalWarnings ?? 0) > 10} />
            <WarRoomMetricCard icon={Users} label="Agentes Online" value={globalMetrics.onlineAgents} suffix={`/${agents.length}`} trend="stable" />
            <WarRoomMetricCard icon={CheckCircle} label="Resolvidos Hoje" value={globalMetrics.totalResolved} trend="up" positive />
            {/* Sem nenhuma avaliação no dia, a média é ausência de amostra: '—', não '0.0/5'. */}
            <WarRoomMetricCard icon={TrendingUp} label="Satisfação" value={hasSatisfactionSample ? globalMetrics.avgSatisfaction.toFixed(1) : '—'} suffix={hasSatisfactionSample ? '/5' : undefined} trend="stable" positive />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3"><CardTitle className="text-lg flex items-center gap-2"><MessageSquare className="w-5 h-5" />Filas em Tempo Real</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {isLoading
                  ? <LoadingRows rows={3} />
                  : queues.length === 0
                    ? <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma fila ativa</p>
                    : queues.map((queue) => <WarRoomQueueRow key={queue.id} queue={queue} onClick={() => onQueueClick?.(queue.id)} />)}
              </CardContent>
            </Card>

            <Card className={cn(hasCriticalAlerts && "border-destructive")}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bell className={cn("w-5 h-5", hasCriticalAlerts && "text-destructive motion-safe:animate-bounce")} />Alertas
                  {alerts.filter(a => a.isNew).length > 0 && <Badge variant="destructive" className="ml-auto">{alerts.filter(a => a.isNew).length} novos</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-80 overflow-auto">
                <AnimatePresence>
                  {alerts.map((alert) => <WarRoomAlertRow key={alert.id} alert={alert} onDismiss={() => { onAlertDismiss?.(alert.id); void dismissAlert(alert.id); }} />)}
                </AnimatePresence>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3"><CardTitle className="text-lg flex items-center gap-2"><Users className="w-5 h-5" />Status dos Agentes</CardTitle></CardHeader>
              <CardContent>
                {isLoading
                  ? <LoadingRows rows={3} />
                  : agents.length === 0
                    ? <p className="text-sm text-muted-foreground py-4 text-center">Nenhum agente ativo</p>
                    : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {agents.map((agent) => <WarRoomAgentCard key={agent.id} agent={agent} onClick={() => onAgentClick?.(agent.id)} />)}
                      </div>
                    )}
              </CardContent>
            </Card>

            <AgentReassignmentPanel />
          </div>
        </>
      )}
    </div>
  );
}
