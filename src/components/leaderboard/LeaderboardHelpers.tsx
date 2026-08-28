import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { LeaderboardAgent } from '@/hooks/gamification/useLeaderboard';
import {
  Trophy, Medal, Crown, Star, Flame, TrendingUp, TrendingDown, Minus,
  Sparkles, Zap, Target, Award, ChevronRight,
} from 'lucide-react';

export const achievementIcons: Record<string, { icon: typeof Trophy; color: string; label: string }> = {
  'fast_response': { icon: Zap, color: 'text-primary', label: 'Resposta Rápida' },
  'streak': { icon: Flame, color: 'text-warning', label: 'Streak Master' },
  'resolution': { icon: Target, color: 'text-success', label: 'Resolvedor' },
  'perfect_rating': { icon: Star, color: 'text-warning', label: 'Avaliação Perfeita' },
  'level_up': { icon: TrendingUp, color: 'text-info', label: 'Level Up' },
  'daily_goal': { icon: Award, color: 'text-primary', label: 'Meta Diária' },
  'speed-demon': { icon: Zap, color: 'text-primary', label: 'Speed Demon' },
  'customer-hero': { icon: Award, color: 'text-info', label: 'Customer Hero' },
  'streak-master': { icon: Flame, color: 'text-primary', label: 'Streak Master' },
  'team-player': { icon: Star, color: 'text-coins', label: 'Team Player' },
  'problem-solver': { icon: Target, color: 'text-success', label: 'Problem Solver' },
  'rising-star': { icon: TrendingUp, color: 'text-primary', label: 'Rising Star' },
  'quick-learner': { icon: Sparkles, color: 'text-info', label: 'Quick Learner' },
  'comeback-kid': { icon: Trophy, color: 'text-coins', label: 'Comeback Kid' },
  'consistent': { icon: Medal, color: 'text-success', label: 'Consistent' },
};

export function RankBadge({ rank, previousRank }: { rank: number; previousRank: number }) {
  const rankChange = previousRank - rank;
  const getRankStyle = () => {
    switch (rank) {
      case 1: return { bg: 'bg-gradient-to-br from-primary to-warning', shadow: 'shadow-glow-primary-sm', icon: Crown, iconColor: 'text-primary-foreground' };
      case 2: return { bg: 'bg-gradient-to-br from-slate-400 to-slate-500', shadow: '', icon: Medal, iconColor: 'text-muted-foreground' };
      case 3: return { bg: 'bg-gradient-to-br from-warning to-warning/80', shadow: '', icon: Medal, iconColor: 'text-warning-foreground' };
      default: return { bg: 'bg-muted', shadow: '', icon: null, iconColor: '' };
    }
  };
  const style = getRankStyle();
  const Icon = style.icon;

  return (
    <div className="flex items-center gap-2">
      <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className={`relative w-9 h-9 rounded-full ${style.bg} ${style.shadow} flex items-center justify-center`}>
        {Icon ? <Icon className={`w-4 h-4 ${style.iconColor}`} /> : <span className="text-sm font-bold text-foreground">{rank}</span>}
      </motion.div>
      {rankChange !== 0 && (
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
          className={`flex items-center gap-0.5 text-xs font-medium ${rankChange > 0 ? 'text-success' : 'text-destructive'}`}>
          {rankChange > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          <span>{Math.abs(rankChange)}</span>
        </motion.div>
      )}
      {rankChange === 0 && rank > 3 && <Minus className="w-3 h-3 text-muted-foreground" />}
    </div>
  );
}

export function AchievementBadge({ achievementKey }: { achievementKey: string }) {
  const achievement = achievementIcons[achievementKey] || achievementIcons['daily_goal'];
  const Icon = achievement.icon;
  return (
    <motion.div whileHover={{ scale: 1.15 }} className={`w-6 h-6 rounded-full bg-muted/50 flex items-center justify-center ${achievement.color}`} title={achievement.label}>
      <Icon className="w-3 h-3" />
    </motion.div>
  );
}

export function CelebrationParticles({ isVisible }: { isVisible: boolean }) {
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i, x: Math.random() * 100 - 50, y: Math.random() * -100 - 20,
    delay: Math.random() * 0.5, duration: 1 + Math.random() * 0.5, size: 4 + Math.random() * 8,
    color: [
      getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
      getComputedStyle(document.documentElement).getPropertyValue('--secondary').trim(),
      getComputedStyle(document.documentElement).getPropertyValue('--accent-foreground').trim(),
    ].map(v => `hsl(${v})`)[Math.floor(Math.random() * 3)] || 'hsl(var(--primary))',
  }));

  return (
    <AnimatePresence>
      {isVisible && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {particles.map((p) => (
            <motion.div key={p.id}
              initial={{ opacity: 1, x: '50%', y: '50%', scale: 0 }}
              animate={{ opacity: [1, 1, 0], x: `calc(50% + ${p.x}px)`, y: `calc(50% + ${p.y}px)`, scale: [0, 1, 0.5], rotate: [0, 360] }}
              exit={{ opacity: 0 }} transition={{ duration: p.duration, delay: p.delay, ease: 'easeOut' }}
              className="absolute" style={{ width: p.size, height: p.size, backgroundColor: p.color, borderRadius: '50%' }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}

export function LeaderboardRow({ agent, index }: { agent: LeaderboardAgent; index: number }) {
  const [showCelebration, setShowCelebration] = useState(false);
  useEffect(() => {
    if (agent.rank === 1 && agent.previousRank !== 1) {
      setShowCelebration(true);
      const timer = setTimeout(() => setShowCelebration(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [agent.rank, agent.previousRank]);

  return (
    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.08, type: 'spring', stiffness: 100 }} whileHover={{ x: 2 }}
      className={`relative rounded-xl p-3 border transition-all cursor-pointer group ${
        agent.rank === 1 ? 'border-primary/30 bg-primary/5' : agent.rank === 2 ? 'border-border/20 bg-muted/5' : agent.rank === 3 ? 'border-warning/20 bg-warning/5' : 'border-border/20 bg-muted/10 hover:border-primary/20 hover:bg-muted/20'
      }`}>
      <CelebrationParticles isVisible={showCelebration} />
      <div className="flex items-center gap-3">
        <RankBadge rank={agent.rank} previousRank={agent.previousRank} />
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative">
            <Avatar className="w-10 h-10 ring-2 ring-border/30">
              <AvatarImage src={agent.avatar} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                {agent.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            {agent.isOnline && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-success rounded-full border-2 border-card" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-sm text-foreground truncate">{agent.name}</h4>
              {agent.streak >= 5 && (
                <div className="flex items-center gap-0.5 text-warning"><Flame className="w-3.5 h-3.5" /><span className="text-xs font-medium">{agent.streak}</span></div>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Nv {agent.level}</span><span>•</span><span className="text-primary font-medium">{agent.xp.toLocaleString()} XP</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {agent.achievements.slice(0, 2).map((a, idx) => <AchievementBadge key={`${a}-${idx}`} achievementKey={a} />)}
          {agent.achievementsCount > 2 && <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-muted/50">+{agent.achievementsCount - 2}</Badge>}
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </motion.div>
  );
}
