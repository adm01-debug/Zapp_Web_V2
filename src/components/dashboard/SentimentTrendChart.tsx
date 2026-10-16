import { useState, useMemo } from 'react';
import { Smile, Frown, AlertTriangle, Lightbulb, ChevronRight, TrendingUp, Minus, Calendar } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useSentimentTrend } from '@/hooks/analytics/useSentimentTrend';
import { useRecentSentimentAlerts } from '@/hooks/analytics/useRecentSentimentAlerts';
import { navigateToView } from '@/hooks/system/useNavigationHistory';
import { DashboardCard, SectionHeader, CardSelect, Pill, InitialsAvatar, ProgressBar } from './overview/DashboardCard';
import { DashboardKpiCard } from './overview/DashboardKpiCard';
import { CHART_TICK_FONT_SIZE_SM, CHART_TOOLTIP_FONT_SIZE } from '@/lib/chart-theme';

const PERIOD_OPTIONS = [
  { value: '7', label: 'Últimos 7 dias' },
  { value: '14', label: 'Últimos 14 dias' },
  { value: '30', label: 'Últimos 30 dias' },
] as const;

const DONUT = [
  { key: 'Positivo', color: 'hsl(var(--dash-green))' },
  { key: 'Negativo', color: 'hsl(var(--dash-red))' },
  { key: 'Neutro', color: 'hsl(var(--muted-foreground) / 0.4)' },
];

function sentimentLabel(score: number): { label: string; tone: 'success' | 'warning' | 'danger' } {
  if (score >= 0.3) return { label: 'Positivo', tone: 'success' };
  if (score >= -0.3) return { label: 'Neutro', tone: 'warning' };
  return { label: 'Negativo', tone: 'danger' };
}

