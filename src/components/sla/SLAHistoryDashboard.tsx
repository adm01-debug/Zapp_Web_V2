import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Target, Clock, Calendar } from 'lucide-react';
import { useSLAHistory, HistoryPeriod } from '@/hooks/sla/useSLAHistory';
import { ExportButton } from '@/components/reports/ExportButton';
import { ReportData } from '@/utils/exportReport';
import { cn } from '@/lib/utils';
import { SLARateChart, SLAViolationsChart, SLABestWorstDays } from './SLACharts';

const periodLabels: Record<HistoryPeriod, string> = {
  '7d': '7 dias',
  '14d': '14 dias',
  '30d': '30 dias',
  '90d': '90 dias',
};

const TrendIndicator = ({ trend, inverse = false, label }: { trend: { direction: string; percentage: number }; inverse?: boolean; label: string }) => {
  const isPositive = inverse ? trend.direction === 'down' : trend.direction === 'up';
  const isNegative = inverse ? trend.direction === 'up' : trend.direction === 'down';

  return (
    <div className="flex items-center gap-1">
      {trend.direction === 'up' && <TrendingUp className={cn("h-4 w-4", isPositive ? "text-success" : "text-destructive")} />}
      {trend.direction === 'down' && <TrendingDown className={cn("h-4 w-4", isPositive ? "text-success" : "text-destructive")} />}
      {trend.direction === 'stable' && <Minus className="h-4 w-4 text-muted-foreground" />}
      <span className={cn("text-sm font-medium", isPositive && "text-success", isNegative && "text-destructive", trend.direction === 'stable' && "text-muted-foreground")}>{trend.percentage.toFixed(1)}%</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
};

export const SLAHistoryDashboard = () => {
  const [period, setPeriod] = useState<HistoryPeriod>('30d');
  const { data, loading } = useSLAHistory(period);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between"><Skeleton className="h-8 w-64" /><Skeleton className="h-10 w-48" /></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}</div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card className="p-8 text-center">
        <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <p className="text-muted-foreground">Nenhum dado de histórico disponível</p>
      </Card>
    );
  }

  const getExportData = (): ReportData => ({
    title: 'Histórico de Violações SLA',
    subtitle: `Período: ${periodLabels[period]}`,
    generatedAt: new Date(),
    columns: [
      { header: 'Data', key: 'dateLabel', width: 15 },
      { header: 'Conversas', key: 'totalConversations', width: 12 },
      { header: 'Violações 1ª Resp.', key: 'firstResponseBreaches', width: 18 },
      { header: 'Total Violações', key: 'totalBreaches', width: 15 },
      { header: 'Taxa SLA (%)', key: 'slaRate', width: 12 },
    ],
    rows: data.dailyData.map(d => ({ ...d, slaRate: d.slaRate.toFixed(1) })),
    summary: [
      { label: 'Taxa SLA Geral', value: `${data.totals.overallSLARate.toFixed(1)}%` },
      { label: 'Total de Conversas', value: data.totals.totalConversations },
      { label: 'Violações 1ª Resposta', value: data.totals.firstResponseBreaches },
      { label: 'Total de Violações', value: data.totals.totalBreaches },
    ],
  });

  const summaryCards = [
    { icon: Target, color: 'primary', label: 'Taxa SLA Geral', value: `${data.totals.overallSLARate.toFixed(1)}%`, extra: <TrendIndicator trend={data.trends.overall} label="vs período anterior" /> },
    { icon: Clock, color: 'warning', label: 'Violações 1ª Resposta', value: data.totals.firstResponseBreaches, extra: <TrendIndicator trend={data.trends.firstResponse} inverse label="vs período anterior" /> },
    { icon: Calendar, color: 'info', label: 'Total Conversas', value: data.totals.totalConversations, extra: <p className="text-sm text-muted-foreground mt-1">{data.totals.totalBreaches} violações totais</p> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Histórico de Violações SLA</h2>
          <p className="text-muted-foreground">Análise de tendências e padrões de violações</p>
        </div>
        <div className="flex items-center gap-3">
          <ExportButton getData={getExportData} />
          <ToggleGroup type="single" value={period} onValueChange={(v) => v && setPeriod(v as HistoryPeriod)} className="bg-muted/50 rounded-lg p-1">
            {Object.entries(periodLabels).map(([key, label]) => (
              <ToggleGroupItem key={key} value={key} className="data-[state=on]:bg-background data-[state=on]:shadow-sm px-4">{label}</ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card, i) => (
          <motion.div key={card.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: (i + 1) * 0.1 }}>
            <Card className={`border-l-4 border-l-${card.color}`}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{card.label}</p>
                    <p className={cn("text-3xl font-bold", card.color !== 'primary' && card.color !== 'info' && `text-${card.color}`)}>{card.value}</p>
                  </div>
                  <card.icon className={`h-8 w-8 text-${card.color} opacity-50`} />
                </div>
                {card.extra}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <SLARateChart dailyData={data.dailyData} />
      <SLAViolationsChart dailyData={data.dailyData} />
      <SLABestWorstDays worstDays={data.worstDays} bestDays={data.bestDays} />
    </div>
  );
};
