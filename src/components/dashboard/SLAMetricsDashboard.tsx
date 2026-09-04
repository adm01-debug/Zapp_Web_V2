import { lazy, Suspense, useState } from 'react';
const SLAConfigurationManager = lazy(() => import('@/components/settings/SLAConfigurationManager').then(m => ({ default: m.SLAConfigurationManager })));
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion } from '@/components/ui/motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Clock, CheckCircle2, AlertTriangle, XCircle, Users, TrendingUp, Target, RefreshCw, Calendar } from 'lucide-react';
import { GenericEmptyState } from '@/components/ui/GenericEmptyState';
import { cn } from '@/lib/utils';
import { useSLAMetrics, type PeriodFilter } from '@/hooks/sla/useSLAMetrics';

function getRateColor(rate: number): string {
  if (rate >= 90) return 'text-success';
  if (rate >= 75) return 'text-warning';
  return 'text-destructive';
}

function getRateBg(rate: number): string {
  if (rate >= 90) return 'bg-success';
  if (rate >= 75) return 'bg-warning';
  return 'bg-destructive';
}

function getRateBadge(rate: number): string {
  if (rate >= 90) return 'bg-success/10 text-success';
  if (rate >= 75) return 'bg-warning/10 text-warning';
  return 'bg-destructive/10 text-destructive';
}

const PERIOD_LABELS: Record<PeriodFilter, string> = {
  today: 'Hoje', week: 'Esta Semana', month: 'Este Mês', all: 'Todo Período',
};