export function SentimentTrendChart({ onNavigateTab }: { onNavigateTab?: (tab: string) => void }) {
  const [days, setDays] = useState<'7' | '14' | '30'>('14');
  const trend = useSentimentTrend(Number.parseInt(days));
  const { data: recent } = useRecentSentimentAlerts(Number.parseInt(days));
  // Série diária (janela no fuso do app) — a mesma do hook de tendência.
  const data = trend.series;
  const { current, previous, deltaPct } = trend;

  // Números do período: percentuais e score PONDERADOS pelo total real de
  // conversas (não mais média de médias diárias) e o período anterior de mesmo
  // tamanho para o "vs. período anterior" (achado P1-D).
  const stats = useMemo(() => {
    if (current.total === 0) return null;
    return {
      avgScore: current.avgScore,
      totalAlerts: current.negatives,
      avgPositive: current.positivePct,
      avgNegative: current.negativePct,
      avgNeutral: current.neutralPct,
      deltaPct,
      posDelta: previous ? Math.round(current.positivePct - previous.positivePct) : null,
      negDelta: previous ? Math.round(current.negativePct - previous.negativePct) : null,
      scoreSeries: data.map((d) => Math.round((d.avgScore + 1) * 50)),
    };
  }, [current, previous, deltaPct, data]);

  // Total REAL de análises no período (leitura paginada, sem corte).
  const totalAnalyses = current.total;

  const chartData = data.map((d) => ({
    date: format(parseISO(d.date), 'dd MMM', { locale: ptBR }),
    Positivo: d.positive,
    Negativo: d.negative,
  }));

  const donutData = stats ? [
    { name: 'Positivo', value: stats.avgPositive, count: current.positives },
    { name: 'Negativo', value: stats.avgNegative, count: current.negatives },
    { name: 'Neutro', value: stats.avgNeutral, count: current.neutrals },
  ] : [];

  const insights = useMemo(() => {
    if (!stats) return [];
    const list: { icon: typeof TrendingUp; tile: string; title: string; text: string }[] = [];
    if (stats.posDelta != null && stats.posDelta !== 0) {
      list.push({
        icon: TrendingUp, tile: stats.posDelta > 0 ? 'bg-dash-tile-green' : 'bg-dash-tile-red',
        title: stats.posDelta > 0 ? 'Sentimento em alta' : 'Sentimento em queda',
        text: `O sentimento positivo ${stats.posDelta > 0 ? 'aumentou' : 'caiu'} ${Math.abs(stats.posDelta)} p.p. comparado ao período anterior de mesmo tamanho.`,
      });
    }
    list.push({
      icon: Minus, tile: 'bg-muted/60',
      title: stats.negDelta == null ? 'Sem base de comparação' : Math.abs(stats.negDelta) <= 2 ? 'Estabilidade no período' : stats.negDelta > 0 ? 'Negativos em alta' : 'Negativos em queda',
      text: stats.negDelta == null
        ? 'O período anterior de mesmo tamanho não tem análises para comparar.'
        : Math.abs(stats.negDelta) <= 2
          ? 'O volume de menções negativas se manteve estável comparado ao período anterior de mesmo tamanho.'
          : `As menções negativas ${stats.negDelta > 0 ? 'subiram' : 'caíram'} ${Math.abs(stats.negDelta)} p.p. comparado ao período anterior de mesmo tamanho.`,
    });
    const worst = recent?.departments.find((d) => d.negative > 0 && d.total >= 3);
    if (worst) {
      list.push({
        icon: TrendingUp, tile: 'bg-dash-tile-blue',
        title: 'Oportunidade de melhoria',
        text: `A fila ${worst.department} apresenta ${worst.pct}% de menções negativas. Verifique os principais temas.`,
      });
    }
    return list;
  }, [stats, recent]);

  const scoreMeta = stats ? sentimentLabel(stats.avgScore) : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <DashboardKpiCard index={0} size="hero" chart="line" label="Sentimento Médio"
          value={stats ? stats.avgScore.toFixed(2).replace('.', ',') : '—'}
          delta={stats?.deltaPct != null ? { pct: stats.deltaPct, label: 'vs. período anterior' } : null}
          badge={scoreMeta && <Pill label={scoreMeta.label} tone={scoreMeta.tone} />}
          tile="green" icon={Smile} bars={stats?.scoreSeries ?? null} barsColor="green" />
        <DashboardKpiCard index={1} size="hero" chart="none" label="% Positivo" value={stats ? `${stats.avgPositive}%` : '—'}
          delta={null} tile="green" icon={Smile} bars={null} barsColor="green"
          footer={stats && (
            <div className="mt-1">
              <ProgressBar value={stats.avgPositive} tone="success" height={6} />
              <p className="text-xs text-muted-foreground mt-2">{current.positives.toLocaleString('pt-BR')} de {totalAnalyses.toLocaleString('pt-BR')} conversas</p>
            </div>
          )}
        />
        <DashboardKpiCard index={2} size="hero" chart="none" label="% Negativo" value={stats ? `${stats.avgNegative}%` : '—'}
          delta={null} tile="red" icon={Frown} bars={null} barsColor="red"
          footer={stats && (
            <div className="mt-1">
              <ProgressBar value={stats.avgNegative} tone="danger" height={6} />
              <p className="text-xs text-muted-foreground mt-2">{current.negatives.toLocaleString('pt-BR')} de {totalAnalyses.toLocaleString('pt-BR')} conversas</p>
            </div>
          )}
        />
        <DashboardKpiCard index={3} size="hero" chart="none" label="Alertas de Sentimento" value={stats ? String(stats.totalAlerts) : '—'}
          delta={{ text: 'Conversas que precisam de atenção', tone: 'muted' }} tile="amber" icon={AlertTriangle} bars={null} barsColor="amber"
          aside={(
            <button type="button" onClick={() => navigateToView('inbox')} title="Ver conversas" className="w-9 h-9 rounded-full border border-border/70 bg-input/40 hover:bg-muted/50 flex items-center justify-center">
              <ChevronRight className="w-4 h-4 text-foreground" />
            </button>
          )}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4">
        <DashboardCard testid="sentiment-trend-card" variant="comfortable">
          <SectionHeader icon={Smile} title="Tendência de Sentimento" subtitle="Evolução do sentimento nas conversas ao longo do tempo" tileSize={44} size="lg"
            right={(
              <div className="flex items-center gap-2 h-9 px-3 rounded-lg border border-border/70 bg-input/40 text-[13px] text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <CardSelect value={days} onValueChange={(v) => setDays(v as typeof days)} options={PERIOD_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} name="Período da tendência de sentimento" />
              </div>
            )}
          />
          <div className="h-[260px]">
            {trend.isError ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                <AlertTriangle className="w-10 h-10 opacity-30" />
                <p className="text-sm font-medium text-foreground">Não foi possível carregar a tendência de sentimento</p>
                <p className="text-xs">Falha ao ler as análises do período</p>
                <button type="button" onClick={trend.refetch} className="text-[13px] font-semibold text-primary-glow hover:underline">Tentar de novo</button>
              </div>
            ) : !stats ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                <Smile className="w-10 h-10 opacity-30" />
                <p className="text-sm font-medium text-foreground">Sem dados de sentimento no período</p>
                <p className="text-xs">Os dados aparecem quando houver análises processadas</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="posGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--dash-green))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--dash-green))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="negGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--dash-red))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--dash-red))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.4)" />
                  <XAxis dataKey="date" tick={{ fontSize: CHART_TICK_FONT_SIZE_SM, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: CHART_TICK_FONT_SIZE_SM, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} ticks={[0, 25, 50, 75, 100]} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: CHART_TOOLTIP_FONT_SIZE }} />
                  <Area type="monotone" dataKey="Positivo" stroke="hsl(var(--dash-green))" fill="url(#posGrad)" strokeWidth={2} dot={{ r: 3, fill: 'hsl(var(--dash-green))', strokeWidth: 0 }} />
                  <Area type="monotone" dataKey="Negativo" stroke="hsl(var(--dash-red))" fill="url(#negGrad)" strokeWidth={2} dot={{ r: 3, fill: 'hsl(var(--dash-red))', strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          {stats && (
            <div className="flex items-center justify-center gap-6 mt-3 text-[13px]">
              <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-dash-green" />Sentimento Positivo</span>
              <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-dash-red" />Sentimento Negativo</span>
            </div>
          )}
        </DashboardCard>

        <DashboardCard testid="sentiment-insights-card" variant="comfortable">
          <SectionHeader icon={Lightbulb} title="Principais insights" tileSize={44} size="lg"
            right={onNavigateTab && <button type="button" onClick={() => onNavigateTab('reports')} className="text-[13px] font-semibold text-primary-glow hover:underline">Ver relatório</button>}
          />
          {insights.length === 0 ? (
            <div className="py-8 flex flex-col items-center text-muted-foreground gap-2">
              <Lightbulb className="w-9 h-9 opacity-30" />
              <p className="text-[13px]">Sem insights no período</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {insights.map((ins) => (
                <div key={ins.title} className="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0">
                  <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', ins.tile)}>
                    <ins.icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground">{ins.title}</p>
                    <p className="text-[13px] text-muted-foreground mt-0.5 leading-snug">{ins.text}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-3" />
                </div>
              ))}
            </div>
          )}
        </DashboardCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4">
        <DashboardCard testid="sentiment-alerts-card" variant="comfortable">
          <SectionHeader icon={AlertTriangle} title="Alertas recentes de sentimento" subtitle="Conversas que precisam de atenção imediata" tileSize={44} size="lg" tileColor="red"
            right={<button type="button" onClick={() => navigateToView('inbox')} className="text-[13px] font-semibold text-primary-glow hover:underline">Ver todos ({recent?.totalNegative ?? 0})</button>}
          />
          {!recent || recent.alerts.length === 0 ? (
            <div className="py-8 flex flex-col items-center text-muted-foreground gap-2">
              <AlertTriangle className="w-9 h-9 opacity-30" />
              <p className="text-sm font-medium text-foreground">Sem alertas recentes</p>
              <p className="text-xs">Alertas aparecem quando há sentimento negativo detectado</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {recent.alerts.map((a) => (
                <button key={a.id} type="button" onClick={() => navigateToView('inbox')}
                  className="w-full h-12 grid grid-cols-[88px_1fr_170px_110px_70px_16px] items-center gap-3 text-left hover:bg-muted/20 rounded-lg px-1">
                  <Pill label={a.sentiment === 'neutro' ? 'Neutro' : a.sentiment === 'critico' ? 'Crítico' : 'Negativo'} tone={a.sentiment === 'neutro' ? 'warning' : 'danger'} className="w-[84px] justify-center" />
                  <span className="text-[13px] text-foreground truncate">“{a.summary}”</span>
                  <span className="flex items-center gap-2 min-w-0"><InitialsAvatar name={a.contactName} size={24} /><span className="text-[13px] font-medium text-foreground truncate">{a.contactName}</span></span>
                  <span className="text-xs text-muted-foreground truncate">{a.department ?? '—'}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDistanceToNow(new Date(a.createdAt), { locale: ptBR, addSuffix: true }).replace('cerca de ', '')}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </DashboardCard>

        <DashboardCard testid="sentiment-distribution-card" variant="comfortable">
          <p className="text-lg font-bold text-foreground tracking-[-0.01em] mb-4">Distribuição de Sentimento</p>
          {!stats ? (
            <div className="flex flex-col items-center py-8 text-muted-foreground gap-2">
              <Smile className="w-8 h-8 opacity-30" />
              <p className="text-[13px]">Sem dados de distribuição</p>
            </div>
          ) : (
            <div className="flex items-center gap-5">
              <div className="relative w-[130px] h-[130px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donutData} dataKey="value" cx="50%" cy="50%" innerRadius={44} outerRadius={62} strokeWidth={0} startAngle={90} endAngle={-270}>
                      {donutData.map((_, i) => <Cell key={i} fill={DONUT[i].color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xs text-muted-foreground">Total</span>
                  <span className="text-xl font-bold text-foreground leading-none">{totalAnalyses.toLocaleString('pt-BR')}</span>
                  <span className="text-2xs text-muted-foreground mt-0.5">conversas</span>
                </div>
              </div>
              <div className="flex-1 space-y-3">
                {donutData.map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between text-[13px]">
                    <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: DONUT[i].color }} />{d.name}</div>
                    <div className="flex items-center gap-4 tabular-nums">
                      <span className="font-semibold text-foreground">{d.value}%</span>
                      <span className="text-muted-foreground w-12 text-right">{d.count.toLocaleString('pt-BR')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DashboardCard>
      </div>
    </div>
  );
}
