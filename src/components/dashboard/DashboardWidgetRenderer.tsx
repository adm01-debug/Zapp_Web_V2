import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { motion, StaggeredList, StaggeredItem } from '@/components/ui/motion';
import { EmptyState } from '@/components/ui/empty-state';
import { getAvatarColor, getInitials } from '@/lib/avatar-colors';
import {
  MessageSquare, Users, Clock, CheckCircle2,
  Sparkles, Target,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimatedBadge, StatCardWithGamification } from './GamificationEffects';
import { useGoalsDashboard } from '@/hooks/analytics/useGoalsDashboard';
import { Leaderboard } from '@/components/leaderboard/Leaderboard';
import { DemoAchievements } from '@/components/gamification/DemoAchievements';
import { TrainingMiniGames } from '@/components/gamification/TrainingMiniGames';
import { AIStatsWidget } from './AIStatsWidget';
import { DashboardWidget } from '@/hooks/analytics/useDashboardWidgets';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatResponseTime } from '@/hooks/analytics/useDashboardData';

export interface DashboardStats {
  openConversations: number;
  totalConversations: number;
  avgResponseTime: number | null;
  onlineAgents: number;
  totalAgents: number;
  resolvedToday: number;
  pendingConversations: number;
  queuesStats: Array<{
    id: string;
    name: string;
    color: string;
    waitingCount: number;
    onlineAgents: number;
    totalAgents: number;
  }>;
  recentActivity: Array<{
    id: string;
    contactName: string;
    contactAvatar: string | null;
    lastMessage: string;
    timestamp: string;
    status: string;
  }>;
}

export function buildStatsCards(stats: DashboardStats) {
  const openRate = stats.totalConversations > 0
    ? Math.round((stats.openConversations / stats.totalConversations) * 100)
    : 0;
  const resolvedRate = stats.totalConversations > 0
    ? Math.round((stats.resolvedToday / stats.totalConversations) * 100)
    : 0;
  const agentUtilization = stats.totalAgents > 0
    ? Math.round((stats.onlineAgents / stats.totalAgents) * 100)
    : 0;

  return [
    {
      title: 'Conversas Abertas',
      value: stats.openConversations,
      change: `${openRate}% do total`,
      changeType: (stats.openConversations > 0 ? 'positive' : 'neutral') as 'positive' | 'neutral',
      icon: MessageSquare,
      gradient: 'from-primary to-warning',
      iconBg: 'bg-primary/15',
    },
    {
      title: 'Tempo Médio de Resposta',
      value: formatResponseTime(stats.avgResponseTime),
      change: stats.avgResponseTime !== null && stats.avgResponseTime < 180 ? 'Dentro do SLA' : stats.avgResponseTime !== null ? 'Acima do SLA' : 'Sem dados',
      changeType: (stats.avgResponseTime !== null && stats.avgResponseTime < 180 ? 'positive' : 'negative') as 'positive' | 'negative',
      invertTrend: true,
      icon: Clock,
      gradient: 'from-info to-info',
      iconBg: 'bg-info/15',
      achievement: { label: 'Resposta Rápida!', unlocked: stats.avgResponseTime !== null && stats.avgResponseTime < 180 },
    },
    {
      title: 'Atendentes Online',
      value: `${stats.onlineAgents}/${stats.totalAgents}`,
      change: `${agentUtilization}% online`,
      changeType: (stats.onlineAgents > 0 ? 'positive' : 'negative') as 'positive' | 'negative',
      icon: Users,
      gradient: 'from-success to-success',
      iconBg: 'bg-success/15',
    },
    {
      title: 'Resolvidas Hoje',
      value: stats.resolvedToday,
      change: `${resolvedRate}% do total`,
      changeType: (stats.resolvedToday > 0 ? 'positive' : 'neutral') as 'positive' | 'neutral',
      icon: CheckCircle2,
      gradient: 'from-coins to-warning',
      iconBg: 'bg-coins/15',
      achievement: { label: 'Meta Batida!', unlocked: stats.resolvedToday >= 5 },
    },
  ];
}

