import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { motion } from '@/components/ui/motion';
import { Brain, TrendingUp, TrendingDown, Minus, Sparkles, AlertTriangle, Mic, Calendar, Bell } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART_TICK_FONT_SIZE } from '@/lib/chart-theme';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import { Tooltip as TooltipUI, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { useAIStats, type PeriodOption, type TrendData } from '@/hooks/analytics/useAIStats';

type SentimentType = 'positive' | 'negative' | 'neutral';

const periodLabels: Record<PeriodOption, string> = { 7: '7 dias', 14: '14 dias', 30: '30 dias' };

const sentimentTypeLabels: Record<SentimentType, { label: string; color: string }> = {
  positive: { label: 'Positivo', color: 'bg-success' },
  negative: { label: 'Negativo', color: 'bg-destructive' },
  neutral: { label: 'Neutro', color: 'bg-muted-foreground' },
};

const TrendIndicator = ({ trend, label, periodDays }: { trend: TrendData; label: string; periodDays: number }) => {
  const isSignificant = Math.abs(trend.percentage) > 20;
  const getTooltipMessage = () => {
    if (trend.direction === 'stable') return `${label} manteve-se estável nos últimos ${periodDays} dias comparado ao período anterior`;
    const direction = trend.direction === 'up' ? 'aumentou' : 'diminuiu';
    const absPercentage = Math.abs(trend.percentage).toFixed(1);
    return `${label} ${direction} ${absPercentage}% nos últimos ${periodDays} dias${isSignificant ? ' (mudança significativa!)' : ''}`;
  };

  if (trend.direction === 'stable') {
    return (
      <TooltipProvider><TooltipUI><TooltipTrigger asChild>
        <div className="flex items-center gap-0.5 text-muted-foreground cursor-help"><Minus className="w-3 h-3" /><span className="text-3xs">0%</span></div>
      </TooltipTrigger><TooltipContent side="top" className="max-w-[200px] text-xs"><p>{getTooltipMessage()}</p></TooltipContent></TooltipUI></TooltipProvider>
    );
  }

  const isUp = trend.direction === 'up';
  const Icon = isUp ? TrendingUp : TrendingDown;
  const colorClass = isUp ? 'text-success' : 'text-destructive';

  return (
    <TooltipProvider><TooltipUI><TooltipTrigger asChild>
      <motion.div className={cn("flex items-center gap-0.5 cursor-help", colorClass, isSignificant && "animate-pulse")} initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
        <Icon className={cn("w-3 h-3", isSignificant && "drop-shadow-[0_0_3px_currentColor]")} />
        <span className={cn("text-3xs font-medium", isSignificant && "font-bold")}>{isUp ? '+' : ''}{trend.percentage.toFixed(0)}%</span>
      </motion.div>
    </TooltipTrigger><TooltipContent side="top" className="max-w-[200px] text-xs"><p>{getTooltipMessage()}</p></TooltipContent></TooltipUI></TooltipProvider>
  );
};

const chartConfig = {
  score: { label: 'Sentimento', color: 'hsl(var(--primary))' },
  positive: { label: 'Positivo', color: 'hsl(var(--success))' },
  negative: { label: 'Negativo', color: 'hsl(var(--destructive))' },
};

export function AIStatsWidget() {
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodOption>(7);
  const [visibleSentiments, setVisibleSentiments] = useState<Set<SentimentType>>(new Set(['positive', 'negative', 'neutral']));
  const { data: stats, isLoading } = useAIStats(selectedPeriod);

  const toggleSentiment = (sentiment: SentimentType) => {
    setVisibleSentiments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sentiment)) { if (newSet.size > 1) newSet.delete(sentiment); } else newSet.add(sentiment);
      return newSet;
    });
  };

  if (isLoading) {
    return (
      <Card className="border-secondary/20 bg-card">
        <CardHeader className="pb-3"><Skeleton className="h-6 w-40" /></CardHeader>
        <CardContent><div className="grid grid-cols-2 gap-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20" />)}</div></CardContent>
      </Card>
    );
  }

  const metrics = [
    { label: 'Análises de IA', value: stats?.totalAnalyses || 0, icon: Brain, color: 'text-primary', bgColor: 'bg-primary/10', trend: stats?.trends.analyses },
    { label: 'Sentimento Médio', value: `${((stats?.avgSentimentScore || 0) * 100).toFixed(0)}%`, icon: TrendingUp, color: 'text-success', bgColor: 'bg-success/10', trend: stats?.trends.sentiment },
    { label: 'Alertas Negativos', value: stats?.negativeSentiment || 0, icon: AlertTriangle, color: 'text-destructive', bgColor: 'bg-destructive/10', trend: stats?.trends.negative },
    { label: 'Transcrições', value: stats?.transcriptionsCount || 0, icon: Mic, color: 'text-info', bgColor: 'bg-info/10', trend: stats?.trends.transcriptions },
  ];

  const sentimentData = [
    { label: 'Positivo', value: stats?.positiveSentiment || 0, color: 'bg-success' },
    { label: 'Neutro', value: stats?.neutralSentiment || 0, color: 'bg-muted-foreground' },
    { label: 'Negativo', value: stats?.negativeSentiment || 0, color: 'bg-destructive' },
  ];
  const total = sentimentData.reduce((acc, s) => acc + s.value, 0) || 1;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.5 }}>
      <Card className="border-secondary/20 overflow-hidden bg-card hover:border-secondary/40 transition-all duration-300 cursor-pointer group"
        onClick={() => { const t = document.querySelector('[value="ai"]'); if (t) (t as HTMLElement).click(); }}>
        <CardHeader className="border-b border-secondary/20 bg-secondary/5 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center" whileHover={{ scale: 1.1 }}>
                <Brain className="w-5 h-5 text-primary" />
              </motion.div>
              <CardTitle className="font-display text-lg text-foreground">Inteligência Artificial</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1"><Calendar className="w-3 h-3" />{periodLabels[selectedPeriod]}</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  {([7, 14, 30] as PeriodOption[]).map((period) => (
                    <DropdownMenuItem key={period} onClick={(e) => { e.stopPropagation(); setSelectedPeriod(period); }} className={cn(selectedPeriod === period && "bg-accent")}>{periodLabels[period]}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <motion.div className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-primary transition-colors" whileHover={{ x: 3 }}>
                <Sparkles className="w-3 h-3" /><span>Ver mais</span>
              </motion.div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-3 mb-4">
            {metrics.map((metric, index) => (
              <motion.div key={metric.label} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 * index }} className="p-3 rounded-xl bg-muted/30 border border-border/30">
                <div className="flex items-center justify-between mb-1">
                  <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", metric.bgColor)}><metric.icon className={cn("w-4 h-4", metric.color)} /></div>
                  {metric.trend && <TrendIndicator trend={metric.trend} label={metric.label} periodDays={selectedPeriod} />}
                </div>
                <p className="text-xl font-bold text-foreground">{metric.value}</p>
                <p className="text-xs text-muted-foreground">{metric.label}</p>
              </motion.div>
            ))}
          </div>

          {stats?.activeAlerts && stats.activeAlerts.length > 0 && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/30">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="relative"><Bell className="w-4 h-4 text-destructive" /><span className="absolute -top-1 -right-1 w-2 h-2 bg-destructive rounded-full animate-pulse" /></div>
                  <span className="text-sm font-medium text-destructive">{stats.activeAlerts.length} Alerta{stats.activeAlerts.length > 1 ? 's' : ''} Ativo{stats.activeAlerts.length > 1 ? 's' : ''}</span>
                </div>
                <span className="text-3xs text-muted-foreground">Últimas 24h</span>
              </div>
              <div className="space-y-1">
                {stats.activeAlerts.slice(0, 3).map((alert) => (
                  <div key={alert.id} className="flex items-center justify-between text-xs">
                    <span className="text-foreground truncate max-w-[150px]">{alert.contact_name || 'Cliente'}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-destructive font-medium">{alert.sentiment_score || 0}%</span>
                      {alert.consecutive_low && <span className="text-muted-foreground">({alert.consecutive_low}x)</span>}
                    </div>
                  </div>
                ))}
                {stats.activeAlerts.length > 3 && <p className="text-3xs text-muted-foreground text-center pt-1">+{stats.activeAlerts.length - 3} mais alertas</p>}
              </div>
            </motion.div>
          )}

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Distribuição de Sentimento</p>
            <div className="h-3 rounded-full bg-muted overflow-hidden flex">
              {sentimentData.map((s, i) => <motion.div key={s.label} className={cn("h-full", s.color)} initial={{ width: 0 }} animate={{ width: `${(s.value / total) * 100}%` }} transition={{ duration: 0.8, delay: 0.3 + i * 0.1 }} />)}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              {sentimentData.map((s) => <div key={s.label} className="flex items-center gap-1"><div className={cn("w-2 h-2 rounded-full", s.color)} /><span>{s.label}: {s.value}</span></div>)}
            </div>
          </div>

          {stats?.sentimentTrend && stats.sentimentTrend.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border/30">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground font-medium">Evolução do Sentimento ({periodLabels[selectedPeriod]})</p>
                <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                  {(['positive', 'negative', 'neutral'] as SentimentType[]).map((sentiment) => (
                    <label key={sentiment} className="flex items-center gap-1.5 cursor-pointer text-3xs">
                      <Checkbox checked={visibleSentiments.has(sentiment)} onCheckedChange={() => toggleSentiment(sentiment)} className="w-3 h-3" />
                      <div className={cn("w-2 h-2 rounded-full", sentimentTypeLabels[sentiment].color)} />
                      <span className="text-muted-foreground">{sentimentTypeLabels[sentiment].label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <ChartContainer config={chartConfig} className="h-[100px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.sentimentTrend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="positiveGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.2} /><stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} /></linearGradient>
                      <linearGradient id="negativeGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.2} /><stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} /></linearGradient>
                      <linearGradient id="neutralGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.2} /><stop offset="95%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0} /></linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fontSize: CHART_TICK_FONT_SIZE, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: CHART_TICK_FONT_SIZE, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltipContent />} />
                    {visibleSentiments.has('positive') && <Area type="monotone" dataKey="positive" name="Positivo" stroke="hsl(var(--success))" strokeWidth={2} fill="url(#positiveGradient)" />}
                    {visibleSentiments.has('negative') && <Area type="monotone" dataKey="negative" name="Negativo" stroke="hsl(var(--destructive))" strokeWidth={2} fill="url(#negativeGradient)" />}
                    {visibleSentiments.has('neutral') && <Area type="monotone" dataKey="neutral" name="Neutro" stroke="hsl(var(--muted-foreground))" strokeWidth={2} fill="url(#neutralGradient)" />}
                  </AreaChart>
                </ResponsiveContainer>
              </ChartContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
