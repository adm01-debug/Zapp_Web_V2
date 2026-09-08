import { useState, useMemo } from 'react';
import { MessageCircle, Users, Crown, TrendingUp, BarChart3, Star, Layers, X, Lightbulb, Calendar, User, Minus } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { cn } from '@/lib/utils';
import { useSatisfactionBreakdown } from '@/hooks/business/useCSAT';
import { useNPSSurveys } from '@/hooks/business/useNPSSurveys';
import { DashboardCard, SectionHeader, CardSelect, PrimaryButton, InitialsAvatar } from './overview/DashboardCard';
import { DashboardKpiCard } from './overview/DashboardKpiCard';

const PERIOD_OPTIONS = [
  { value: '7', label: 'Últimos 7 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
] as const;

function EmptyBlock({ icon: Icon, title, sub, action }: { icon: React.ElementType; title: string; sub: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center py-8 text-muted-foreground gap-2">
      <Icon className="w-9 h-9 text-primary-glow/70" strokeWidth={1.6} />
      <p className="text-[14px] font-semibold text-foreground text-center">{title}</p>
      <p className="text-[12.5px] text-center max-w-[360px] leading-snug">{sub}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Lado direito do KPI hero quando não há dado: ícone + rótulo (mockup Satisfação). */
function KpiEmptyAside({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 w-[100px] text-muted-foreground/70">
      <Icon className="w-6 h-6" strokeWidth={1.6} />
      <span className="text-[11px] text-center leading-tight">{label}</span>
    </div>
  );
}

function getCSATColor(v: number | null) { if (v === null) return 'text-muted-foreground'; return v >= 85 ? 'text-success' : v >= 70 ? 'text-warning' : 'text-destructive'; }
function getNPSColor(v: number | null) { if (v === null) return 'text-muted-foreground'; return v >= 50 ? 'text-success' : v >= 0 ? 'text-warning' : 'text-destructive'; }

export function SatisfactionMetrics() {
  const [periodDays, setPeriodDays] = useState(30);
  const [tipDismissed, setTipDismissed] = useState(false);
  const [chartMode, setChartMode] = useState('both');
  const [queueMode, setQueueMode] = useState('csat');
  const [topN, setTopN] = useState('5');
  const { data: breakdown, isLoading, isError, refetch } = useSatisfactionBreakdown(periodDays as 7 | 30 | 90);
  const { surveys: npsSurveys } = useNPSSurveys();

  // react-hooks/purity acusa `Date.now()` (mesmo fora do useMemo) mas não `new Date()`
  // (mesmo padrão já usado em GreetingBanner.tsx) — daí getTime() em vez de Date.now().
  const now = new Date().getTime();
  const npsScore = useMemo(() => {
    if (!npsSurveys?.length) return null;
    const cutoffMs = periodDays * 86400000;
    const filtered = npsSurveys.filter(s => now - Date.parse(s.created_at) <= cutoffMs);
    if (!filtered.length) return null;
    const promoters = filtered.filter(s => s.score >= 9).length;
    const detractors = filtered.filter(s => s.score <= 6).length;
    return Math.round(((promoters - detractors) / filtered.length) * 100);
  }, [npsSurveys, periodDays, now]);

  const hasCsat = (breakdown?.totalResponses ?? 0) > 0;
  const hasQueue = (breakdown?.byQueue?.length ?? 0) > 0;
  const hasTimeline = breakdown?.timeline?.some(t => t.csatPercent !== null) ?? false;

  // `t.date` já vem formatado ('dd/MM') de useSatisfactionBreakdown — não é ISO,
  // reformatar com date-fns aqui lança RangeError (Invalid time value).
  const timelineData = (breakdown?.timeline ?? []).map(t => ({
    date: t.date,
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

  const cyclePeriod = () => setPeriodDays(periodDays === 7 ? 30 : periodDays === 30 ? 90 : 7);

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <DashboardKpiCard index={0} size="hero" label="CSAT" value={hasCsat ? `${Math.round(breakdown!.csatPercent!)}%` : '—'}
          valueClassName={hasCsat ? getCSATColor(breakdown!.csatPercent!) : 'text-muted-foreground'}
          delta={hasCsat ? null : { text: 'sem período anterior', tone: 'muted' }}
          tile="green" icon={MessageCircle} bars={null} barsColor="green" chart="line"
          aside={!hasCsat ? <KpiEmptyAside icon={TrendingUp} label="Sem avaliações no período" /> : undefined}
        />
        <DashboardKpiCard index={1} size="hero" label="NPS" value={npsScore != null ? String(npsScore) : '—'}
          valueClassName={npsScore != null ? getNPSColor(npsScore) : 'text-muted-foreground'}
          delta={npsScore != null ? null : { text: 'sem respostas no período', tone: 'muted' }}
          tile="blue" icon={Users} bars={null} barsColor="blue" chart="bars"
          aside={npsScore == null ? <KpiEmptyAside icon={BarChart3} label="Sem avaliações no período" /> : undefined}
        />
        <DashboardKpiCard index={2} size="hero" label="Respostas CSAT" value={isLoading ? '—' : String(breakdown?.totalResponses ?? 0)}
          delta={{ text: `nos últimos ${periodDays} dias`, tone: 'muted' }}
          tile="violet" icon={MessageCircle} bars={null} barsColor="violet" chart="none"
          aside={<KpiEmptyAside icon={Minus} label="Sem variação" />}
        />
        <DashboardKpiCard index={3} size="hero" label="Top Agente" value={topAgent?.agentName?.split(' ')[0] ?? 'Sem dados'}
          valueClassName={topAgent ? undefined : 'text-[22px] text-muted-foreground'}
          delta={topAgent ? { text: `${Math.round(topAgent.csatPercent)}% CSAT`, tone: 'success' } : { text: 'no período selecionado', tone: 'muted' }}
          tile="amber" icon={Crown} bars={null} barsColor="amber" chart="none"
          aside={topAgent ? <InitialsAvatar name={topAgent.agentName} size={44} /> : <KpiEmptyAside icon={User} label="Sem avaliações no período" />}
        />
      </div>

      {/* Body */}
      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4">
        {/* Principal */}
        <div className="space-y-4">
          <DashboardCard testid="sat-evolution-card" variant="comfortable">
            <SectionHeader icon={TrendingUp} title="Evolução da Satisfação" subtitle="CSAT e NPS ao longo do tempo" tileSize={44} size="lg"
              right={(
                <div className="flex items-center gap-2">
                  <CardSelect value={chartMode} onValueChange={setChartMode} options={[{ value: 'both', label: 'CSAT e NPS' }, { value: 'csat', label: 'Somente CSAT' }]} testid="sat-chart-mode" />
                  <CardSelect value={String(periodDays)} onValueChange={(v) => setPeriodDays(parseInt(v))} options={PERIOD_OPTIONS.map(o => ({ value: o.value, label: o.label }))} testid="sat-period" />
                </div>
              )}
            />
            <div className="relative h-[280px]">
              {!hasTimeline ? (
                <>
                  {/* Eixos desenhados mesmo sem dado (mockup) */}
                  <div className="absolute inset-0 flex">
                    <div className="w-10 flex flex-col justify-between py-2 text-[11px] text-muted-foreground/70 text-right pr-2 relative">
                      <span className="absolute -left-4 top-1/2 -rotate-90 origin-center text-[11px] text-muted-foreground/60 whitespace-nowrap">Pontuação</span>
                      {[100, 75, 50, 25, 0].map((v) => <span key={v}>{v}</span>)}
                    </div>
                    <div className="flex-1 border-l border-b border-border/50 relative">
                      {[0, 1, 2, 3].map((i) => <div key={i} className="absolute left-0 right-0 border-t border-dashed border-border/30" style={{ top: `${(i + 1) * 20}%` }} />)}
                      <div className="absolute left-0 right-0 -bottom-6 flex justify-between text-[11px] text-muted-foreground/70 px-2">
                        {['08h', '10h', '12h', '14h', '16h', '18h', '20h'].map((h) => <span key={h}>{h}</span>)}
                      </div>
                    </div>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <EmptyBlock icon={BarChart3} title="Ainda não há avaliações de satisfação neste período"
                      sub="Quando seus clientes avaliarem os atendimentos, você verá aqui a evolução do CSAT e NPS ao longo do tempo."
                      action={<PrimaryButton icon={Calendar} onClick={cyclePeriod}>Selecionar outro período</PrimaryButton>}
                    />
                  </div>
                </>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timelineData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.4)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                    <Line type="monotone" dataKey="CSAT" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: 'hsl(var(--primary))' }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="flex items-center justify-center gap-6 mt-8 text-[13px]">
              <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-primary" />CSAT</span>
              {chartMode === 'both' && <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-dash-green" />NPS</span>}
            </div>
          </DashboardCard>

          <DashboardCard testid="sat-distribution-card" variant="comfortable">
            <SectionHeader icon={BarChart3} title="Distribuição das avaliações (CSAT)" subtitle="Percentual de respostas por nota" tileSize={44} size="lg" />
            <div className="h-[200px] rounded-xl border border-border/50 bg-muted/10 flex items-center justify-center">
              {!hasCsat ? (
                <EmptyBlock icon={Star} title="Sem avaliações no período" sub="As respostas dos clientes aparecerão aqui, distribuídas por nota de 1 a 5." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={distributionData} margin={{ top: 12, right: 12, left: -12, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.4)" vertical={false} />
                    <XAxis dataKey="nota" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="count" name="Respostas" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </DashboardCard>
        </div>

        {/* Rail */}
        <div className="space-y-4">
          <DashboardCard testid="sat-queue-card" variant="comfortable">
            <SectionHeader icon={Layers} title="Satisfação por fila" subtitle="CSAT médio e volume de respostas por fila" tileSize={44} size="lg"
              right={<CardSelect value={queueMode} onValueChange={setQueueMode} options={[{ value: 'csat', label: 'CSAT' }, { value: 'volume', label: 'Volume' }]} testid="sat-queue-mode" />}
            />
            <div className="rounded-xl border border-border/50 bg-muted/10 min-h-[150px] flex items-center justify-center">
              {!hasQueue ? (
                <EmptyBlock icon={Layers} title="Sem dados para exibir" sub="Não há avaliações registradas nas filas durante o período selecionado." />
              ) : (
                <div className="w-full p-3 space-y-2.5">
                  {[...breakdown!.byQueue].sort((a, b) => queueMode === 'volume' ? b.responses - a.responses : b.csatPercent - a.csatPercent).slice(0, 5).map(q => (
                    <div key={q.queueId} className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="truncate text-foreground">{q.queueName}</span>
                      <span className={cn('font-semibold tabular-nums', getCSATColor(q.csatPercent))}>{queueMode === 'volume' ? q.responses : `${Math.round(q.csatPercent)}%`}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DashboardCard>

          <DashboardCard testid="sat-agents-card" variant="comfortable">
            <SectionHeader icon={Users} title="Top agentes por satisfação" subtitle="Agentes com maior CSAT no período" tileSize={44} size="lg"
              right={(
                <div className="flex items-center gap-2">
                  <CardSelect value="csat" onValueChange={() => undefined} options={[{ value: 'csat', label: 'CSAT' }]} testid="sat-agents-mode" />
                  <CardSelect value={topN} onValueChange={setTopN} options={[{ value: '3', label: 'Top 3' }, { value: '5', label: 'Top 5' }, { value: '10', label: 'Top 10' }]} testid="sat-agents-top" />
                </div>
              )}
            />
            <div className="rounded-xl border border-border/50 bg-muted/10 min-h-[150px] flex items-center justify-center">
              {!hasCsat || !breakdown?.byAgent?.length ? (
                <EmptyBlock icon={User} title="Sem dados para exibir" sub="Ainda não há avaliações de satisfação para os agentes neste período." />
              ) : (
                <div className="w-full p-3 space-y-2.5">
                  {breakdown.byAgent.slice(0, parseInt(topN)).map((a, i) => (
                    <div key={a.agentId} className="flex items-center justify-between gap-2 text-[13px]">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-[11px] font-bold text-muted-foreground w-3">{i + 1}.</span>
                        <InitialsAvatar name={a.agentName} size={24} />
                        <span className="truncate text-foreground">{a.agentName}</span>
                      </div>
                      <span className={cn('font-semibold tabular-nums', getCSATColor(a.csatPercent))}>{Math.round(a.csatPercent)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DashboardCard>

          {!tipDismissed && (
            <DashboardCard testid="sat-tip-card" variant="comfortable" className="bg-primary/5 border-primary/25">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-dash-tile-blue flex items-center justify-center shrink-0"><Lightbulb className="w-5 h-5 text-white" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-bold text-primary-glow">Dica</p>
                  <p className="text-[13px] text-muted-foreground mt-0.5 leading-snug">Incentive seus clientes a avaliarem os atendimentos. A satisfação do cliente ajuda a identificar pontos de melhoria e reconhecer sua equipe.</p>
                </div>
                <button onClick={() => setTipDismissed(true)} className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center hover:bg-muted/60"><X className="w-4 h-4 text-muted-foreground" /></button>
              </div>
            </DashboardCard>
          )}
        </div>
      </div>
    </div>
  );
}