export function DashboardWidgetRenderer({ widget, stats }: { widget: DashboardWidget; stats: DashboardStats }) {
  const statsCards = buildStatsCards(stats);

  switch (widget.type) {
    case 'stats':
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statsCards.map((stat, index) => (
            <StatCardWithGamification
              key={stat.title}
              title={stat.title}
              value={stat.value}
              change={stat.change}
              changeType={stat.changeType as 'positive' | 'negative'}
              invertTrend={stat.invertTrend}
              icon={stat.icon}
              gradient={stat.gradient}
              iconBg={stat.iconBg}
              achievement={stat.achievement}
              index={index}
            />
          ))}
        </div>
      );

    case 'challenges':
      return <ChallengesWidget stats={stats} />;

    case 'ai-stats':
      return <AIStatsWidget />;

    case 'queues':
      return <QueuesWidget stats={stats} />;

    case 'leaderboard':
      return <Leaderboard />;

    case 'activity':
      return <ActivityWidget stats={stats} />;

    case 'achievements':
      return <DemoAchievements />;

    case 'mini-games':
      return <TrainingMiniGames />;

    default:
      return null;
  }
}

/** Alvo de cada desafio = regra do jogo (o que a tela NÃO pode inventar é o
 *  valor alcançado: ele vem sempre do dado do dia). */
const CHALLENGE_TARGETS = {
  messages: 10,
  resolved: 5,
  responseSeconds: 180,
} as const;

type ChallengeKind = 'higher-is-better' | 'lower-is-better' | 'zero-is-best';

export interface DailyChallenge {
  id: string;
  label: string;
  target: number;
  current: number | null;
  /** 0–100, calculado do dado real. */
  progress: number;
  done: boolean;
  /** false = a fonte não trouxe o dado do dia (nada é exibido como número). */
  hasData: boolean;
  /** Valor e meta já formatados (fonte da coluna direita do desafio). */
  valueLabel: string;
  targetLabel: string;
}

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

function progressOf(input: { current: number | null; target: number; kind: ChallengeKind }) {
  const { current, target, kind } = input;
  if (current === null) return { progress: 0, done: false, hasData: false };
  if (kind === 'zero-is-best') {
    const done = current === 0;
    return { progress: done ? 100 : clampPercent(100 - current * 10), done, hasData: true };
  }
  if (kind === 'lower-is-better') {
    const done = current <= target;
    // Proporcional: 180s de meta com 360s medidos = 50% do caminho andado.
    return { progress: done ? 100 : clampPercent((target / Math.max(current, 1)) * 100), done, hasData: true };
  }
  const done = current >= target;
  return { progress: clampPercent((current / target) * 100), done, hasData: true };
}

/**
 * Desafios do Dia com dado real do dia: mensagens enviadas pelo agente
 * (`useGoalsDashboard`, mesma fonte das Metas), conversas resolvidas e tempo
 * médio (`useDashboardKpi` via stats) e pendências na fila.
 */
function buildDailyChallenges(stats: DashboardStats, sentMessagesToday: number | null): DailyChallenge[] {
  const inputs = [
    {
      id: 'messages', label: 'Mensagens enviadas', target: CHALLENGE_TARGETS.messages,
      kind: 'higher-is-better' as ChallengeKind, current: sentMessagesToday,
      format: (v: number) => String(v),
    },
    {
      id: 'resolved', label: 'Conversas resolvidas', target: CHALLENGE_TARGETS.resolved,
      kind: 'higher-is-better' as ChallengeKind, current: stats.resolvedToday,
      format: (v: number) => String(v),
    },
    {
      id: 'response-time', label: 'Tempo médio de resposta', target: CHALLENGE_TARGETS.responseSeconds,
      kind: 'lower-is-better' as ChallengeKind, current: stats.avgResponseTime,
      format: (v: number) => formatResponseTime(v),
    },
    {
      id: 'pending', label: 'Pendências na fila', target: 0,
      kind: 'zero-is-best' as ChallengeKind, current: stats.pendingConversations,
      format: (v: number) => String(v),
    },
  ];

  return inputs.map(({ format, ...input }) => ({
    ...input,
    ...progressOf(input),
    valueLabel: input.current === null ? '' : format(input.current),
    targetLabel: input.kind === 'zero-is-best' ? '0' : format(input.target),
  }));
}

