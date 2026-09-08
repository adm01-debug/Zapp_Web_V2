import { useMemo, useState } from 'react';
import { Trophy, Medal, Star, MessageSquare, Clock, Heart, User, Users, PieChart as PieIcon, Target } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';
import { useLeaderboard } from '@/hooks/gamification/useLeaderboard';

import { DashboardCard, SectionHeader, VerTodasButton, CardSelect } from './overview/DashboardCard';
import { DashboardKpiCard } from './overview/DashboardKpiCard';
import { formatShortDuration } from './overview/formatShortDuration';

const RANK_ICON = [Trophy, Medal, Medal];
const RANK_COLOR = ['text-dash-amber', 'text-muted-foreground', 'text-dash-amber'];
const TIME_OPTIONS = [{ value: 'today', label: 'Hoje' }, { value: 'week', label: 'Esta Semana' }, { value: 'month', label: 'Este Mês' }] as const;

function statusDot(online: boolean) {
  return <span className={cn('inline-block w-1.5 h-1.5 rounded-full shrink-0', online ? 'bg-success' : 'bg-muted-foreground/50')} />;
}

export function AgentPerformancePanel({ onNavigateTab }: { onNavigateTab?: (tab: string) => void }) {
  const { agents, isLoading, timeRange, setTimeRange } = useLeaderboard();

  const onlineCount = agents.filter(a => a.isOnline).length;
  const offlineCount = agents.filter(a => !a.isOnline).length;
  const avgResolved = agents.length > 0 ? Math.round(agents.reduce((s, a) => s + a.conversationsResolved, 0) / agents.length) : 0;
  const avgSat = agents.length > 0 ? (agents.reduce((s, a) => s + a.satisfaction, 0) / agents.length / 100).toFixed(1) : '—';
  const avgResp = agents.length > 0 ? formatShortDuration(agents.reduce((s, a) => s + a.avgResponseTime, 0) / agents.length) : '—';
  const top = agents[0];

  const donutData = [
    { name: 'Online', value: onlineCount, color: 'hsl(var(--dash-green))' },
    { name: 'Offline', value: offlineCount, color: 'hsl(var(--muted))' },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
        <DashboardKpiCard index={0} label="Agentes Online" value={`${onlineCount}/${agents.length}`} delta={{ text: `● ${agents.length ? Math.round((onlineCount / agents.length) * 100) : 0}% online`, tone: 'success' }} tile="blue" icon={User} bars={null} barsColor="blue" />
        <DashboardKpiCard index={1} label="Conversas Resolvidas" value={String(agents.reduce((s, a) => s + a.conversationsResolved, 0))} delta={null} tile="blue" icon={MessageSquare} bars={null} barsColor="blue" />
        <DashboardKpiCard index={2} label="Tempo Médio de Resposta" value={avgResp} delta={null} tile="violet" icon={Clock} bars={null} barsColor="violet" />
        <DashboardKpiCard index={3} label="Satisfação Média" value={`${avgSat}/5`} delta={null} tile="green" icon={Heart} bars={null} barsColor="green" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-2.5">
        <DashboardCard testid="team-ranking-card">
          <SectionHeader icon={Trophy} title="Ranking de Performance" subtitle="Desempenho da equipe em tempo real" tileSize={44}
            right={<CardSelect value={timeRange} onValueChange={(v) => setTimeRange(v as typeof timeRange)} options={TIME_OPTIONS.map(o => ({ value: o.value, label: o.label }))} />}
          />
          {isLoading ? (
            <div className="text-center text-muted-foreground py-10 text-sm">Carregando ranking…</div>
          ) : agents.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-muted-foreground gap-2">
              <Users className="w-10 h-10 opacity-30" />
              <p className="text-sm">Nenhum dado de performance disponível</p>
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[11px] font-semibold text-muted-foreground border-b border-border/60">
                    <th className="text-left pb-2 pl-1 w-8">#</th>
                    <th className="text-left pb-2 px-2">Agente</th>
                    <th className="text-right pb-2 px-2">Resolvidas</th>
                    <th className="text-right pb-2 px-2">Mensagens</th>
                    <th className="text-right pb-2 px-2">Tempo de resposta</th>
                    <th className="text-right pb-2 px-2">XP</th>
                    <th className="text-left pb-2 px-2">Nível</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a, i) => {
                    const isTop3 = i < 3;
                    const Ico = RANK_ICON[i];
                    return (
                      <tr key={a.id} className={cn('h-12 border-b border-border/40 hover:bg-muted/20', isTop3 && 'bg-muted/5')}>
                        <td className="pl-1">
                          {isTop3
                            ? <Ico className={cn('w-4 h-4', RANK_COLOR[i])} />
                            : <span className="text-[12px] text-muted-foreground font-semibold">{a.rank}</span>}
                        </td>
                        <td className="px-2">
                          <div className="flex items-center gap-2">
                            <Avatar className="w-7 h-7 shrink-0"><AvatarImage src={a.avatar} /><AvatarFallback className="bg-primary/10 text-primary text-[9px]">{a.name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                            <div className="min-w-0">
                              <div className="font-medium truncate max-w-[110px]">{a.name}</div>
                              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">{statusDot(a.isOnline)}{a.isOnline ? 'Online' : 'Offline'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="text-right px-2 font-bold text-[15px]">{a.conversationsResolved.toLocaleString('pt-BR')}</td>
                        <td className="text-right px-2 text-muted-foreground">{a.messagesHandled.toLocaleString('pt-BR')}</td>
                        <td className="text-right px-2 text-muted-foreground">{formatShortDuration(a.avgResponseTime)}</td>
                        <td className="text-right px-2 text-muted-foreground">{a.xp.toLocaleString('pt-BR')}</td>
                        <td className="px-2"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/15 text-primary-foreground border border-primary/30">Nvl. {a.level}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </DashboardCard>
        <div className="space-y-2.5">
          {top && (
            <DashboardCard testid="team-highlight-card">
              <SectionHeader icon={Star} title="Destaque do dia" tileSize={34}
                right={<span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/15 text-primary-foreground border border-primary/30">Nvl. {top.level}</span>}
              />
              <div className="mt-3 flex items-center gap-3">
                <Avatar className="w-11 h-11 shrink-0"><AvatarImage src={top.avatar} /><AvatarFallback className="bg-primary/10 text-primary font-semibold">{top.name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                <div><div className="font-bold text-[15px]">{top.name}</div><div className="text-[12px] text-muted-foreground">{top.conversationsResolved} resolvidas</div></div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                {[
                  { label: 'Resolvidas', v: String(top.conversationsResolved) },
                  { label: 'Tempo médio', v: formatShortDuration(top.avgResponseTime) },
                ].map(x => (
                  <div key={x.label} className="rounded-lg bg-muted/30 border border-border/50 p-2 text-center">
                    <div className="font-bold text-[15px]">{x.v}</div>
                    <div className="text-[11px] text-muted-foreground">{x.label}</div>
                  </div>
                ))}
              </div>
            </DashboardCard>
          )}
          <DashboardCard testid="team-distribution-card">
            <SectionHeader icon={PieIcon} title="Distribuição da equipe" tileSize={34} />
            {agents.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-[13px]"><Users className="w-8 h-8 mx-auto mb-2 opacity-30" />Sem agentes</div>
            ) : (
              <div className="mt-3 flex items-center gap-4">
                <ResponsiveContainer width={80} height={80}>
                  <PieChart>
                    <Pie data={donutData} dataKey="value" cx="50%" cy="50%" innerRadius={24} outerRadius={38} strokeWidth={0}>
                      {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 flex-1">
                  {donutData.map(d => (
                    <div key={d.name} className="flex items-center justify-between text-[12px]">
                      <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />{d.name}</div>
                      <span className="font-semibold">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </DashboardCard>
          <DashboardCard testid="team-goals-card">
            <SectionHeader icon={Target} title="Metas da equipe" tileSize={34}
              right={onNavigateTab && <VerTodasButton onClick={() => onNavigateTab('goals')} />}
            />
            <div className="mt-3 text-center py-6 text-muted-foreground text-[13px]">
              <Target className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Acesse a aba Metas para ver o progresso da equipe
            </div>
          </DashboardCard>
        </div>
      </div>
    </div>
  );
}
