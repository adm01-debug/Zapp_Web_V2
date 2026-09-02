import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Star, TrendingUp, TrendingDown, Minus, Smile, Meh, Frown, Inbox } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { SatisfactionAgentRanking } from './SatisfactionAgentRanking';
import { useSatisfactionBreakdown } from '@/hooks/business/useCSAT';
import { useNPSSurveys } from '@/hooks/business/useNPSSurveys';

type Period = '7d' | '30d' | '90d';

const PERIOD_DAYS: Record<Period, 7 | 30 | 90> = { '7d': 7, '30d': 30, '90d': 90 };
const PERIOD_LABEL: Record<Period, string> = { '7d': '7 dias', '30d': '30 dias', '90d': '90 dias' };

const getCSATColor = (v: number | null) => {
  if (v === null) return 'text-muted-foreground';
  return v >= 85 ? 'text-success' : v >= 70 ? 'text-warning' : 'text-destructive';
};
const getNPSColor = (v: number | null) => {
  if (v === null) return 'text-muted-foreground';
  return v >= 50 ? 'text-success' : v >= 0 ? 'text-warning' : 'text-destructive';
};
const getRatingIcon = (r: number) =>
  r >= 4 ? <Smile className="h-4 w-4 text-success" /> : r === 3 ? <Meh className="h-4 w-4 text-warning" /> : <Frown className="h-4 w-4 text-destructive" />;