function ChallengesWidget({ stats }: { stats: DashboardStats }) {
  const { goals, isLoading } = useGoalsDashboard();
  const sentMessagesToday = isLoading
    ? null
    : goals.find((goal) => goal.id === 'messages-sent')?.current ?? null;
  const challenges = buildDailyChallenges(stats, sentMessagesToday);
  const doneCount = challenges.filter((challenge) => challenge.done).length;
  const hasDataToday = sentMessagesToday !== null
    || stats.resolvedToday > 0
    || stats.pendingConversations > 0
    || stats.avgResponseTime !== null;

  return (
    <Card className="card-glow-gradient border-secondary/20 overflow-hidden bg-card">
      <CardHeader className="border-b border-secondary/20 bg-secondary/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div
              className="w-10 h-10 rounded-xl bg-secondary/15 flex items-center justify-center glow-purple-pulse-slow"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Target className="w-5 h-5 text-secondary" />
            </motion.div>
            <h2 className="font-display text-lg font-semibold text-foreground">Desafios do Dia</h2>
          </div>
          {hasDataToday && (
            <AnimatedBadge value={`${doneCount}/${challenges.length}`} variant="achievement" size="sm" />
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {!hasDataToday ? (
          <div data-testid="challenges-sem-dados" className="flex flex-col items-center justify-center gap-2 min-h-[120px]">
            <p className="text-sm font-medium text-foreground">Sem dados hoje</p>
            <p className="text-xs text-muted-foreground text-center">Os desafios aparecem quando houver atendimento no dia.</p>
          </div>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {challenges.map((challenge, i) => (
            <motion.div
              key={challenge.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 + i * 0.05 }}
              whileHover={{ scale: 1.02 }}
              className={cn(
                "p-4 rounded-xl border transition-all duration-300",
                challenge.done
                  ? "bg-success/10 border-success/30"
                  : "bg-muted/30 border-border/30 hover:border-primary/20"
              )}
            >
              <div className="flex items-start justify-between mb-2">
                <p className="text-sm font-medium text-foreground">{challenge.label}</p>
                {challenge.done && (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500 }}>
                    <CheckCircle2 className="w-5 h-5 text-success" />
                  </motion.div>
                )}
              </div>
              {challenge.hasData ? (
                <>
                  <div className="relative h-2 bg-muted rounded-full overflow-hidden mb-2">
                    <motion.div
                      className={cn("absolute inset-y-0 left-0 rounded-full", challenge.done ? "bg-success" : "bg-primary")}
                      initial={{ width: 0 }}
                      animate={{ width: `${challenge.progress}%` }}
                      transition={{ duration: 1, delay: 0.2 + i * 0.1 }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{challenge.progress}%</span>
                    <span className="text-xs font-semibold text-foreground-secondary">
                      {challenge.valueLabel} de {challenge.targetLabel}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Sem dados hoje</p>
              )}
            </motion.div>
          ))}
        </div>
        )}
      </CardContent>
    </Card>
  );
}

