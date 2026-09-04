import { useEffect, useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { motion, AnimatePresence } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Activity, Wifi, Webhook, RefreshCw, Stethoscope, Timer, Bell, BellOff, CalendarDays, BarChart3, Clock, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEvolutionMonitoring } from './hooks/useEvolutionMonitoring';
import type { TimePeriod } from './hooks/useEvolutionMonitoring';
import { MonitoringStatsCards } from './MonitoringStatsCards';
import { MonitoringMessageChart } from './MonitoringMessageChart';
import { MonitoringConnectionsList } from './MonitoringConnectionsList';
import { MonitoringWebhookPanel } from './MonitoringWebhookPanel';
import { MonitoringHealthLogs } from './MonitoringHealthLogs';
import { MonitoringDiagnosticPanel } from './MonitoringDiagnosticPanel';
import { MonitoringEventTimeline } from './MonitoringEventTimeline';
import { MonitoringAvailabilityHeatmap } from './MonitoringAvailabilityHeatmap';
import { MonitoringSLAPanel } from './MonitoringSLAPanel';
import { DashboardSkeleton } from './MonitoringSkeletons';

const PERIODS: { value: TimePeriod; label: string }[] = [
  { value: '1h', label: '1h' },
  { value: '6h', label: '6h' },
  { value: '12h', label: '12h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
];

function StatusSemaphore({ connections }: { connections: { status: string }[] }) {
  const all = connections.length;
  const active = connections.filter(c => c.status === 'connected').length;
  const color = active === all && all > 0 ? 'bg-emerald-500' : active > 0 ? 'bg-amber-500' : 'bg-destructive';
  const label = active === all && all > 0 ? 'Todas conectadas' : active > 0 ? 'Parcialmente conectado' : 'Sem conexões';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="relative flex h-3 w-3 cursor-default" role="status" aria-label={label}>
          <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-50', color)} />
          <span className={cn('relative inline-flex rounded-full h-3 w-3', color)} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">{label} ({active}/{all})</TooltipContent>
    </Tooltip>
  );
}

function LastUpdatedBadge() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="text-[10px] text-muted-foreground/60 tabular-nums hidden md:inline-flex items-center gap-1">
      <Clock className="w-3 h-3" />
      {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  );
}

