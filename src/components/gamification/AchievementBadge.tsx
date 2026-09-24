import { motion } from 'framer-motion';
import { 
  Zap, Flame, Target, Star, Crown, Trophy, Rocket, 
  MessageSquare, Medal, Users, Clock, Award, Sparkles,
  TrendingUp, CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ACHIEVEMENT_TYPES } from '@/hooks/gamification/useAgentGamification';

export interface AchievementBadgeProps {
  type: string;
  name: string;
  description?: string | null;
  xpEarned: number;
  earnedAt: string;
  size?: 'sm' | 'md' | 'lg';
  showDetails?: boolean;
  isNew?: boolean;
}

const BADGE_CONFIG: Record<string, { 
  icon: typeof Zap; 
  gradient: string; 
  bgGlow: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}> = {
  [ACHIEVEMENT_TYPES.FAST_RESPONSE]: {
    icon: Zap,
    gradient: 'from-primary to-info',
    bgGlow: 'shadow-primary/30',
    rarity: 'common',
  },
  [ACHIEVEMENT_TYPES.SPEED_DEMON]: {
    icon: Rocket,
    gradient: 'from-destructive to-warning',
    bgGlow: 'shadow-red-500/30',
    rarity: 'rare',
  },
  [ACHIEVEMENT_TYPES.STREAK]: {
    icon: Flame,
    gradient: 'from-warning to-warning',
    bgGlow: 'shadow-warning/30',
    rarity: 'common',
  },
  [ACHIEVEMENT_TYPES.STREAK_MASTER]: {
    icon: Flame,
    gradient: 'from-warning to-destructive',
    bgGlow: 'shadow-warning/30',
    rarity: 'epic',
  },
  [ACHIEVEMENT_TYPES.RESOLUTION]: {
    icon: Target,
    gradient: 'from-success to-success',
    bgGlow: 'shadow-green-500/30',
    rarity: 'common',
  },
  [ACHIEVEMENT_TYPES.PERFECT_RATING]: {
    icon: Star,
    gradient: 'from-warning to-warning',
    bgGlow: 'shadow-warning/30',
    rarity: 'rare',
  },
  [ACHIEVEMENT_TYPES.LEVEL_UP]: {
    icon: Crown,
    gradient: 'from-primary to-accent',
    bgGlow: 'shadow-purple-500/30',
    rarity: 'epic',
  },
  [ACHIEVEMENT_TYPES.DAILY_GOAL]: {
    icon: Trophy,
    gradient: 'from-info to-info',
    bgGlow: 'shadow-info/30',
    rarity: 'common',
  },
  [ACHIEVEMENT_TYPES.FIRST_MESSAGE]: {
    icon: MessageSquare,
    gradient: 'from-info to-secondary',
    bgGlow: 'shadow-blue-500/30',
    rarity: 'common',
  },
  [ACHIEVEMENT_TYPES.FIRST_RESOLUTION]: {
    icon: CheckCircle2,
    gradient: 'from-success to-info',
    bgGlow: 'shadow-green-400/30',
    rarity: 'common',
  },
  [ACHIEVEMENT_TYPES.MESSAGE_MILESTONE]: {
    icon: Medal,
    gradient: 'from-secondary to-primary',
    bgGlow: 'shadow-secondary/30',
    rarity: 'rare',
  },
  [ACHIEVEMENT_TYPES.TEAM_PLAYER]: {
    icon: Users,
    gradient: 'from-destructive to-destructive',
    bgGlow: 'shadow-destructive/30',
    rarity: 'rare',
  },
};

const DEFAULT_BADGE = {
  icon: Award,
  gradient: 'from-slate-500 to-slate-400',
  bgGlow: 'shadow-slate-500/30',
  rarity: 'common' as const,
};

const RARITY_BORDERS: Record<string, string> = {
  common: 'ring-2 ring-slate-400/30',
  rare: 'ring-2 ring-blue-400/50',
  epic: 'ring-2 ring-purple-400/50 ring-offset-2 ring-offset-background',
  legendary: 'ring-2 ring-yellow-400/70 ring-offset-2 ring-offset-background',
};

const SIZE_CONFIG = {
  sm: { container: 'w-12 h-12', icon: 'w-5 h-5', text: 'text-xs' },
  md: { container: 'w-16 h-16', icon: 'w-7 h-7', text: 'text-sm' },
  lg: { container: 'w-20 h-20', icon: 'w-9 h-9', text: 'text-base' },
};

export function AchievementBadge({
  type,
  name,
  description,
  xpEarned,
  earnedAt,
  size = 'md',
  showDetails = true,
  isNew = false,
}: AchievementBadgeProps) {
  const config = BADGE_CONFIG[type] || DEFAULT_BADGE;
  const Icon = config.icon;
  const sizeConfig = SIZE_CONFIG[size];

  const formattedDate = new Date(earnedAt).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.02 }}
      className={cn(
        "relative flex items-center gap-3 p-3 rounded-xl",
        "bg-card border border-border/50",
        "hover:border-border transition-all duration-200",
        showDetails && "pr-4"
      )}
    >
      {/* Badge Icon */}
      <div className="relative">
        <motion.div
          className={cn(
            sizeConfig.container,
            "rounded-xl flex items-center justify-center",
            `bg-gradient-to-br ${config.gradient}`,
            `shadow-lg ${config.bgGlow}`,
            RARITY_BORDERS[config.rarity]
          )}
          whileHover={{ rotate: [0, -5, 5, 0] }}
          transition={{ duration: 0.3 }}
        >
          <Icon className={cn(sizeConfig.icon, "text-primary-foreground drop-shadow-md")} />
        </motion.div>
        
        {/* New indicator */}
        {isNew && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 w-4 h-4 bg-destructive rounded-full flex items-center justify-center"
          >
            <Sparkles className="w-2.5 h-2.5 text-primary-foreground" />
          </motion.div>
        )}

        {/* Rarity glow effect */}
        {config.rarity === 'legendary' && (
          <motion.div
            className="absolute inset-0 rounded-xl bg-gradient-to-br from-warning/20 to-warning/20"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        )}
      </div>

      {/* Details */}
      {showDetails && (
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className={cn(sizeConfig.text, "font-semibold text-foreground truncate")}>
              {name}
            </h4>
            <span className={cn(
              "px-1.5 py-0.5 rounded text-3xs font-medium uppercase tracking-wide",
              config.rarity === 'common' && "bg-muted/20 text-muted-foreground",
              config.rarity === 'rare' && "bg-info/20 text-info",
              config.rarity === 'epic' && "bg-primary/20 text-primary",
              config.rarity === 'legendary' && "bg-warning/20 text-warning",
            )}>
              {config.rarity}
            </span>
          </div>
          
          {description && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {description}
            </p>
          )}
          
          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-xs text-xp font-medium">
              <Zap className="w-3 h-3" />
              +{xpEarned} XP
            </span>
            <span className="flex items-center gap-1 text-3xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {formattedDate}
            </span>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// Mini badge for compact displays
export function AchievementBadgeMini({ 
  type, 
  name 
}: { 
  type: string; 
  name: string; 
}) {
  const config = BADGE_CONFIG[type] || DEFAULT_BADGE;
  const Icon = config.icon;

  return (
    <motion.div
      whileHover={{ scale: 1.1, rotate: 5 }}
      className={cn(
        "w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer",
        `bg-gradient-to-br ${config.gradient}`,
        `shadow-md ${config.bgGlow}`,
        RARITY_BORDERS[config.rarity]
      )}
      title={name}
    >
      <Icon className="w-5 h-5 text-primary-foreground drop-shadow-sm" />
    </motion.div>
  );
}
