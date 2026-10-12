import { useState, useEffect, useCallback } from 'react';
import { SLAConfigurationManager } from '@/components/settings/SLAConfigurationManager';
import { SLARulesManager } from '@/components/settings/SLARulesManager';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Clock, Target, History, Settings2 } from 'lucide-react';
import { useSLAMetrics, PeriodFilter } from '@/hooks/sla/useSLAMetrics';
import { useSLAHistory } from '@/hooks/sla/useSLAHistory';
import { SLAMetricCards } from './SLAMetricCards';
import { SLAAgentTable } from './SLAAgentTable';
import { SectionErrorBoundary } from '@/components/ui/section-error-boundary';

export const SLADashboard = () => {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PeriodFilter>('today');
  const { data, loading } = useSLAMetrics(period);
  const { data: historyData } = useSLAHistory('7d');

  // Extract sparkline data from 7-day history
  const sparkFR = historyData?.dailyData.map(d => d.totalConversations > 0 ? 100 - (d.firstResponseBreaches / d.totalConversations) * 100 : 100) || [];
  const sparkOverall = historyData?.dailyData.map(d => d.slaRate) || [];
  const sparkConversations = historyData?.dailyData.map(d => d.totalConversations) || [];

  // Keyboard shortcuts: 1=Hoje, 2=Semana, 3=Mês, 4=Todos, H=Histórico
  const periodKeys: PeriodFilter[] = ['today', 'week', 'month', 'all'];
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key >= '1' && e.key <= '4') {
      e.preventDefault();
      setPeriod(periodKeys[Number.parseInt(e.key) - 1]);
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
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

  return (
    <div className="space-y-6 w-full min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Dashboard de SLA</h2>
          <p className="text-muted-foreground">
            Métricas de tempo de primeira resposta
          </p>
        </div>
        <div className="flex items-center gap-3">
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

      <SectionErrorBoundary sectionName="Métricas de SLA">
        <SLAMetricCards
          data={data.overall}
          periodLabel={periodLabels[period]}
          sparkOverall={sparkOverall}
          sparkFR={sparkFR}
          sparkConversations={sparkConversations}
        />
      </SectionErrorBoundary>

      <SectionErrorBoundary sectionName="Desempenho por agente">
        <SLAAgentTable agents={data.byAgent} />
      </SectionErrorBoundary>

      {/* Base do cálculo de 1ª resposta — só o dado que os cards de métrica
          acima ainda NÃO mostram. Antes havia dois cards ("Visão Geral do SLA" e
          "Resumo de Violações") repetindo a mesma taxa e as mesmas contagens "no
          prazo"/"atrasados" de SLAMetricCards, exibidas 3x na mesma tela. */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Base do cálculo de 1ª resposta
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-muted/50 border border-border">
            <p className="text-sm text-muted-foreground">Conversas avaliadas</p>
            <p className="text-2xl font-bold text-foreground">{data.overall.firstResponse.total}</p>
            <p className="text-xs text-muted-foreground mt-0.5">no prazo + atrasadas — denominador da taxa</p>
          </div>
          <div className="p-4 rounded-xl bg-muted/50 border border-border">
            <p className="text-sm text-muted-foreground">Pendentes de 1ª resposta</p>
            <p className="text-2xl font-bold text-foreground">{data.overall.firstResponse.pending}</p>
            <p className="text-xs text-muted-foreground mt-0.5">ainda sem desfecho — não entram na taxa</p>
          </div>
        </CardContent>
      </Card>

      {/* Configuração de Prazos */}
      <Tabs defaultValue="global" className="w-full">
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="global">Configuração Global</TabsTrigger>
          <TabsTrigger value="granular">Regras Granulares</TabsTrigger>
        </TabsList>
        <TabsContent value="global">
          <SectionErrorBoundary sectionName="Configuração Global de SLA">
            <SLAConfigurationManager />
          </SectionErrorBoundary>
        </TabsContent>
        <TabsContent value="granular">
          <SectionErrorBoundary sectionName="Regras Granulares de SLA">
            <SLARulesManager />
          </SectionErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
};
