import { useMemo, useState } from 'react';
import { Trophy, Medal, Star, MessageSquare, Clock, Heart, User, Users, PieChart as PieIcon, Target, Download, Quote } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';
import { useLeaderboard, type LeaderboardAgent } from '@/hooks/gamification/useLeaderboard';
import { useSLAMetrics } from '@/hooks/sla/useSLAMetrics';
import { useExportData } from '@/hooks/system/useExportData';
import { DashboardCard, SectionHeader, VerTodasButton, CardSelect, InitialsAvatar, Pill, GhostButton, ProgressBar, PrimaryButton } from './overview/DashboardCard';
import { DashboardKpiCard } from './overview/DashboardKpiCard';
import { formatShortDuration } from './overview/formatShortDuration';
import { getSLARateTone } from './sla/slaRate';

const TIME_OPTIONS = [{ value: 'today', label: 'Hoje' }, { value: 'week', label: 'Esta Semana' }, { value: 'month', label: 'Este Mês' }] as const;
const SORT_OPTIONS = [
  { value: 'resolved', label: 'Conversas resolvidas' },
  { value: 'messages', label: 'Mensagens' },
  { value: 'response', label: 'Tempo de resposta' },
  { value: 'xp', label: 'XP' },
] as const;
type SortKey = typeof SORT_OPTIONS[number]['value'];

/** Linha destacada do top 3 (mockup: dourado, prata, bronze). */
const RANK_ROW_CLASS = [
  'border-dash-amber/50 bg-dash-amber/5',
  'border-muted-foreground/40 bg-muted/10',
  'border-[hsl(25_80%_50%)]/50 bg-[hsl(25_80%_50%)]/5',
];
const RANK_TILE_CLASS = ['bg-dash-amber/20 text-dash-amber', 'bg-muted/50 text-muted-foreground', 'bg-[hsl(25_80%_50%)]/20 text-[hsl(25_80%_55%)]'];

function StatusLabel({ online }: { online: boolean }) {
  return (
    <span className={cn('flex items-center gap-1.5 text-[12px]', online ? 'text-dash-green' : 'text-muted-foreground')}>
      <span className={cn('w-1.5 h-1.5 rounded-full', online ? 'bg-dash-green' : 'bg-muted-foreground/50')} />
      {online ? 'Online' : 'Offline'}
    </span>
  );
}

function ColHead({ icon: Icon, label, align = 'left' }: { icon?: typeof MessageSquare; label: string; align?: 'left' | 'right' }) {
  return (
    <th className={cn('pb-3 px-2 text-[12px] font-semibold text-muted-foreground whitespace-nowrap', align === 'right' ? 'text-right' : 'text-left')}>
      <span className={cn('inline-flex items-center gap-1.5', align === 'right' && 'justify-end')}>
        {Icon && <Icon className="w-3.5 h-3.5" />}{label}
      </span>
    </th>
  );
}

