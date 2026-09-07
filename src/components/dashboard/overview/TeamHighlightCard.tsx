import { Trophy, Medal } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { DashboardCard, SectionHeader, CardSelect } from './DashboardCard';
import { getInitials, getAvatarColor } from '@/lib/avatar-colors';
import type { LeaderboardAgent } from '@/hooks/gamification/useLeaderboard';
import { cn } from '@/lib/utils';

interface TeamHighlightCardProps {
  agents: LeaderboardAgent[];
  timeRange: 'today' | 'week' | 'month';
  onTimeRangeChange: (range: 'today' | 'week' | 'month') => void;
  slaRateByAgent: Map<string, number>;
}

const MEDAL_CLASS = ['text-dash-amber', 'text-muted-foreground', 'text-[hsl(18_38%_40%)]'];

function RankIndicator({ index }: { index: number }) {
  if (index < 3) {
    return <Medal className={cn('w-5 h-5 shrink-0', MEDAL_CLASS[index])} />;
  }
  return <span className="w-5 h-5 flex items-center justify-center text-[12px] font-semibold text-muted-foreground shrink-0">{index + 1}</span>;
}

export function TeamHighlightCard({ agents, timeRange, onTimeRangeChange, slaRateByAgent }: TeamHighlightCardProps) {
  const reducedMotion = useReducedMotion();
  const visibleAgents = agents.slice(0, 4);

  return (
    <DashboardCard testid="team-card" className="min-h-[220px]">
      <SectionHeader
        icon={Trophy}
        title="Equipe em Destaque"
        tileSize={44}
        right={(
          <CardSelect
            testid="team-select"
            value={timeRange}
            onValueChange={(v) => onTimeRangeChange(v as 'today' | 'week' | 'month')}
            options={[{ value: 'today', label: 'Hoje' }, { value: 'week', label: 'Semana' }, { value: 'month', label: 'Mês' }]}
          />
        )}
      />
      {visibleAgents.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[12px] text-muted-foreground min-h-[120px]">
          Sem dados de equipe
        </div>
      ) : (
        <div className="flex flex-col">
          {visibleAgents.map((agent, i) => {
            const { bg, text } = getAvatarColor(agent.name);
            const slaRate = slaRateByAgent.get(agent.profile_id);
            return (
              <div key={agent.id} data-testid="team-row" className="h-[41px] flex items-center gap-2.5">
                <RankIndicator index={i} />
                {agent.avatar ? (
                  <img src={agent.avatar} alt={agent.name} className="w-7 h-7 rounded-full object-cover shrink-0" />
                ) : (
                  <span className={cn('w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0', bg, text)}>
                    {getInitials(agent.name)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-foreground truncate">{agent.name}</p>
                  <p className="text-[11px] text-foreground-secondary truncate">{agent.conversationsResolved} resolvidas</p>
                </div>
                <div className="h-1.5 w-[120px] rounded-full bg-muted/60 overflow-hidden shrink-0">
                  <motion.div
                    className={cn('h-full rounded-full', slaRate !== undefined && slaRate >= 95 ? 'bg-dash-green' : 'bg-primary')}
                    initial={{ width: 0 }}
                    animate={{ width: `${slaRate ?? 0}%` }}
                    transition={reducedMotion ? { duration: 0 } : { duration: 0.5 }}
                  />
                </div>
                <span className="text-[11px] font-semibold text-foreground w-14 text-right shrink-0">
                  {slaRate !== undefined ? `${Math.round(slaRate)}% SLA` : '—'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </DashboardCard>
  );
}
