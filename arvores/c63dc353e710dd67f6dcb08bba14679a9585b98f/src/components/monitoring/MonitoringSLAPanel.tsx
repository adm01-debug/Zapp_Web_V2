import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Shield, Clock, Zap, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { InstanceUptime, UptimeInfo } from './hooks/useEvolutionMonitoring';

interface Props {
  uptime: UptimeInfo;
  instanceUptimes: InstanceUptime[];
}

const SLA_TARGET = 99.5;

function SLAGauge({ value, target }: { value: number; target: number }) {
  const met = value >= target;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">SLA Global</span>
        <Badge variant={met ? 'default' : 'destructive'} className="text-xs">
          {met ? '✅ Atingido' : '⚠️ Abaixo da meta'}
        </Badge>
      </div>
      <div className="flex items-end gap-3">
        <motion.span
          className={cn('text-4xl font-bold tabular-nums', met ? 'text-emerald-500' : 'text-destructive')}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
          {value}%
        </motion.span>
        <span className="text-sm text-muted-foreground mb-1">meta: {target}%</span>
      </div>
      <Progress
        value={Math.min(value, 100)}
        className={cn('h-2', met ? '[&>div]:bg-emerald-500' : '[&>div]:bg-destructive')}
      />
    </div>
  );
}

export function MonitoringSLAPanel({ uptime, instanceUptimes }: Props) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            SLA & Métricas de Disponibilidade
          </CardTitle>
          <CardDescription>Uptime global e por instância nas últimas 24 horas</CardDescription>
        </CardHeader>
        <CardContent>
          <SLAGauge value={uptime.percentage} target={SLA_TARGET} />

          <div className="grid grid-cols-3 gap-4 mt-5">
            <div className="p-3 rounded-lg bg-muted/30 text-center">
              <TrendingUp className="w-4 h-4 mx-auto text-emerald-500 mb-1" />
              <p className="text-xl font-bold">{uptime.healthyChecks}</p>
              <p className="text-3xs text-muted-foreground">Checks OK</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 text-center">
              <Clock className="w-4 h-4 mx-auto text-primary mb-1" />
              <p className="text-xl font-bold">{uptime.totalChecks}</p>
              <p className="text-3xs text-muted-foreground">Total Checks</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 text-center">
              <Zap className="w-4 h-4 mx-auto text-amber-500 mb-1" />
              <p className="text-xl font-bold">{uptime.totalChecks - uptime.healthyChecks}</p>
              <p className="text-3xs text-muted-foreground">Falhas</p>
            </div>
          </div>

          {uptime.lastDowntime && (
            <div className="mt-3 p-2.5 rounded-lg bg-destructive/5 text-xs">
              <span className="text-muted-foreground">Última falha: </span>
              <span className="font-medium">
                {formatDistanceToNow(new Date(uptime.lastDowntime), { addSuffix: true, locale: ptBR })}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-instance cards */}
      {instanceUptimes.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {instanceUptimes.map((inst, i) => {
            const met = inst.percentage >= SLA_TARGET;
            return (
              <motion.div
                key={inst.instanceId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className="border-border/60">
                  <CardContent className="pt-4 pb-3 px-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-semibold text-sm">{inst.instanceId}</span>
                      <Badge
                        variant={met ? 'default' : 'destructive'}
                        className={cn('text-3xs', met && 'bg-emerald-500/80 hover:bg-emerald-500/70')}
                      >
                        {inst.percentage}%
                      </Badge>
                    </div>
                    <Progress
                      value={Math.min(inst.percentage, 100)}
                      className={cn('h-1.5 mb-3', met ? '[&>div]:bg-emerald-500' : '[&>div]:bg-destructive')}
                    />
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-sm font-bold">{inst.healthyChecks}/{inst.totalChecks}</p>
                        <p className="text-3xs text-muted-foreground">Checks OK</p>
                      </div>
                      <div>
                        <p className={cn(
                          'text-sm font-bold',
                          inst.avgLatency < 300 ? 'text-emerald-500' :
                          inst.avgLatency < 800 ? 'text-amber-500' : 'text-destructive'
                        )}>
                          {inst.avgLatency}ms
                        </p>
                        <p className="text-3xs text-muted-foreground">Latência</p>
                      </div>
                      <div>
                        <p className="text-sm font-bold">{inst.totalChecks - inst.healthyChecks}</p>
                        <p className="text-3xs text-muted-foreground">Falhas</p>
                      </div>
                    </div>
                    {inst.lastError && (
                      <p className="text-3xs text-destructive mt-2 truncate">⚠️ {inst.lastError}</p>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
