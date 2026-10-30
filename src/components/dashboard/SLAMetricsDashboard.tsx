import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Target, CheckCircle2, XCircle, TrendingUp, Info, AlertCircle, RefreshCw } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { useSLAMetrics, type PeriodFilter } from '@/hooks/sla/useSLAMetrics';
import { useSLAHistory } from '@/hooks/sla/useSLAHistory';
import { DashboardKpiCard, type KpiDelta } from './overview/DashboardKpiCard';
import { SLAAgentTable } from './sla/SLAAgentTable';
import { SLASummaryCard } from './sla/SLASummaryCard';
import { SLAConfigTable } from './sla/SLAConfigTable';
import { getSLARateTone, SLA_RATE_TEXT_CLASS } from './sla/slaRate';

const KPI_HELP: Record<string, string> = {
  'Taxa Geral SLA': 'Percentual de conversas cuja 1ª resposta ficou dentro do prazo definido no SLA aplicável.',
  'No Prazo': 'Quantidade de conversas cuja 1ª resposta foi enviada dentro do prazo de SLA.',
  'Violações': 'Quantidade de conversas cuja 1ª resposta ultrapassou o prazo de SLA.',
  'Total Conversas': 'Total de conversas com SLA aplicável no período selecionado.',
};

function trendToDelta(trend: { direction: 'up' | 'down' | 'stable'; percentage: number } | undefined, invert = false): KpiDelta {
  if (!trend || trend.direction === 'stable') return null;
  const positive = trend.direction === 'up';
  return { pct: Math.round(positive ? trend.percentage : -trend.percentage), invert, label: 'vs. semana anterior' };
}

function HelpIcon({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex text-muted-foreground/70 hover:text-foreground cursor-help"><Info className="w-3.5 h-3.5" /></span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[240px] text-xs">{text}</TooltipContent>
    </Tooltip>
  );
}

/** R2-SLA-001 — "no prazo" no dia: o denominador é a conversa avaliada; a pendente NÃO é sucesso. */
export function SLAMetricsDashboard() {
  const [period, setPeriod] = useState<PeriodFilter>('week');
  const { data, loading } = useSLAMetrics(period);
  const { data: history } = useSLAHistory('30d');
  const queryClient = useQueryClient();

  // Nunca 100% sem amostra: sem 1ª resposta avaliada a taxa não existe (o hook expõe `hasSample`).
  const hasSample = data?.overall.hasSample ?? false;
  const overallRate = Math.round(data?.overall.overallRate ?? 0);
  const onTime = data?.overall.firstResponse.onTime ?? 0;
  const breached = data?.overall.firstResponse.breached ?? 0;
  const pending = data?.overall.firstResponse.pending ?? 0;
  const total = data?.overall.totalConversations ?? 0;
  const agents = data?.byAgent ?? [];

  const sparklines = useMemo(() => {
    const days = history?.dailyData ?? [];
    if (days.length < 2) return { rate: null, onTime: null, breached: null, total: null };
    return {
      rate: days.map((d) => Math.round(d.slaRate)),
      // R2-SLA-001: denominador = conversa com desfecho de 1ª resposta (avaliada). Antes era
      // `totalConversations - totalBreaches`, que contava a pendente como "no prazo".
      onTime: days.map((d) => Math.max(d.evaluatedConversations - d.totalBreaches, 0)),
      breached: days.map((d) => d.totalBreaches),
      total: days.map((d) => d.totalConversations),
    };
  }, [history]);

  const rateTone = getSLARateTone(overallRate);
  const rateLineColor = rateTone === 'success' ? 'green' : rateTone === 'warning' ? 'amber' : 'red';

  // Erro de consulta: `data` só é null depois do carregamento (o queryFn devolve sempre um objeto).
  if (!loading && !data) {
    return (
      <div data-testid="sla-metrics-erro" className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-destructive" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-foreground">Não foi possível carregar as métricas de SLA</h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground leading-relaxed">
          A consulta falhou — isto não é ausência de dado. Tente carregar novamente.
        </p>
        <Button
          variant="outline"
          className="mt-6 gap-2 rounded-xl"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['sla-metrics'] })}
        >
          <RefreshCw className="w-4 h-4" />
          Tentar de novo
        </Button>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {!loading && !hasSample && (
          <div data-testid="sla-metrics-sem-dados" className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
            <Info className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              Sem dados de SLA no período: nenhuma conversa teve a 1ª resposta avaliada.
              A taxa só existe depois do desfecho (no prazo ou violada){pending > 0 ? ` — ${pending} conversa(s) ainda aguardam 1ª resposta` : ''}.
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <DashboardKpiCard
            index={0} size="hero" chart="line"
            label="Taxa Geral SLA" labelAdornment={<HelpIcon text={KPI_HELP['Taxa Geral SLA']} />}
            value={loading || !hasSample ? '—' : `${overallRate}%`}
            valueClassName={loading || !hasSample ? undefined : SLA_RATE_TEXT_CLASS[rateTone]}
            delta={trendToDelta(history?.trends.overall)}
            tile="blue" icon={Target} bars={sparklines.rate} barsColor={rateLineColor}
          />
          <DashboardKpiCard
            index={1} size="hero" chart="line"
            label="No Prazo" labelAdornment={<HelpIcon text={KPI_HELP['No Prazo']} />}
            value={loading || !hasSample ? '—' : String(onTime)}
            valueClassName={loading || !hasSample ? undefined : 'text-dash-green'}
            delta={trendToDelta(history?.trends.overall)}
            tile="green" icon={CheckCircle2} bars={sparklines.onTime} barsColor="green"
          />
          <DashboardKpiCard
            index={2} size="hero" chart="line"
            label="Violações" labelAdornment={<HelpIcon text={KPI_HELP['Violações']} />}
            value={loading || !hasSample ? '—' : String(breached)}
            valueClassName={loading || !hasSample ? undefined : 'text-dash-red'}
            delta={trendToDelta(history?.trends.firstResponse, true)}
            tile="red" icon={XCircle} bars={sparklines.breached} barsColor="red"
          />
          <DashboardKpiCard
            index={3} size="hero" chart="line"
            label="Total Conversas" labelAdornment={<HelpIcon text={KPI_HELP['Total Conversas']} />}
            value={loading ? '—' : String(total)}
            delta={null}
            tile="blue" icon={TrendingUp} bars={sparklines.total} barsColor="blue"
          />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4">
          <SLAAgentTable agents={agents} />
          <div className="space-y-4">
            <SLASummaryCard
              periodFilter={period}
              onPeriodChange={setPeriod}
              overallRate={overallRate}
              onTime={onTime}
              breached={breached}
              hasSample={hasSample}
              overallTrend={history?.trends.overall}
              firstResponseTrend={history?.trends.firstResponse}
            />
            <SLAConfigTable />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
