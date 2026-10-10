import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useLeaderboard } from '@/hooks/gamification/useLeaderboard';
import { Trophy, RefreshCw, ChevronRight } from 'lucide-react';
import { LeaderboardRow } from './LeaderboardHelpers';

function LeaderboardSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="rounded-xl p-3 border border-border/20 bg-muted/10">
          <div className="flex items-center gap-3">
            <Skeleton className="w-9 h-9 rounded-full" />
            <Skeleton className="w-10 h-10 rounded-full" />
            <div className="flex-1 space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-3 w-16" /></div>
            <div className="flex gap-1"><Skeleton className="w-6 h-6 rounded-full" /><Skeleton className="w-6 h-6 rounded-full" /></div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Leaderboard() {
  const { agents, isLoading, isRefreshing, timeRange, setTimeRange, handleRefresh } = useLeaderboard();

  return (
    <div className="rounded-2xl p-5 border border-border/30 bg-card relative overflow-hidden">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Trophy className="w-5 h-5 text-primary" /></div>
          <div><h3 className="text-base font-semibold text-foreground">Ranking</h3><p className="text-xs text-muted-foreground">Top performers em tempo real</p></div>
        </div>
        <div className="flex items-center gap-2">
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={isRefreshing} className="h-8 w-8">
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          </motion.div>
          <div className="flex items-center gap-1 bg-muted/30 rounded-lg p-1">
            {(['today', 'week', 'month'] as const).map((range) => (
              <Button key={range} variant="ghost" size="sm" onClick={() => setTimeRange(range)}
                className={`text-xs h-7 px-2.5 transition-all ${timeRange === range ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-transparent'}`}>
                {range === 'today' ? 'Hoje' : range === 'week' ? 'Semana' : 'Mês'}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? <LeaderboardSkeleton /> : agents.length > 0 ? (
        <div className="space-y-2">{agents.map((agent, index) => <LeaderboardRow key={agent.id} agent={agent} index={index} />)}</div>
      ) : (
        <div className="text-center py-8">
          <Trophy className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-muted-foreground">Nenhum agente no ranking ainda</p>
          <p className="text-xs text-muted-foreground mt-1">Os agentes aparecerão aqui conforme ganham XP</p>
        </div>
      )}

      {agents.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="mt-4 text-center">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary text-xs">
            Ver ranking completo<ChevronRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </motion.div>
      )}
    </div>
  );
}
