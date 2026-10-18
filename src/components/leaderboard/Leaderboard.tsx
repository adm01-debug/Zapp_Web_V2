import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useLeaderboard } from '@/hooks/gamification/useLeaderboard';
import { Trophy, RefreshCw } from 'lucide-react';
import { LeaderboardRow } from './LeaderboardHelpers';

function LeaderboardSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="rounded-xl border border-border/20 bg-muted/10 p-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="flex gap-1">
              <Skeleton className="h-6 w-6 rounded-full" />
              <Skeleton className="h-6 w-6 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Leaderboard() {
  const { agents, isLoading, isRefreshing, timeRange, setTimeRange, handleRefresh } =
    useLeaderboard();

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/30 bg-card p-5">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Trophy className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Ranking</h3>
            <p className="text-xs text-muted-foreground">Top performers em tempo real</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
              aria-label="Atualizar ranking"
              aria-pressed={isRefreshing}
              className="h-8 w-8"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          </motion.div>
          <div className="flex items-center gap-1 rounded-lg bg-muted/30 p-1">
            {(['today', 'week', 'month'] as const).map((range) => (
              <Button
                key={range}
                variant="ghost"
                size="sm"
                onClick={() => setTimeRange(range)}
                className={`h-7 px-2.5 text-xs transition-all ${timeRange === range ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-transparent hover:text-foreground'}`}
              >
                {range === 'today' ? 'Hoje' : range === 'week' ? 'Semana' : 'Mês'}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <LeaderboardSkeleton />
      ) : agents.length > 0 ? (
        <div className="space-y-2">
          {agents.map((agent, index) => (
            <LeaderboardRow key={agent.id} agent={agent} index={index} />
          ))}
        </div>
      ) : (
        <div className="py-8 text-center">
          <Trophy className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
          <p className="text-muted-foreground">Nenhum agente no ranking ainda</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Os agentes aparecerão aqui conforme ganham XP
          </p>
        </div>
      )}
    </div>
  );
}