export const SatisfactionMetrics = () => {
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('30d');
  const [detailsOpen, setDetailsOpen] = useState(false);

  const periodDays = PERIOD_DAYS[selectedPeriod];
  const { data: breakdown, isLoading: isBreakdownLoading, isError: isBreakdownError } = useSatisfactionBreakdown(periodDays);
  const { surveys: npsSurveys, isLoading: isNpsLoading } = useNPSSurveys();

  const npsInPeriod = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - periodDays);
    return npsSurveys.filter((s) => new Date(s.created_at) >= cutoff);
  }, [npsSurveys, periodDays]);

  const npsScore = useMemo(() => {
    const total = npsInPeriod.length;
    if (total === 0) return null;
    const promoters = npsInPeriod.filter((s) => s.score >= 9).length;
    const detractors = npsInPeriod.filter((s) => s.score <= 6).length;
    return Math.round(((promoters - detractors) / total) * 100);
  }, [npsInPeriod]);

  const isLoading = isBreakdownLoading || isNpsLoading;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <div className="animate-pulse text-muted-foreground">Carregando métricas...</div>
        </CardContent>
      </Card>
    );
  }

  // Sem este ramo, uma query que falha deixa isLoading=false e breakdown=undefined,
  // prendendo o card no estado de carregamento para sempre.
  if (isBreakdownError || !breakdown) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Não foi possível carregar as métricas de satisfação.</div>
        </CardContent>
      </Card>
    );
  }

  const hasCsatData = breakdown.totalResponses > 0;
  const hasQueueData = breakdown.byQueue.length > 0;
  const hasTimelineData = breakdown.timeline.some((t) => t.csatPercent !== null);
  const topAgent = breakdown.byAgent[0];

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><Star className="h-5 w-5 text-warning" /><CardTitle className="text-lg">Satisfação do Cliente</CardTitle></div>
            <div className="flex items-center gap-2">
              {(['7d', '30d', '90d'] as const).map((p) => (
                <Button key={p} variant={selectedPeriod === p ? 'default' : 'outline'} size="sm" className="text-xs" onClick={() => setSelectedPeriod(p)}>
                  {PERIOD_LABEL[p]}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-muted/50 rounded-lg p-4 text-center">
              <div className="text-sm text-muted-foreground mb-1">CSAT</div>
              <div className={`text-3xl font-bold ${getCSATColor(breakdown.csatPercent)}`}>
                {breakdown.csatPercent === null ? '—' : `${Math.round(breakdown.csatPercent)}%`}
              </div>
              <div className="flex items-center justify-center gap-1 text-xs mt-1">
                {breakdown.trend === null ? (
                  <span className="text-muted-foreground">sem período anterior</span>
                ) : (
                  <>
                    {breakdown.trend === 'up' ? <TrendingUp className="h-3 w-3 text-success" /> : breakdown.trend === 'down' ? <TrendingDown className="h-3 w-3 text-destructive" /> : <Minus className="h-3 w-3 text-warning" />}
                    <span className={breakdown.trend === 'up' ? 'text-success' : breakdown.trend === 'down' ? 'text-destructive' : ''}>
                      {breakdown.trendValue > 0 ? '+' : ''}{breakdown.trendValue} p.p.
                    </span>
                  </>
                )}
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-muted/50 rounded-lg p-4 text-center">
              <div className="text-sm text-muted-foreground mb-1">NPS</div>
              <div className={`text-3xl font-bold ${getNPSColor(npsScore)}`}>
                {npsScore === null ? '—' : `${npsScore > 0 ? '+' : ''}${npsScore}`}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {npsScore === null ? 'sem respostas no período' : npsScore >= 50 ? 'Excelente' : npsScore >= 0 ? 'Bom' : 'Precisa melhorar'}
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-muted/50 rounded-lg p-4 text-center">
              <div className="text-sm text-muted-foreground mb-1">Respostas CSAT</div>
              <div className="text-3xl font-bold">{breakdown.totalResponses.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground mt-1">nos últimos {PERIOD_LABEL[selectedPeriod]}</div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className={`bg-muted/50 rounded-lg p-4 text-center ${topAgent ? 'cursor-pointer hover:bg-muted transition-colors' : ''}`}
              onClick={() => topAgent && setDetailsOpen(true)}
            >
              <div className="text-sm text-muted-foreground mb-1">Top Agente</div>
              {topAgent ? (
                <>
                  <div className="text-lg font-bold truncate">{topAgent.agentName}</div>
                  <div className="text-xs text-success mt-1">{Math.round(topAgent.csatPercent)}% CSAT</div>
                </>
              ) : (
                <div className="text-lg font-bold text-muted-foreground">Sem dados</div>
              )}
            </motion.div>
          </div>

          {!hasCsatData ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
              <Inbox className="h-8 w-8" />
              <p className="text-sm">Nenhuma avaliação CSAT registrada nos últimos {PERIOD_LABEL[selectedPeriod]}.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium mb-3">Distribuição de Notas</h4>
                  <div className="space-y-2">
                    {breakdown.distribution.map((item) => (
                      <div key={item.rating} className="flex items-center gap-3">
                        <div className="flex items-center gap-1 w-16">{getRatingIcon(item.rating)}<span className="text-sm">{item.rating} ★</span></div>
                        <div className="flex-1"><Progress value={(item.count / breakdown.totalResponses) * 100} className="h-2" /></div>
                        <span className="text-sm text-muted-foreground w-12 text-right">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium mb-3">Por Fila</h4>
                  {hasQueueData ? (
                    <div className="h-[150px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={breakdown.byQueue.map((q) => ({ queueName: q.queueName, csat: Math.round(q.csatPercent) }))}>
                          <XAxis dataKey="queueName" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
                          <Tooltip />
                          <Bar dataKey="csat" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-[150px] flex items-center justify-center text-sm text-muted-foreground">
                      Sem dados suficientes por fila.
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-3">Evolução</h4>
                {hasTimelineData ? (
                  <div className="h-[150px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={breakdown.timeline.map((t) => ({ date: t.date, csat: t.csatPercent === null ? null : Math.round(t.csatPercent) }))}>
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                        <Tooltip />
                        <Line type="monotone" dataKey="csat" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} connectNulls={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[150px] flex items-center justify-center text-sm text-muted-foreground">
                    Sem dados suficientes para o período.
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <SatisfactionAgentRanking
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        agents={breakdown.byAgent.map((a) => ({
          agentId: a.agentId,
          agentName: a.agentName,
          csat: Math.round(a.csatPercent),
          responses: a.responses,
        }))}
      />
    </>
  );
};
