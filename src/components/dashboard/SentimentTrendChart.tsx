import { useState, useMemo } from 'react';
import { Smile, Frown, AlertTriangle, BarChart3, PieChart as PieIcon, ChevronRight } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useRealSentimentData } from './SentimentHelpers';
import { DashboardCard, SectionHeader, CardSelect } from './overview/DashboardCard';
import { DashboardKpiCard } from './overview/DashboardKpiCard';

const PERIOD_OPTIONS = [
  { value: '7', label: 'Últimos 7 dias' },
  { value: '14', label: 'Últimos 14 dias' },
  { value: '30', label: 'Últimos 30 dias' },
] as const;

const DONUT_COLORS = [
  'hsl(var(--dash-green))',
  'hsl(var(--muted-foreground))',
  'hsl(var(--dash-red))',
];

export function SentimentTrendChart() {
  const [days, setDays] = useState<'7' | '14' | '30'>('14');
  const data = useRealSentimentData(parseInt(days));

  const stats = useMemo(() => {
    if (!data || data.length === 0) return null;
    const totalAlerts = data.reduce((s, d) => s + d.alerts_count, 0);
    const avgPositive = data.reduce((s, d) => s + d.positive, 0) / data.length;
    const avgNegative = data.reduce((s, d) => s + d.negative, 0) / data.length;
    const avgScore = data.reduce((s, d) => s + d.avg_score, 0) / data.length;
    const half = Math.ceil(data.length / 2);
    const recentAvg = data.slice(half).reduce((s, d) => s + d.avg_score, 0) / data.slice(half).length;
    const prevAvg = data.slice(0, half).reduce((s, d) => s + d.avg_score, 0) / (half || 1);
    const deltaPct = prevAvg > 0 ? Math.round(((recentAvg - prevAvg) / prevAvg) * 100) : null;
    const totalConversations = data.reduce((s, d) => s + d.neutral + d.positive + d.negative, 0) / data.length;
    return { avgScore: Math.round(avgScore * 100) / 100, totalAlerts, avgPositive: Math.round(avgPositive), avgNegative: Math.round(avgNegative), deltaPct, totalConversations: Math.round(totalConversations) };
  }, [data]);

  const chartData = (data ?? []).map(d => ({
    date: format(parseISO(d.date), 'dd MMM', { locale: ptBR }),
    Positivo: d.positive,
    Negativo: d.negative,
  }));

  const donutData = stats ? [
    { name: 'Positivo', value: stats.avgPositive },
    { name: 'Neutro', value: Math.max(0, 100 - stats.avgPositive - stats.avgNegative) },
    { name: 'Negativo', value: stats.avgNegative },
  ] : [];

  return (
    <div className="space-y-2.5">
      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
        <DashboardKpiCard index={0} label="Sentimento Médio" value={stats ? stats.avgScore.toFixed(2).replace('.', ',') : '—'}
          delta={stats?.deltaPct != null ? { pct: stats.deltaPct } : null} tile="green" icon={Smile} bars={null} barsColor="green" />
        <DashboardKpiCard index={1} label="% Positivo" value={stats ? `${stats.avgPositive}%` : '—'}
          delta={null} tile="green" icon={Smile} bars={null} barsColor="green"
          footer={data && <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1"><div className="h-full rounded-full bg-success" style={{ width: `${stats?.avgPositive ?? 0}%` }} /></div>}
        />
        <DashboardKpiCard index={2} label="% Negativo" value={stats ? `${stats.avgNegative}%` : '—'}
          delta={null} tile="red" icon={Frown} bars={null} barsColor="red"
          footer={data && <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1"><div className="h-full rounded-full bg-destructive" style={{ width: `${stats?.avgNegative ?? 0}%` }} /></div>}
        />
        <DashboardKpiCard index={3} label="Alertas de Sentimento" value={stats ? String(stats.totalAlerts) : '—'}
          delta={null} tile="amber" icon={AlertTriangle} bars={null} barsColor="amber" />
      </div>

      {/* Body */}
      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-2.5">
        <DashboardCard testid="sentiment-trend-card">
          <SectionHeader icon={BarChart3} title="Tendência de Sentimento" subtitle="Evolução do sentimento nas conversas ao longo do tempo" tileSize={44}
            right={<CardSelect value={days} onValueChange={(v) => setDays(v as typeof days)} options={PERIOD_OPTIONS.map(o => ({ value: o.value, label: o.label }))} />}
          />
          <div className="mt-3 h-[240px]">
            {!data || data.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                <BarChart3 className="w-10 h-10 opacity-30" />
                <p className="text-[13px]">Sem dados de sentimento no período</p>
                <p className="text-[12px] opacity-70">Dados aparecerão quando houver análises processadas</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
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
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.4)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12, marginTop: 8 }} />
                  <Area type="monotone" dataKey="Positivo" stroke="hsl(var(--dash-green))" fill="url(#posGrad)" strokeWidth={2} dot={{ r: 3, fill: 'hsl(var(--dash-green))' }} />
                  <Area type="monotone" dataKey="Negativo" stroke="hsl(var(--dash-red))" fill="url(#negGrad)" strokeWidth={2} dot={{ r: 3, fill: 'hsl(var(--dash-red))' }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </DashboardCard>

        <div className="space-y-2.5">
          <DashboardCard testid="sentiment-distribution-card">
            <SectionHeader icon={PieIcon} title="Distribuição de Sentimento" tileSize={34} />
            {!stats ? (
              <div className="flex flex-col items-center py-8 text-muted-foreground gap-2">
                <PieIcon className="w-8 h-8 opacity-30" />
                <p className="text-[13px]">Sem dados de distribuição</p>
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-3">
                <ResponsiveContainer width={80} height={80}>
                  <PieChart>
                    <Pie data={donutData} dataKey="value" cx="50%" cy="50%" innerRadius={24} outerRadius={38} strokeWidth={0}>
                      {donutData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 flex-1">
                  {donutData.map((d, i) => (
                    <div key={d.name} className="flex items-center justify-between text-[12px]">
                      <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: DONUT_COLORS[i] }} />{d.name}</div>
                      <span className="font-semibold tabular-nums">{d.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </DashboardCard>
          <DashboardCard testid="sentiment-insights-card">
            <SectionHeader icon={AlertTriangle} title="Alertas Recentes" tileSize={34} />
            <div className="mt-4 flex flex-col items-center text-muted-foreground gap-2 py-4">
              <AlertTriangle className="w-8 h-8 opacity-30" />
              <p className="text-[13px]">Sem alertas recentes</p>
              <p className="text-[12px] opacity-70">Alertas aparecerão com sentimento negativo detectado</p>
            </div>
          </DashboardCard>
        </div>
      </div>
    </div>
  );
}