export function SLAMetricsDashboard() {
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('week');
  const { data, loading } = useSLAMetrics(periodFilter);

  const agentSLAData = data?.byAgent || [];
  const totalConversations = data?.overall.totalConversations || 0;
  const totalOnTime = data?.overall.firstResponse.onTime || 0;
  const totalBreached = data?.overall.firstResponse.breached || 0;
  const overallRate = Math.round(data?.overall.overallRate || 100);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">{[1, 2, 3, 4].map(i => <Card key={i} className="border-secondary/20 bg-card"><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>)}</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><Card className="border-secondary/20 bg-card"><CardContent className="p-4 space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</CardContent></Card></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-foreground">Métricas de SLA</h2>
          <Badge variant="outline" className="gap-1"><Calendar className="w-3 h-3" />{PERIOD_LABELS[periodFilter]}</Badge>
        </div>
        <div className="flex items-center gap-3">
          <ToggleGroup type="single" value={periodFilter} onValueChange={(v) => v && setPeriodFilter(v as PeriodFilter)} className="bg-muted/30 p-1 rounded-lg">
            <ToggleGroupItem value="today" size="sm" className="text-xs px-3">Hoje</ToggleGroupItem>
            <ToggleGroupItem value="week" size="sm" className="text-xs px-3">Semana</ToggleGroupItem>
            <ToggleGroupItem value="month" size="sm" className="text-xs px-3">Mês</ToggleGroupItem>
            <ToggleGroupItem value="all" size="sm" className="text-xs px-3">Tudo</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { icon: Target, label: 'Taxa Geral SLA', value: <span className={getRateColor(overallRate)}>{overallRate}%</span>, bg: 'bg-primary/15', iconColor: 'text-primary' },
          { icon: CheckCircle2, label: 'No Prazo', value: <span className="text-success">{totalOnTime}</span>, bg: 'bg-success/15', iconColor: 'text-success' },
          { icon: XCircle, label: 'Violações', value: <span className="text-destructive">{totalBreached}</span>, bg: 'bg-destructive/15', iconColor: 'text-destructive' },
          { icon: TrendingUp, label: 'Total Conversas', value: <span className="text-foreground">{totalConversations}</span>, bg: 'bg-info/15', iconColor: 'text-info' },
        ].map((item, i) => (
          <motion.div key={item.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 * (i + 1) }}>
            <Card className="border-secondary/20 bg-card"><CardContent className="p-4"><div className="flex items-center gap-3"><div className={`w-10 h-10 rounded-xl ${item.bg} flex items-center justify-center`}><item.icon className={`w-5 h-5 ${item.iconColor}`} /></div><div><p className="text-sm text-muted-foreground">{item.label}</p><p className="text-2xl font-bold">{item.value}</p></div></div></CardContent></Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }}>
          <Card className="border-secondary/20 bg-card">
            <CardHeader className="border-b border-secondary/20 bg-secondary/5">
              <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-secondary/15 flex items-center justify-center"><Users className="w-5 h-5 text-secondary" /></div><CardTitle className="font-display text-lg">SLA por Agente</CardTitle></div>
            </CardHeader>
            <CardContent className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
              {agentSLAData.length === 0 ? (
                <GenericEmptyState icon={Users} title="Sem agentes" description="Nenhum agente encontrado no período selecionado" className="py-6" />
              ) : agentSLAData.map((agent, index) => (
                <motion.div key={agent.agentId} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 + index * 0.05 }} className="p-3 rounded-xl bg-muted/20 border border-border/30 hover:border-primary/20 transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-8 h-8 ring-2 ring-border/50"><AvatarImage src={agent.avatarUrl} /><AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{agent.agentName.split(' ').map(n => n[0]).join('').slice(0, 2)}</AvatarFallback></Avatar>
                      <span className="font-medium text-foreground">{agent.agentName}</span>
                    </div>
                    <Badge className={cn("font-semibold border-0", getRateBadge(agent.overallRate))}>{Math.round(agent.overallRate)}%</Badge>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {[{ label: '1ª Resposta', icon: Clock, data: agent.firstResponse }].map(col => (
                      <div key={col.label} className="space-y-1">
                        <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground flex items-center gap-1"><col.icon className="w-3 h-3" />{col.label}</span><span className={getRateColor(col.data.rate)}>{Math.round(col.data.rate)}%</span></div>
                        <div className="relative h-1.5 bg-muted rounded-full overflow-hidden"><motion.div className={cn("absolute inset-y-0 left-0 rounded-full", getRateBg(col.data.rate))} initial={{ width: 0 }} animate={{ width: `${col.data.rate}%` }} transition={{ duration: 0.8, delay: 0.7 + index * 0.05 }} /></div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-success" />{agent.firstResponse.onTime} no prazo</span>
                    <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-destructive" />{agent.firstResponse.breached} violações</span>
                  </div>
                </motion.div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }}>
          <Card className="border-secondary/20 bg-card h-full">
            <CardHeader className="border-b border-secondary/20 bg-secondary/5">
              <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-secondary/15 flex items-center justify-center"><Target className="w-5 h-5 text-secondary" /></div><CardTitle className="font-display text-lg">Resumo Geral</CardTitle></div>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {agentSLAData.length === 0 || totalConversations === 0 ? (
                <div className="text-center py-8 text-muted-foreground"><Target className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Nenhum dado de SLA disponível</p><p className="text-sm">Os dados aparecerão quando houver conversas com SLA ativo</p></div>
              ) : (
                <>
                  <div className="p-4 rounded-xl bg-muted/20 border border-border/30">
                    <div className="flex items-center justify-between mb-2"><span className="text-sm text-muted-foreground">Taxa de 1ª Resposta no Prazo</span><span className={cn("font-semibold", getRateColor(overallRate))}>{overallRate}%</span></div>
                    <div className="relative h-2 bg-muted rounded-full overflow-hidden"><motion.div className={cn("absolute inset-y-0 left-0 rounded-full", getRateBg(overallRate))} initial={{ width: 0 }} animate={{ width: `${overallRate}%` }} transition={{ duration: 0.8, delay: 0.6 }} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {agentSLAData.slice(0, 6).map((agent) => (
                      <div key={agent.agentId} className="p-3 rounded-lg bg-muted/10 border border-border/20">
                        <div className="flex items-center gap-2 mb-1">
                          <Avatar className="w-5 h-5"><AvatarImage src={agent.avatarUrl} /><AvatarFallback className="text-[8px]">{agent.agentName.split(' ').map(n => n[0]).join('').slice(0, 2)}</AvatarFallback></Avatar>
                          <span className="text-xs font-medium truncate">{agent.agentName}</span>
                        </div>
                        <div className={cn("text-lg font-bold", getRateColor(agent.overallRate))}>{Math.round(agent.overallRate)}%</div>
                      </div>
                    ))}
                  </div>
                  <Suspense fallback={null}><SLAConfigurationManager /></Suspense>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