export function EvolutionMonitoringDashboard() {
  const {
    connections, healthLogs, loading, refreshing, webhookTest, webhookConfig,
    messageStats, reconfiguring, diagnostic, diagnosing, uptime,
    sparklines, instanceUptimes, notificationsEnabled, soundEnabled, setSoundEnabled, requestNotifications,
    period, changePeriod, autoRefresh, setAutoRefresh, countdown,
    runHealthCheck, testWebhookDelivery, checkWebhookConfig, reconfigureWebhook,
    runDiagnostic,
  } = useEvolutionMonitoring();

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'r' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); runHealthCheck(); }
    if (e.key === '1') changePeriod('1h');
    if (e.key === '2') changePeriod('6h');
    if (e.key === '3') changePeriod('12h');
    if (e.key === '4') changePeriod('24h');
    if (e.key === '5') changePeriod('7d');
  }, [runHealthCheck, changePeriod]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (loading) return <DashboardSkeleton />;

  const activeConns = connections.filter(c => c.status === 'connected').length;
  const errLogs = healthLogs.filter(l => !['connected', 'healthy'].includes(l.status)).length;

  return (
    <div className="space-y-5 w-full min-w-0" role="main" aria-label="Painel de monitoramento Evolution API">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold">Monitor Evolution</h1>
              <StatusSemaphore connections={connections} />
              <LastUpdatedBadge />
            </div>
            <p className="text-sm text-muted-foreground">
              Status, webhook e health checks em tempo real
              <span className="hidden sm:inline text-[10px] ml-2 text-muted-foreground/60">[R] health check · [1-5] período</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap w-full sm:w-auto">
          {/* Period Selector */}
          <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5" role="radiogroup" aria-label="Período de tempo">
            {PERIODS.map(p => (
              <Button
                key={p.value}
                variant="ghost"
                size="sm"
                role="radio"
                aria-checked={period === p.value}
                className={cn('h-7 text-xs px-2.5 rounded-md', period === p.value && 'bg-background shadow-sm')}
                onClick={() => changePeriod(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>

          {/* Auto-refresh */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
            <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} className="scale-75" aria-label="Auto-refresh" />
            <div className="flex items-center gap-1">
              <Timer className="w-3 h-3" />
              {autoRefresh ? (
                <span className="tabular-nums w-6 text-center">{countdown}s</span>
              ) : (
                <span>Parado</span>
              )}
            </div>
          </div>

          {/* Sound Alert */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setSoundEnabled(!soundEnabled)}
                aria-label={soundEnabled ? 'Desativar som de alerta' : 'Ativar som de alerta'}
              >
                {soundEnabled
                  ? <Volume2 className="w-4 h-4 text-primary" />
                  : <VolumeX className="w-4 h-4 text-muted-foreground" />
                }
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">
              {soundEnabled ? 'Som de alerta ativado' : 'Ativar som de alerta'}
            </TooltipContent>
          </Tooltip>

          {/* Notifications */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={requestNotifications}
                aria-label={notificationsEnabled ? 'Notificações ativadas' : 'Ativar notificações'}
              >
                {notificationsEnabled
                  ? <Bell className="w-4 h-4 text-emerald-500" />
                  : <BellOff className="w-4 h-4 text-muted-foreground" />
                }
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">
              {notificationsEnabled ? 'Notificações ativadas' : 'Ativar notificações de desconexão'}
            </TooltipContent>
          </Tooltip>

          <Button onClick={runHealthCheck} disabled={refreshing} variant="outline" size="sm" aria-label="Executar health check">
            <RefreshCw className={cn('w-4 h-4 mr-2', refreshing && 'animate-spin')} />
            <span className="hidden xs:inline">{refreshing ? 'Verificando...' : 'Health Check'}</span>
          </Button>
        </div>
      </div>

      <MonitoringStatsCards connections={connections} messageStats={messageStats} uptime={uptime} sparklines={sparklines} />

      {/* Chart + Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div 
          className="lg:col-span-2"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
        >
          <MonitoringMessageChart messageStats={messageStats} period={period} />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
        >
          <MonitoringEventTimeline />
        </motion.div>
      </div>

      <Tabs defaultValue="connections" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="connections" className="gap-1.5">
            <Wifi className="w-4 h-4" />Conexões
            <Badge variant="secondary" className="h-5 min-w-5 px-1 text-[10px] rounded-full">{activeConns}/{connections.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="webhook" className="gap-1.5">
            <Webhook className="w-4 h-4" />Webhook
          </TabsTrigger>
          <TabsTrigger value="diagnostic" className="gap-1.5">
            <Stethoscope className="w-4 h-4" />Diagnóstico
            {diagnostic && (
              <Badge
                variant={diagnostic.overallHealth.score >= 80 ? 'default' : 'destructive'}
                className="h-5 min-w-5 px-1 text-[10px] rounded-full"
              >
                {diagnostic.overallHealth.score}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="sla" className="gap-1.5">
            <BarChart3 className="w-4 h-4" />SLA
            <Badge
              variant="outline"
              className={cn('h-5 min-w-5 px-1 text-[10px] rounded-full', uptime.percentage >= 99 ? 'text-emerald-500 border-emerald-500/30' : 'text-amber-500 border-amber-500/30')}
            >
              {uptime.percentage}%
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="heatmap" className="gap-1.5">
            <CalendarDays className="w-4 h-4" />Heatmap
          </TabsTrigger>
          <TabsTrigger value="health-logs" className="gap-1.5">
            <Activity className="w-4 h-4" />Logs
            {errLogs > 0 && (
              <Badge variant="destructive" className="h-5 min-w-5 px-1 text-[10px] rounded-full">{errLogs}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <AnimatePresence mode="wait">
          <TabsContent value="connections" key="connections">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <MonitoringConnectionsList
                connections={connections}
                webhookTest={webhookTest}
                onCheckWebhook={checkWebhookConfig}
                onTestWebhook={testWebhookDelivery}
              />
            </motion.div>
          </TabsContent>

          <TabsContent value="webhook" key="webhook">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <MonitoringWebhookPanel
                connections={connections}
                webhookTest={webhookTest}
                webhookConfig={webhookConfig}
                reconfiguring={reconfiguring}
                onTest={testWebhookDelivery}
                onReconfigure={reconfigureWebhook}
                onCheckConfig={checkWebhookConfig}
              />
            </motion.div>
          </TabsContent>

          <TabsContent value="diagnostic" key="diagnostic">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <MonitoringDiagnosticPanel
                diagnostic={diagnostic}
                diagnosing={diagnosing}
                onRunDiagnostic={runDiagnostic}
                onReconfigureWebhook={reconfigureWebhook}
                reconfiguring={reconfiguring}
              />
            </motion.div>
          </TabsContent>

          <TabsContent value="sla" key="sla">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <MonitoringSLAPanel uptime={uptime} instanceUptimes={instanceUptimes} />
            </motion.div>
          </TabsContent>

          <TabsContent value="heatmap" key="heatmap">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <MonitoringAvailabilityHeatmap healthLogs={healthLogs} />
            </motion.div>
          </TabsContent>

          <TabsContent value="health-logs" key="health-logs">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <MonitoringHealthLogs healthLogs={healthLogs} />
            </motion.div>
          </TabsContent>
        </AnimatePresence>
      </Tabs>
    </div>
  );
}
