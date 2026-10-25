import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { WarRoomMetricCard } from './war-room/WarRoomMetricCard';
import { WarRoomQueueRow } from './war-room/WarRoomQueueRow';
import { WarRoomAlertRow } from './war-room/WarRoomAlertRow';
import { WarRoomAgentCard } from './war-room/WarRoomAgentCard';
import { AgentReassignmentPanel } from '@/components/inbox/AgentReassignmentPanel';

interface WarRoomDashboardProps {
  agents?: WarRoomAgent[];
  queues?: WarRoomQueue[];
  alerts?: WarRoomAlert[];
  onAgentClick?: (agentId: string) => void;
  onQueueClick?: (queueId: string) => void;
  onAlertDismiss?: (alertId: string) => void;
  className?: string;
}

export function WarRoomDashboard({
  agents: propsAgents, queues: propsQueues, alerts: propsAlerts,
  onAgentClick, onQueueClick, onAlertDismiss, className,
}: WarRoomDashboardProps) {
  const realData = useWarRoomData();
  const { settings, updateSettings } = useNotificationSettings();
  const agents = propsAgents || realData.agents;
  const queues = propsQueues || realData.queues;
  const { alerts: realtimeAlerts, dismissAlert } = useWarRoomAlerts(settings.soundEnabled);
  const allAlerts: WarRoomAlert[] = propsAlerts || realtimeAlerts.map(a => ({
    id: a.id, type: a.alert_type as 'critical' | 'warning' | 'info',
    title: a.title, message: a.message, timestamp: new Date(a.created_at), isNew: !a.is_read,
  }));

  const [locallyDismissed, setLocallyDismissed] = useState<Set<string>>(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const alerts = allAlerts.filter(a => !locallyDismissed.has(a.id));
  const globalMetrics = useWarRoomMetrics(agents, queues);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => setLastUpdate(new Date()), 30000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const hasCriticalAlerts = alerts.some(a => a.type === 'critical' && a.isNew);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      void document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleDismiss = async (alertId: string) => {
    setLocallyDismissed(prev => new Set([...prev, alertId]));
    onAlertDismiss?.(alertId);
    const result = await dismissAlert(alertId);
    if (result?.error) {
      setLocallyDismissed(prev => { const next = new Set(prev); next.delete(alertId); return next; });
      toast.error('Não foi possível dispensar o alerta');
    }
  };

  if (realData.isLoading) {
    return (
      <div role="status" aria-label="Carregando dados do War Room" className="space-y-4 w-full min-w-0">
        <div className="h-10 bg-muted/50 motion-safe:animate-pulse rounded-lg" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 bg-muted/50 motion-safe:animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (realData.isError) {
    return (
      <div role="alert" className="space-y-3 p-4 rounded-lg bg-destructive/10 text-destructive">
        <p className="font-medium">Não foi possível carregar o War Room</p>
        <p className="text-sm">{(realData.error as { message?: string } | null)?.message ?? String(realData.error)}</p>
        <Button variant="outline" onClick={() => void realData.refetch()}>Tentar de novo</Button>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4 bg-background w-full min-w-0", hasCriticalAlerts && "motion-safe:animate-pulse-subtle", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2"><Activity className="w-6 h-6 text-primary" /><h1 className="text-2xl font-bold">War Room</h1></div>
          <Badge variant="outline" className="gap-1"><span className="w-2 h-2 rounded-full bg-success motion-safe:animate-pulse" />Ao vivo</Badge>
          <span className="text-sm text-muted-foreground">Atualizado: {lastUpdate.toLocaleTimeString()}</span>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={settings.soundEnabled ? 'Desativar som de alertas' : 'Ativar som de alertas'}
                onClick={() => updateSettings({ soundEnabled: !settings.soundEnabled })}
              >
                {settings.soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Som de alertas</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={autoRefresh ? 'Pausar atualização automática' : 'Retomar atualização automática'}
                onClick={() => setAutoRefresh(!autoRefresh)}
              >
                <RefreshCw className={cn("w-4 h-4", autoRefresh && "motion-safe:animate-spin-slow")} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Auto-atualização</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={isFullscreen ? 'Sair da tela cheia' : 'Entrar em tela cheia'}
                onClick={toggleFullscreen}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Tela cheia</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <WarRoomMetricCard icon={Users} label="Na Fila" value={globalMetrics.totalWaiting} trend={globalMetrics.totalWaiting > 30 ? 'up' : 'stable'} alert={globalMetrics.totalWaiting > 50} />
        <WarRoomMetricCard icon={XCircle} label="SLA Violados" value={globalMetrics.totalBreaches} trend="up" alert={globalMetrics.totalBreaches > 5} critical={globalMetrics.totalBreaches > 10} />
        <WarRoomMetricCard icon={AlertTriangle} label="Em Risco" value={globalMetrics.totalWarnings ?? '—'} trend={globalMetrics.totalWarnings === null ? undefined : 'up'} alert={(globalMetrics.totalWarnings ?? 0) > 10} />
        <WarRoomMetricCard icon={Users} label="Agentes Online" value={globalMetrics.onlineAgents} suffix={`/${agents.length}`} trend="stable" />
        <WarRoomMetricCard icon={CheckCircle} label="Resolvidos Hoje" value={globalMetrics.totalResolved} trend="up" positive />
        <WarRoomMetricCard icon={TrendingUp} label="Satisfação" value={globalMetrics.avgSatisfaction.toFixed(1)} suffix="/5" trend="stable" positive />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3"><CardTitle className="text-lg flex items-center gap-2"><MessageSquare className="w-5 h-5" />Filas em Tempo Real</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {queues.length === 0
              ? <p className="text-sm text-muted-foreground text-center py-6">Sem filas no período</p>
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
          <CardContent
            role="log"
            aria-label="Alertas do War Room"
            aria-live={hasCriticalAlerts ? 'assertive' : 'polite'}
            className="space-y-2 max-h-80 overflow-auto"
          >
            {alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Sem alertas no período</p>
            ) : (
              <AnimatePresence>
                {alerts.map((alert) => (
                  <WarRoomAlertRow
                    key={alert.id}
                    alert={alert}
                    onDismiss={() => void handleDismiss(alert.id)}
                  />
                ))}
              </AnimatePresence>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3"><CardTitle className="text-lg flex items-center gap-2"><Users className="w-5 h-5" />Status dos Agentes</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {agents.length === 0
                ? <p className="text-sm text-muted-foreground text-center py-6 col-span-full">Sem agentes no período</p>
                : agents.map((agent) => <WarRoomAgentCard key={agent.id} agent={agent} onClick={() => onAgentClick?.(agent.id)} />)}
            </div>
          </CardContent>
        </Card>

        <AgentReassignmentPanel />
      </div>
    </div>
  );
}