function QueuesWidget({ stats }: { stats: DashboardStats }) {
  return (
    <Card className="border-secondary/20 overflow-hidden bg-card hover:border-secondary/40 transition-all duration-300">
      <CardHeader className="border-b border-secondary/20 bg-secondary/5">
        <div className="flex items-center gap-3">
          <motion.div className="w-10 h-10 rounded-xl bg-secondary/15 flex items-center justify-center glow-purple-pulse-slow" whileHover={{ scale: 1.1 }}>
            <Sparkles className="w-5 h-5 text-secondary" />
          </motion.div>
          <h2 className="font-display text-lg font-semibold text-foreground">Status das Filas</h2>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        {stats.queuesStats.length === 0 ? (
          <EmptyState icon={Sparkles} title="Nenhuma fila configurada" description="Configure filas para organizar seus atendimentos" illustration="queues" size="sm" />
        ) : (
          <StaggeredList className="space-y-5">
            {stats.queuesStats.map((queue) => {
              const progressPercent = Math.min((queue.waitingCount / 10) * 100, 100);
              return (
                <StaggeredItem key={queue.id}>
                  <motion.div className="p-4 rounded-xl bg-muted/30 border border-border/30 hover:border-primary/20 transition-all duration-300 group" whileHover={{ x: 4, scale: 1.01 }} transition={{ duration: 0.2 }}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <motion.div className="w-4 h-4 rounded-full ring-4 ring-offset-2 ring-offset-background ring-primary/20" style={{ backgroundColor: queue.color }} animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity }} />
                        <span className="font-semibold text-foreground">{queue.name}</span>
                        <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-0 font-semibold">{queue.waitingCount} aguardando</Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Users className="w-4 h-4" />
                        <span className="font-medium">{queue.onlineAgents}/{queue.totalAgents}</span>
                      </div>
                    </div>
                    <div className="relative">
                      <Progress value={progressPercent} className="h-2.5 bg-muted" />
                      <motion.div className="absolute inset-0 rounded-full opacity-30" style={{ background: `linear-gradient(90deg, ${queue.color}, transparent)`, width: `${progressPercent}%` }} animate={{ opacity: [0.3, 0.5, 0.3] }} transition={{ duration: 2, repeat: Infinity }} />
                    </div>
                  </motion.div>
                </StaggeredItem>
              );
            })}
          </StaggeredList>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityWidget({ stats }: { stats: DashboardStats }) {
  return (
    <Card className="border-secondary/20 overflow-hidden bg-card hover:border-secondary/40 transition-all duration-300">
      <CardHeader className="border-b border-secondary/20 bg-secondary/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-secondary/15 flex items-center justify-center glow-purple-pulse-slow">
            <MessageSquare className="w-5 h-5 text-secondary" />
          </div>
          <h2 className="font-display text-lg font-semibold text-foreground">Atividade Recente</h2>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {stats.recentActivity.length === 0 ? (
          <EmptyState icon={MessageSquare} title="Nenhuma atividade recente" description="As conversas aparecerão aqui quando você começar a atender" illustration="inbox" size="sm" />
        ) : (
          <StaggeredList className="space-y-2">
            {stats.recentActivity.slice(0, 5).map((activity) => (
              <StaggeredItem key={activity.id}>
                <motion.div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-transparent hover:border-primary/20 hover:bg-muted/40 transition-all duration-200 cursor-pointer group" whileHover={{ x: 4, scale: 1.005 }} transition={{ duration: 0.15 }}>
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10 ring-2 ring-border/50 group-hover:ring-primary/30 transition-all">
                      <AvatarImage src={activity.contactAvatar || undefined} alt={activity.contactName || 'Contato'} />
                      <AvatarFallback className={cn('font-semibold text-sm', getAvatarColor(activity.contactName).bg, getAvatarColor(activity.contactName).text)}>
                        {getInitials(activity.contactName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{activity.contactName}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">{activity.lastMessage}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true, locale: ptBR })}
                    </span>
                    <Badge className={cn('capitalize shrink-0 font-semibold border-0 text-xs', activity.status === 'unread' && 'bg-success/10 text-success', activity.status === 'read' && 'bg-muted text-muted-foreground')}>
                      {activity.status === 'unread' ? 'Novo' : 'Lido'}
                    </Badge>
                  </div>
                </motion.div>
              </StaggeredItem>
            ))}
          </StaggeredList>
        )}
      </CardContent>
    </Card>
  );
}
