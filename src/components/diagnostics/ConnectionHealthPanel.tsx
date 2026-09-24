import { useState, useCallback } from 'react';
import { useVisiblePolling } from '@/hooks/realtime/useVisiblePolling';
import { getLogger } from '@/lib/logger';

const log = getLogger('ConnectionHealthPanel');
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wifi, WifiOff, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  Clock, Activity, Loader2, HeartPulse, Zap, Timer,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ConnectionHealth {
  id: string;
  instance_id: string;
  status: string;
  phone_number: string | null;
  last_health_check: string | null;
  health_status: string | null;
  health_response_ms: number | null;
}

interface HealthLog {
  id: string;
  instance_id: string;
  status: string;
  response_time_ms: number | null;
  error_message: string | null;
  checked_at: string;
}

export function ConnectionHealthPanel() {
  const [connections, setConnections] = useState<ConnectionHealth[]>([]);
  const [recentLogs, setRecentLogs] = useState<HealthLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const fetchData = useCallback(async (signal: AbortSignal) => {
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
    try {
      const [{ data: conns, error: connectionsError }, { data: logs, error: logsError }] = await Promise.all([
        supabase
          .from('whatsapp_connections')
          .select('id, instance_id, status, phone_number, last_health_check, health_status, health_response_ms')
          .order('created_at', { ascending: false })
          .abortSignal(requestSignal),
        supabase
          .from('connection_health_logs')
          .select('id, instance_id, status, response_time_ms, error_message, checked_at')
          .order('checked_at', { ascending: false })
          .limit(50)
          .abortSignal(requestSignal),
      ]);

      if (requestSignal.aborted) return;
      if (!connectionsError && conns) setConnections(conns as ConnectionHealth[]);
      if (!logsError && logs) setRecentLogs(logs as HealthLog[]);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  // Refresh stored diagnostics only. Never invoke health-check automatically.
  const refresh = useVisiblePolling(fetchData);

  const runHealthCheck = async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke('connection-health-check');
      if (error) throw error;
      toast.success(`Health check concluído: ${data?.connections?.length || 0} conexões verificadas`);
      await refresh();
    } catch (err) {
      toast.error('Erro ao executar health check');
      log.error('Health check error:', err);
    } finally {
      setChecking(false);
    }
  };

  const statusConfig: Record<string, { icon: typeof CheckCircle2; color: string; label: string; bg: string }> = {
    healthy: { icon: CheckCircle2, color: 'text-success', label: 'Saudável', bg: 'bg-success/10' },
    degraded: { icon: AlertTriangle, color: 'text-warning', label: 'Degradado', bg: 'bg-warning/10' },
    disconnected: { icon: WifiOff, color: 'text-destructive', label: 'Desconectado', bg: 'bg-destructive/10' },
    error: { icon: XCircle, color: 'text-destructive', label: 'Erro', bg: 'bg-destructive/10' },
    timeout: { icon: Timer, color: 'text-warning', label: 'Timeout', bg: 'bg-warning/10' },
    unknown: { icon: Activity, color: 'text-muted-foreground', label: 'Desconhecido', bg: 'bg-muted/50' },
  };

  const healthyCount = connections.filter(c => c.health_status === 'healthy').length;
  const avgResponseTime = connections.length > 0
    ? Math.round(connections.reduce((sum, c) => sum + (c.health_response_ms || 0), 0) / connections.length)
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <HeartPulse className="w-4 h-4" />
              <span className="text-xs font-medium">Conexões Saudáveis</span>
            </div>
            <p className="text-2xl font-bold">{healthyCount}/{connections.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Zap className="w-4 h-4" />
              <span className="text-xs font-medium">Tempo Médio</span>
            </div>
            <p className="text-2xl font-bold">{avgResponseTime}ms</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Activity className="w-4 h-4" />
              <span className="text-xs font-medium">Checks (7d)</span>
            </div>
            <p className="text-2xl font-bold">{recentLogs.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-3 flex items-center justify-center">
            <Button onClick={runHealthCheck} disabled={checking} className="w-full gap-2">
              {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {checking ? 'Verificando...' : 'Executar Health Check'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Connection Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence>
          {connections.map((conn) => {
            const cfg = statusConfig[conn.health_status || 'unknown'] || statusConfig.unknown;
            const Icon = cfg.icon;
            return (
              <motion.div
                key={conn.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <Card className={cn('border-border/50 transition-all hover:shadow-md', cfg.bg)}>
                  <CardContent className="pt-4 pb-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Icon className={cn('w-5 h-5', cfg.color)} />
                          <span className="font-semibold text-sm">{conn.instance_id}</span>
                        </div>
                        {conn.phone_number && (
                          <p className="text-xs text-muted-foreground pl-7">{conn.phone_number}</p>
                        )}
                      </div>
                      <Badge variant="outline" className={cn('text-xs', cfg.color)}>
                        {cfg.label}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>
                          {conn.last_health_check
                            ? formatDistanceToNow(new Date(conn.last_health_check), { addSuffix: true, locale: ptBR })
                            : 'Nunca verificado'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        <span>{conn.health_response_ms ? `${conn.health_response_ms}ms` : '—'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        {conn.status === 'connected' && (
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                        )}
                        <span className={cn(
                          'relative inline-flex h-2 w-2 rounded-full',
                          conn.status === 'connected' ? 'bg-success' : 'bg-destructive'
                        )} />
                      </span>
                      <span className="text-xs text-muted-foreground capitalize">{conn.status}</span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Recent Logs */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Histórico de Health Checks
          </CardTitle>
          <CardDescription>Últimas 50 verificações</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px]">
            <div className="space-y-1.5">
              {recentLogs.map((log) => {
                const cfg = statusConfig[log.status] || statusConfig.unknown;
                const Icon = cfg.icon;
                return (
                  <div key={log.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 text-sm">
                    <Icon className={cn('w-4 h-4 flex-shrink-0', cfg.color)} />
                    <span className="font-medium min-w-[120px]">{log.instance_id}</span>
                    <Badge variant="outline" className={cn('text-3xs', cfg.color)}>
                      {cfg.label}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {log.response_time_ms ? `${log.response_time_ms}ms` : '—'}
                    </span>
                    {log.error_message && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <AlertTriangle className="w-3.5 h-3.5 text-warning cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-xs">{log.error_message}</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    <span className="text-muted-foreground text-xs ml-auto">
                      {format(new Date(log.checked_at), 'dd/MM HH:mm:ss', { locale: ptBR })}
                    </span>
                  </div>
                );
              })}
              {recentLogs.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">
                  Nenhum health check registrado. Execute uma verificação acima.
                </p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
