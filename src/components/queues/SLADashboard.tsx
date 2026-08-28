import { useState, useEffect, useCallback } from 'react';
import { SLAConfigurationManager } from '@/components/settings/SLAConfigurationManager';
import { SLARulesManager } from '@/components/settings/SLARulesManager';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Clock, AlertTriangle, Target, History, Settings2 } from 'lucide-react';
import { useSLAMetrics, PeriodFilter } from '@/hooks/sla/useSLAMetrics';
import { useSLAHistory } from '@/hooks/sla/useSLAHistory';
import { ExportButton } from '@/components/reports/ExportButton';
import { ReportData } from '@/utils/exportReport';
import { cn } from '@/lib/utils';
import { SLAMetricCards } from './SLAMetricCards';
import { SLAAgentTable } from './SLAAgentTable';

const getRateColor = (rate: number) => {
  if (rate >= 90) return 'text-success';
  if (rate >= 70) return 'text-warning';
  return 'text-destructive';
};

export const SLADashboard = () => {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PeriodFilter>('today');
  const { data, loading } = useSLAMetrics(period);
  const { data: historyData } = useSLAHistory('7d');

  // Extract sparkline data from 7-day history
  const sparkFR = historyData?.dailyData.map(d => d.totalConversations > 0 ? 100 - (d.firstResponseBreaches / d.totalConversations) * 100 : 100) || [];
  const sparkRes = historyData?.dailyData.map(d => d.totalConversations > 0 ? 100 - (d.resolutionBreaches / d.totalConversations) * 100 : 100) || [];
  const sparkOverall = historyData?.dailyData.map(d => d.slaRate) || [];
  const sparkConversations = historyData?.dailyData.map(d => d.totalConversations) || [];

  // Keyboard shortcuts: 1=Hoje, 2=Semana, 3=Mês, 4=Todos, H=Histórico
  const periodKeys: PeriodFilter[] = ['today', 'week', 'month', 'all'];
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key >= '1' && e.key <= '4') {
      e.preventDefault();
      setPeriod(periodKeys[parseInt(e.key) - 1]);
    }
    if (e.key === 'h' || e.key === 'H') {
      e.preventDefault();
      navigate('/sla/history');
    }
  }, [navigate]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const periodLabels: Record<PeriodFilter, string> = {
    today: 'Hoje',
    week: 'Esta Semana',
    month: 'Este Mês',
    all: 'Todos'
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-64" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!data) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-24"
      >
        <div className="relative mb-6">
          <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center">
            <Target className="w-10 h-10 text-muted-foreground/40" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Clock className="w-4 h-4 text-primary/60" />
          </div>
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-1">Nenhum dado de SLA encontrado</h3>
        <p className="text-sm text-muted-foreground max-w-md text-center leading-relaxed">
          Os dados aparecerão aqui quando conversas forem monitoradas pelo sistema de SLA.
          Configure prazos na aba de configuração abaixo para começar.
        </p>
        <Button
          variant="outline"
          className="mt-6 gap-2 rounded-xl"
          onClick={() => {
            const el = document.querySelector('[value="global"]');
            if (el instanceof HTMLElement) el.click();
          }}
        >
          <Settings2 className="w-4 h-4" />
          Configurar SLA
        </Button>
      </motion.div>
    );
  }

  const getExportData = (): ReportData => ({
    title: 'Dashboard de SLA',
    subtitle: `Período: ${periodLabels[period]}`,
    generatedAt: new Date(),
    columns: [
      { header: 'Agente', key: 'agentName', width: 20 },
      { header: 'Taxa SLA (%)', key: 'overallRate', width: 12 },
      { header: '1ª Resp. (%)', key: 'firstResponseRate', width: 12 },
      { header: 'Resolução (%)', key: 'resolutionRate', width: 12 },
    ],
    rows: data.byAgent.map(a => ({
      agentName: a.agentName,
      overallRate: a.overallRate.toFixed(1),
      firstResponseRate: a.firstResponse.rate.toFixed(1),
      resolutionRate: a.resolution.rate.toFixed(1),
    })),
    summary: [
      { label: 'Taxa SLA Geral', value: `${data.overall.overallRate.toFixed(1)}%` },
      { label: 'Total Conversas', value: data.overall.totalConversations },
      { label: '1ª Resposta no Prazo', value: data.overall.firstResponse.onTime },
      { label: 'Resolução no Prazo', value: data.overall.resolution.onTime },
    ],
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Dashboard de SLA</h2>
          <p className="text-muted-foreground">
            Métricas de tempo de resposta e resolução
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ExportButton getData={getExportData} />
          <Button 
            variant="outline" 
            onClick={() => navigate('/sla/history')}
            className="gap-2"
          >
            <History className="h-4 w-4" />
            Histórico
          </Button>
          <ToggleGroup 
            type="single" 
            value={period} 
            onValueChange={(v) => v && setPeriod(v as PeriodFilter)}
            className="bg-muted/50 rounded-lg p-1"
          >
            {Object.entries(periodLabels).map(([key, label]) => (
              <ToggleGroupItem 
                key={key} 
                value={key}
                className="data-[state=on]:bg-background data-[state=on]:shadow-sm px-4"
              >
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      <SLAMetricCards
        data={data.overall}
        periodLabel={periodLabels[period]}
        sparkOverall={sparkOverall}
        sparkFR={sparkFR}
        sparkRes={sparkRes}
        sparkConversations={sparkConversations}
      />

      <SLAAgentTable agents={data.byAgent} />

      {/* SLA Overview Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
        <Card className="rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Visão Geral do SLA
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Primeira Resposta</span>
                <span className={cn("text-sm font-bold", getRateColor(data.overall.firstResponse.rate))}>
                  {data.overall.firstResponse.rate.toFixed(1)}%
                </span>
              </div>
              <Progress value={data.overall.firstResponse.rate} className="h-3" />
              <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                <span>{data.overall.firstResponse.onTime} no prazo</span>
                <span>{data.overall.firstResponse.breached} atrasados</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Resolução</span>
                <span className={cn("text-sm font-bold", getRateColor(data.overall.resolution.rate))}>
                  {data.overall.resolution.rate.toFixed(1)}%
                </span>
              </div>
              <Progress value={data.overall.resolution.rate} className="h-3" />
              <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                <span>{data.overall.resolution.onTime} no prazo</span>
                <span>{data.overall.resolution.breached} atrasados</span>
              </div>
            </div>
        </CardContent>
        </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
        <Card className="rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Resumo de Violações
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.7 }} className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 hover:bg-destructive/15 transition-colors">
                <p className="text-sm text-muted-foreground">Violações 1ª Resposta</p>
                <p className="text-2xl font-bold text-destructive">
                  {data.overall.firstResponse.breached}
                </p>
              </motion.div>
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.8 }} className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 hover:bg-destructive/15 transition-colors">
                <p className="text-sm text-muted-foreground">Violações Resolução</p>
                <p className="text-2xl font-bold text-destructive">
                  {data.overall.resolution.breached}
                </p>
              </motion.div>
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.9 }} className="p-4 rounded-xl bg-success/10 border border-success/20 hover:bg-success/15 transition-colors">
                <p className="text-sm text-muted-foreground">No Prazo 1ª Resposta</p>
                <p className="text-2xl font-bold text-success">
                  {data.overall.firstResponse.onTime}
                </p>
              </motion.div>
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1.0 }} className="p-4 rounded-xl bg-success/10 border border-success/20 hover:bg-success/15 transition-colors">
                <p className="text-sm text-muted-foreground">No Prazo Resolução</p>
                <p className="text-2xl font-bold text-success">
                  {data.overall.resolution.onTime}
                </p>
              </motion.div>
            </div>
          </CardContent>
        </Card>
        </motion.div>
      </div>

      {/* Configuração de Prazos */}
      <Tabs defaultValue="global" className="w-full">
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="global">Configuração Global</TabsTrigger>
          <TabsTrigger value="granular">Regras Granulares</TabsTrigger>
        </TabsList>
        <TabsContent value="global">
          <SLAConfigurationManager />
        </TabsContent>
        <TabsContent value="granular">
          <SLARulesManager />
        </TabsContent>
      </Tabs>
    </div>
  );
};
