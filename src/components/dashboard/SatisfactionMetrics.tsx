import { useState, useMemo } from 'react';
import { MessageCircle, Users, Crown, TrendingUp, BarChart3, Star, Layers, X, Lightbulb } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useSatisfactionBreakdown } from '@/hooks/business/useCSAT';
import { useNPSSurveys } from '@/hooks/business/useNPSSurveys';
import { DashboardCard, SectionHeader, CardSelect } from './overview/DashboardCard';
import { DashboardKpiCard } from './overview/DashboardKpiCard';

const PERIOD_OPTIONS = [
  { value: '7', label: 'Últimos 7 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
] as const;

function EmptyBlock({ icon: Icon, title, sub }: { icon: React.ElementType; title: string; sub: string }) {
  return (
    <div className="flex flex-col items-center py-8 text-muted-foreground gap-2">
      <Icon className="w-9 h-9 opacity-30" />
      <p className="text-[13px] font-medium">{title}</p>
      <p className="text-[12px] opacity-70 text-center max-w-[220px]">{sub}</p>
    </div>
  );
}

function getCSATColor(v: number | null) { if (v === null) return 'text-muted-foreground'; return v >= 85 ? 'text-success' : v >= 70 ? 'text-warning' : 'text-destructive'; }
function getNPSColor(v: number | null) { if (v === null) return 'text-muted-foreground'; return v >= 50 ? 'text-success' : v >= 0 ? 'text-warning' : 'text-destructive'; }

export function SatisfactionMetrics() {
  const [periodDays, setPeriodDays] = useState(30);
  const [tipDismissed, setTipDismissed] = useState(false);
  const { data: breakdown, isLoading, isError, refetch } = useSatisfactionBreakdown(periodDays as 7 | 30 | 90);
  const { surveys: npsSurveys } = useNPSSurveys();

  const npsScore = useMemo(() => {
    if (!npsSurveys?.length) return null;
    const cutoff = new Date(Date.now() - periodDays * 86400000);
    const filtered = npsSurveys.filter(s => new Date(s.created_at) >= cutoff);
    if (!filtered.length) return null;
    const promoters = filtered.filter(s => s.score >= 9).length;
    const detractors = filtered.filter(s => s.score <= 6).length;
    return Math.round(((promoters - detractors) / filtered.length) * 100);
  }, [npsSurveys, periodDays]);

  const hasCsat = (breakdown?.totalResponses ?? 0) > 0;
  const hasQueue = (breakdown?.byQueue?.length ?? 0) > 0;
  const hasTimeline = breakdown?.timeline?.some(t => t.csatPercent !== null) ?? false;

  const timelineData = (breakdown?.timeline ?? []).map(t => ({
    date: format(new Date(t.date ?? '1970-01-01'), 'dd MMM', { locale: ptBR }),
    CSAT: t.csatPercent != null ? Math.round(t.csatPercent) : null,
  }));

  const distributionData = (breakdown?.distribution ?? []).map(d => ({
    nota: `Nota ${d.rating}`, count: d.count,
  }));

  const topAgent = breakdown?.byAgent?.[0];

  if (isError) {
    return (
      <DashboardCard>
        <div className="flex flex-col items-center py-12 text-muted-foreground gap-3">
          <MessageCircle className="w-10 h-10 opacity-30" />
          <p className="text-[14px] font-medium">Erro ao carregar dados de satisfação</p>
          <button onClick={() => refetch()} className="text-[13px] text-primary hover:underline">Tentar novamente</button>
        </div>
      </DashboardCard>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
        <DashboardKpiCard index={0} label="CSAT" value={hasCsat ? `${Math.round(breakdown!.csatPercent!)}%` : '—'}
          delta={null} tile="green" icon={MessageCircle} bars={null} barsColor="green"
          footer={!hasCsat ? <span className="text-[11px] text-muted-foreground">sem avaliações no período</span> : undefined}
        />
        <DashboardKpiCard index={1} label="NPS" value={npsScore != null ? String(npsScore) : '—'}
          delta={null} tile="blue" icon={Users} bars={null} barsColor="blue"
          footer={npsScore == null ? <span className="text-[11px] text-muted-foreground">sem respostas no período</span> : undefined}
        />
        <DashboardKpiCard index={2} label="Respostas CSAT" value={isLoading ? '—' : String(breakdown?.totalResponses ?? 0)}
          delta={null} tile="violet" icon={MessageCircle} bars={null} barsColor="violet"
          footer={<span className="text-[11px] text-muted-foreground">nos últimos {periodDays} dias</span>}
        />
        <DashboardKpiCard index={3} label="Top Agente" value={topAgent?.agentName?.split(' ')[0] ?? '—'}
          delta={topAgent ? { text: `${Math.round(topAgent.csatPercent)}% CSAT`, tone: 'success' } : null}
          tile="amber" icon={Crown} bars={null} barsColor="amber"
          footer={!topAgent ? <span className="text-[11px] text-muted-foreground">sem avaliações no período</span> : undefined}
        />
      </div>

      {/* Body */}
      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-2.5">
        {/* Principal */}
        <div className="space-y-2.5">
          <DashboardCard testid="sat-evolution-card">
            <SectionHeader icon={TrendingUp} title="Evolução da Satisfação" subtitle="CSAT e NPS ao longo do tempo" tileSize={44}
              right={<CardSelect value={String(periodDays)} onValueChange={(v) => setPeriodDays(parseInt(v))} options={PERIOD_OPTIONS.map(o => ({ value: o.value, label: o.label }))} />}
            />
            <div className="mt-3 h-[220px]">
              {!hasTimeline ? (
                <EmptyBlock icon={BarChart3} title="Ainda não há avaliações de satisfação neste período" sub="Quando seus clientes avaliarem os atendimentos, você verá aqui a evolução do CSAT e NPS ao longo do tempo." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timelineData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.4)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} domain={[0, 100]} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="CSAT" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </DashboardCard>
          <DashboardCard testid="sat-distribution-card">
            <SectionHeader icon={BarChart3} title="Distribuição das avaliações (CSAT)" subtitle="Percentual de respostas por nota" tileSize={44} />
            <div className="mt-3 h-[180px]">
              {!hasCsat ? (
                <EmptyBlock icon={Star} title="Sem avaliações no período" sub="As respostas dos clientes aparecerão aqui, distribuídas por nota de 1 a 5." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={distributionData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.4)" vertical={false} />
                    <XAxis dataKey="nota" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="count" name="Respostas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </DashboardCard>
        </div>

        {/* Rail */}
        <div className="space-y-2.5">
          <DashboardCard testid="sat-queue-card">
            <SectionHeader icon={Layers} title="Satisfação por fila" subtitle="CSAT médio e volume de respostas por fila" tileSize={34} />
            {!hasQueue ? (
              <EmptyBlock icon={Layers} title="Sem dados para exibir" sub="Não há avaliações registradas nas filas durante o período selecionado." />
            ) : (
              <div className="mt-3 space-y-2">
                {breakdown!.byQueue.slice(0, 5).map(q => (
                  <div key={q.queueId} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="truncate text-muted-foreground">{q.queueName}</span>
                    <span className={cn('font-semibold', getCSATColor(q.csatPercent))}>{Math.round(q.csatPercent)}%</span>
                  </div>
                ))}
              </div>
            )}
          </DashboardCard>
          <DashboardCard testid="sat-agents-card">
            <SectionHeader icon={Users} title="Top agentes por satisfação" subtitle="Agentes com maior CSAT no período" tileSize={34} />
            {!hasCsat || !breakdown?.byAgent?.length ? (
              <EmptyBlock icon={Users} title="Sem dados para exibir" sub="Ainda não há avaliações de satisfação para os agentes neste período." />
            ) : (
              <div className="mt-3 space-y-2">
                {breakdown.byAgent.slice(0, 5).map((a, i) => (
                  <div key={a.agentId} className="flex items-center justify-between gap-2 text-[13px]">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-muted-foreground w-3">{i + 1}.</span>
                      <span className="truncate">{a.agentName}</span>
                    </div>
                    <span className={cn('font-semibold', getCSATColor(a.csatPercent))}>{Math.round(a.csatPercent)}%</span>
                  </div>
                ))}
              </div>
            )}
          </DashboardCard>
          {!tipDismissed && (
            <DashboardCard testid="sat-tip-card">
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-dash-tile-amber flex items-center justify-center shrink-0"><Lightbulb className="w-4 h-4 text-white/90" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold">Dica</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">Incentive seus clientes a avaliarem os atendimentos. A satisfação do cliente ajuda a identificar pontos de melhoria e reconhecer sua equipe.</p>
                </div>
                <button onClick={() => setTipDismissed(true)} className="shrink-0 w-6 h-6 rounded flex items-center justify-center hover:bg-muted/60"><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
              </div>
            </DashboardCard>
          )}
        </div>
      </div>
    </div>
  );
}
