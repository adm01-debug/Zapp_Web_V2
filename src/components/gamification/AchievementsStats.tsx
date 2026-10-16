import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Award, Zap, BarChart3, Sparkles, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AchievementBadgeMini } from './AchievementBadge';
import type { Achievement } from '@/hooks/gamification/useAgentGamification';
import { levelProgress, xpForNextLevel } from '@/hooks/gamification/useAgentGamification';

interface AchievementsStatsProps {
  achievements: Achievement[];
  stats: { level: number; xp: number } | null;
}

export function isNewAchievement(earnedAt: string): boolean {
  return new Date(earnedAt) > new Date(Date.now() - 60 * 60 * 1000);
}

export function AchievementsStatsHeader({ achievements, stats }: AchievementsStatsProps) {
  const totalXp = useMemo(() => achievements.reduce((sum, a) => sum + a.xp_earned, 0), [achievements]);
  const uniqueTypes = useMemo(() => Array.from(new Set(achievements.map(a => a.achievement_type))), [achievements]);

  return (
    <>
      {/* Level Progress */}
      {stats && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">Progresso para Nível {stats.level + 1}</span>
            <span className="text-xs text-muted-foreground">{stats.xp.toLocaleString()} / {xpForNextLevel(stats.level).toLocaleString()} XP</span>
          </div>
          <Progress value={levelProgress(stats.xp, stats.level)} className="h-2" />
        </motion.div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: Award, color: 'text-primary', label: 'Total', value: achievements.length, delay: 0.1 },
          { icon: Zap, color: 'text-xp', label: 'XP Ganho', value: totalXp.toLocaleString(), delay: 0.15 },
          { icon: BarChart3, color: 'text-info', label: 'Tipos', value: uniqueTypes.length, delay: 0.2 },
          { icon: Sparkles, color: 'text-warning', label: 'Recentes', value: achievements.filter(a => isNewAchievement(a.earned_at)).length, delay: 0.25 },
        ].map(({ icon: Icon, color, label, value, delay }) => (
          <motion.div key={label} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay }}
            className="p-4 rounded-xl bg-muted/30 border border-border/30">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{value}</p>
          </motion.div>
        ))}
      </div>

      {/* Mini badges showcase */}
      {achievements.length > 0 && (
        <div className="p-4 rounded-xl bg-muted/20 border border-border/30">
          <h4 className="text-sm font-medium text-foreground mb-3">Últimas Conquistas</h4>
          <div className="flex flex-wrap gap-2">
            {achievements.slice(0, 10).map((achievement, index) => (
              <motion.div key={achievement.id} initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: index * 0.05 }}>
                <AchievementBadgeMini type={achievement.achievement_type} name={achievement.achievement_name} />
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export function AchievementsHeaderBadges({ stats }: { stats: { level: number; xp: number } | null }) {
  if (!stats) return null;
  return (
    <div className="flex items-center gap-2">
      <Badge variant="secondary" className="gap-1 bg-primary/10 text-primary border-0">
        <TrendingUp className="w-3 h-3" />Nv {stats.level}
      </Badge>
      <Badge variant="secondary" className="gap-1 bg-xp/10 text-xp border-0">
        <Zap className="w-3 h-3" />{stats.xp.toLocaleString()} XP
      </Badge>
    </div>
  );
}