export function AgentPerformancePanel({ onNavigateTab }: { onNavigateTab?: (tab: string) => void }) {
  const { agents, isLoading, timeRange, setTimeRange } = useLeaderboard();
  const { data: slaData } = useSLAMetrics('week');
  const [sortKey, setSortKey] = useState<SortKey>('resolved');

  // SLA real por agente — cruzamento confirmado no schema:
  //   useSLAMetrics.byAgent[].agentId  = contacts.assigned_to  = profiles.id
  //   useLeaderboard.agents[].profile_id = agent_stats.profile_id = profiles.id
  //   Portanto: agentId === profile_id (match direto, sem fallback por nome).
  const slaByAgent = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of slaData?.byAgent ?? []) {
      map.set(row.agentId, row.overallRate); // agentId == profiles.id
    }
    return (a: LeaderboardAgent): number | null =>
      map.get(a.profile_id) ?? null; // profile_id == profiles.id
  }, [slaData]);

  const sorted = useMemo(() => {
    const list = [...agents];
    const by: Record<SortKey, (a: LeaderboardAgent, b: LeaderboardAgent) => number> = {
      resolved: (a, b) => b.conversationsResolved - a.conversationsResolved,
      messages: (a, b) => b.messagesHandled - a.messagesHandled,
      response: (a, b) => a.avgResponseTime - b.avgResponseTime,
      xp: (a, b) => b.xp - a.xp,
    };
    return list.sort(by[sortKey]);
  }, [agents, sortKey]);

  const { exportCSV } = useExportData<Record<string, unknown>>({
    fileName: 'ranking-equipe',
    columns: [
      { key: 'name', header: 'Agente' },
      { key: 'conversationsResolved', header: 'Resolvidas' },
      { key: 'messagesHandled', header: 'Mensagens' },
      { key: 'avgResponseTime', header: 'Tempo de resposta (s)' },
      { key: 'sla', header: 'SLA (%)' },
      { key: 'xp', header: 'XP' },
      { key: 'level', header: 'Nível' },
    ],
  });
  const handleExport = () => exportCSV(sorted.map((a) => ({
    name: a.name, conversationsResolved: a.conversationsResolved, messagesHandled: a.messagesHandled,
    avgResponseTime: Math.round(a.avgResponseTime), sla: slaByAgent(a) !== null ? Math.round(slaByAgent(a)!) : '', xp: a.xp, level: a.level,
  })));

  const onlineCount = agents.filter((a) => a.isOnline).length;
  const offlineCount = agents.length - onlineCount;
  const totalResolved = agents.reduce((s, a) => s + a.conversationsResolved, 0);
  const avgSat = agents.length > 0 ? (agents.reduce((s, a) => s + a.satisfaction, 0) / agents.length / 100).toFixed(1) : '—';
  const avgResp = agents.length > 0 ? formatShortDuration(agents.reduce((s, a) => s + a.avgResponseTime, 0) / agents.length) : '—';
  const top = sorted[0];
  const topSla = top ? slaByAgent(top) : null;

  const donutData = [
    { name: 'Online', value: onlineCount, color: 'hsl(var(--dash-green))' },
    { name: 'Offline', value: offlineCount, color: 'hsl(var(--muted-foreground) / 0.35)' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <DashboardKpiCard index={0} size="hero" chart="line" label="Agentes online" value={`${onlineCount}/${agents.length}`}
          delta={{ text: `${agents.length ? Math.round((onlineCount / agents.length) * 100) : 0}% da equipe`, tone: 'success' }}
          tile="blue" icon={User} bars={null} barsColor="green" />
        <DashboardKpiCard index={1} size="hero" chart="line" label="Conversas resolvidas" value={String(totalResolved)}
          delta={null} tile="blue" icon={MessageSquare} bars={null} barsColor="blue" />
        <DashboardKpiCard index={2} size="hero" chart="line" label="Tempo médio de resposta" value={avgResp}
          delta={null} tile="violet" icon={Clock} bars={null} barsColor="violet" />
        <DashboardKpiCard index={3} size="hero" chart="line" label="Satisfação média" value={`${avgSat}/5`}
          delta={null} tile="green" icon={Heart} bars={null} barsColor="green" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4">
        <DashboardCard testid="team-ranking-card" variant="comfortable">
          <SectionHeader icon={Trophy} title="Ranking de Performance" subtitle="Desempenho da equipe em tempo real" tileSize={44} size="lg"
            right={(
              <div className="flex items-center gap-2 shrink-0">
                <CardSelect value={timeRange} onValueChange={(v) => setTimeRange(v as typeof timeRange)} options={TIME_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} />
                <div className="hidden md:flex items-center h-9 rounded-lg border border-border/70 bg-input/40 pl-3 text-[13px] text-muted-foreground">
                  <span className="mr-1">Ordenar por</span>
                  <CardSelect value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)} options={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} />
                </div>
                <GhostButton icon={Download} onClick={handleExport}>Exportar</GhostButton>
              </div>
            )}
          />
          {isLoading ? (
            <div className="text-center text-muted-foreground py-12 text-[13px]">Carregando ranking…</div>
          ) : agents.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground gap-2">
              <Users className="w-10 h-10 opacity-30" />
              <p className="text-[13px]">Nenhum dado de performance disponível</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-[13px] border-separate border-spacing-y-1.5 px-1">
                <thead>
                  <tr>
                    <th className="pb-1 pl-3 text-left text-[12px] font-semibold text-muted-foreground w-12">#</th>
                    <ColHead label="Agente" />
                    <ColHead icon={MessageSquare} label="Resolvidas" />
                    <ColHead icon={MessageSquare} label="Mensagens" />
                    <ColHead icon={Clock} label="Tempo de resposta" />
                    <ColHead icon={Target} label="SLA" />
                    <ColHead icon={Star} label="XP" />
                    <ColHead label="Nível" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((a, i) => {
                    const isTop3 = i < 3;
                    const sla = slaByAgent(a);
                    const slaTone = sla === null ? null : getSLARateTone(sla);
                    return (
                      <tr key={a.id} className={cn('h-14', isTop3 ? 'border' : 'hover:bg-muted/20')}>
                        <td className={cn('pl-3 rounded-l-xl border-y border-l', isTop3 ? RANK_ROW_CLASS[i] : 'border-transparent')}>
                          {isTop3 ? (
                            <span className={cn('w-7 h-7 rounded-lg inline-flex items-center justify-center', RANK_TILE_CLASS[i])}>
                              {i === 0 ? <Trophy className="w-4 h-4" /> : <Medal className="w-4 h-4" />}
                            </span>
                          ) : <span className="text-[13px] text-muted-foreground font-semibold pl-2">{i + 1}</span>}
                        </td>
                        <td className={cn('px-2 border-y', isTop3 ? RANK_ROW_CLASS[i] : 'border-transparent')}>
                          <div className="flex items-center gap-3">
                            <InitialsAvatar name={a.name} src={a.avatar} size={36} />
                            <div className="min-w-0">
                              <div className="text-[14px] font-semibold text-foreground truncate max-w-[140px]">{a.name}</div>
                              <StatusLabel online={a.isOnline} />
                            </div>
                          </div>
                        </td>
                        <td className={cn('px-2 border-y', isTop3 ? RANK_ROW_CLASS[i] : 'border-transparent')}>
                          <span className="text-[15px] font-bold text-foreground tabular-nums">{a.conversationsResolved.toLocaleString('pt-BR')}</span>
                        </td>
                        <td className={cn('px-2 border-y text-foreground-secondary tabular-nums', isTop3 ? RANK_ROW_CLASS[i] : 'border-transparent')}>{a.messagesHandled.toLocaleString('pt-BR')}</td>
                        <td className={cn('px-2 border-y text-foreground-secondary tabular-nums', isTop3 ? RANK_ROW_CLASS[i] : 'border-transparent')}>{formatShortDuration(a.avgResponseTime)}</td>
                        <td className={cn('px-2 border-y', isTop3 ? RANK_ROW_CLASS[i] : 'border-transparent')}>
                          {sla === null ? <span className="text-muted-foreground">—</span> : (
                            <div className="w-[110px]">
                              <div className={cn('text-[12px] font-bold tabular-nums mb-1', slaTone === 'success' ? 'text-dash-green' : slaTone === 'warning' ? 'text-dash-amber' : 'text-dash-red')}>{Math.round(sla)}%</div>
                              <ProgressBar value={sla} tone={slaTone === 'success' ? 'success' : slaTone === 'warning' ? 'warning' : 'danger'} height={4} />
                            </div>
                          )}
                        </td>
                        <td className={cn('px-2 border-y text-foreground-secondary tabular-nums', isTop3 ? RANK_ROW_CLASS[i] : 'border-transparent')}>{a.xp.toLocaleString('pt-BR')}</td>
                        <td className={cn('px-2 pr-3 rounded-r-xl border-y border-r', isTop3 ? RANK_ROW_CLASS[i] : 'border-transparent')}>
                          <Pill label={`Nvl. ${a.level}`} tone="info" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </DashboardCard>

        <div className="space-y-4">
          {top && (
            <DashboardCard testid="team-highlight-card" variant="comfortable">
              <SectionHeader icon={Star} title="Destaque do dia" tileSize={34} size="lg" iconClassName="text-dash-amber fill-dash-amber"
                right={<Pill label={`Nvl. ${top.level}`} tone="info" />}
              />
              <div className="flex items-center gap-4">
                <InitialsAvatar name={top.name} src={top.avatar} size={56} />
                <div className="min-w-0">
                  <div className="text-[16px] font-bold text-foreground">{top.name}</div>
                  <div className="text-[13px] text-muted-foreground">Maior número de conversas resolvidas no período. Excelente trabalho!</div>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 mt-4">
                {[
                  { label: 'Resolvidas', v: String(top.conversationsResolved) },
                  { label: 'SLA', v: topSla === null ? '—' : `${Math.round(topSla)}%` },
                  { label: 'Tempo médio', v: formatShortDuration(top.avgResponseTime) },
                  { label: 'Satisfação', v: (top.satisfaction / 100).toFixed(1) },
                ].map((x) => (
                  <div key={x.label} className="rounded-xl bg-muted/20 border border-border/50 p-2.5 text-center">
                    <div className="font-bold text-[16px] text-foreground tabular-nums">{x.v}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{x.label}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl bg-primary/10 border border-primary/25 p-3.5 flex items-start gap-3">
                <Quote className="w-5 h-5 text-primary-glow shrink-0" />
                <p className="text-[13px] text-foreground leading-snug">“Trabalho em equipe transforma atendimento em resultados.”</p>
              </div>
            </DashboardCard>
          )}

          <DashboardCard testid="team-distribution-card" variant="comfortable">
            <p className="text-[18px] font-bold text-foreground tracking-[-0.01em] mb-4">Distribuição da equipe</p>
            {agents.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-[13px]"><Users className="w-8 h-8 mx-auto mb-2 opacity-30" />Sem agentes</div>
            ) : (
              <div className="flex items-center gap-5">
                <div className="relative w-[110px] h-[110px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={donutData} dataKey="value" cx="50%" cy="50%" innerRadius={38} outerRadius={52} strokeWidth={0} startAngle={90} endAngle={-270}>
                        {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[20px] font-bold text-foreground leading-none">{agents.length}</span>
                    <span className="text-[11px] text-muted-foreground mt-0.5">Agentes</span>
                  </div>
                </div>
                <div className="flex-1 space-y-2.5">
                  {donutData.map((d) => (
                    <div key={d.name} className="flex items-center justify-between text-[13px]">
                      <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />{d.name}</div>
                      <div className="flex items-center gap-4 tabular-nums">
                        <span className="font-semibold text-foreground">{d.value}</span>
                        <span className="text-muted-foreground w-9 text-right">{agents.length ? Math.round((d.value / agents.length) * 100) : 0}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </DashboardCard>

          <DashboardCard testid="team-goals-card" variant="comfortable">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[18px] font-bold text-foreground tracking-[-0.01em]">Metas da equipe</p>
              {onNavigateTab && <VerTodasButton onClick={() => onNavigateTab('goals')} />}
            </div>
            <div className="text-center py-5 text-muted-foreground">
              <Target className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-[13px]">As metas são configuradas por agente na aba Metas.</p>
              {onNavigateTab && <PrimaryButton size="sm" className="mt-3" onClick={() => onNavigateTab('goals')}>Abrir Metas</PrimaryButton>}
            </div>
          </DashboardCard>
        </div>
      </div>
    </div>
  );
}
