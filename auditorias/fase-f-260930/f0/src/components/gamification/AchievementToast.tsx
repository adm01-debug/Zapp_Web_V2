import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Zap, Clock, MessageSquare, Star, Flame, Rocket, Target, Award, PartyPopper, Crown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

export type AchievementType = 
  | 'fast_response' 
  | 'streak' 
  | 'first_message' 
  | 'resolution' 
  | 'perfect_rating'
  | 'level_up'
  | 'daily_goal'
  | 'speed_demon';

interface AchievementConfig {
  icon: typeof Trophy;
  title: string;
  gradient: string;
  glowColor: string;
  particles: string;
}

const achievementConfigs: Record<AchievementType, AchievementConfig> = {
  fast_response: {
    icon: Zap,
    title: 'Resposta Rápida!',
    gradient: 'from-primary via-success to-info',
    glowColor: 'hsl(142 72% 50% / 0.5)',
    particles: 'bg-primary',
  },
  streak: {
    icon: Flame,
    title: 'Streak de Fogo!',
    gradient: 'from-warning via-warning to-warning',
    glowColor: 'hsl(25 95% 55% / 0.5)',
    particles: 'bg-warning',
  },
  first_message: {
    icon: MessageSquare,
    title: 'Primeiro Contato!',
    gradient: 'from-info via-info to-info',
    glowColor: 'hsl(200 80% 50% / 0.5)',
    particles: 'bg-info',
  },
  resolution: {
    icon: Target,
    title: 'Problema Resolvido!',
    gradient: 'from-primary via-success to-success',
    glowColor: 'hsl(142 72% 50% / 0.5)',
    particles: 'bg-success',
  },
  perfect_rating: {
    icon: Star,
    title: 'Avaliação Perfeita!',
    gradient: 'from-warning via-warning to-destructive/70',
    glowColor: 'hsl(45 95% 55% / 0.5)',
    particles: 'bg-warning',
  },
  level_up: {
    icon: Crown,
    title: 'Level Up!',
    gradient: 'from-primary via-secondary to-accent',
    glowColor: 'hsl(280 85% 60% / 0.5)',
    particles: 'bg-primary',
  },
  daily_goal: {
    icon: Trophy,
    title: 'Meta Diária!',
    gradient: 'from-primary via-info to-info',
    glowColor: 'hsl(175 60% 50% / 0.5)',
    particles: 'bg-info',
  },
  speed_demon: {
    icon: Rocket,
    title: 'Speed Demon!',
    gradient: 'from-destructive via-warning to-warning',
    glowColor: 'hsl(15 95% 55% / 0.5)',
    particles: 'bg-destructive',
  },
};

interface AchievementToastProps {
  type: AchievementType;
  message: string;
  xpReward?: number;
  isVisible: boolean;
  onClose: () => void;
  duration?: number;
}

// Particle component for confetti effect
function Particle({ delay, config }: { delay: number; config: AchievementConfig }) {
  return (
    <motion.div
      className={cn("absolute w-2 h-2 rounded-full", config.particles)}
      initial={{ 
        x: 0, 
        y: 0, 
        scale: 0,
        opacity: 1 
      }}
      animate={{ 
        x: (Math.random() - 0.5) * 200,
        y: (Math.random() - 0.5) * 200,
        scale: [0, 1, 0],
        opacity: [1, 1, 0]
      }}
      transition={{ 
        duration: 1,
        delay: delay,
        ease: "easeOut"
      }}
    />
  );
}

export function AchievementToast({ 
  type, 
  message, 
  xpReward, 
  isVisible, 
  onClose,
  duration = 4000 
}: AchievementToastProps) {
  const config = achievementConfigs[type];
  const Icon = config.icon;
  const [particles, setParticles] = useState<number[]>([]);

  useEffect(() => {
    if (isVisible) {
      setParticles(Array.from({ length: 20 }, (_, i) => i));
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onClose]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -100, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -50, scale: 0.9 }}
          transition={{ 
            type: "spring", 
            stiffness: 400, 
            damping: 25 
          }}
          className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] pointer-events-auto"
        >
          {/* Main container */}
          <motion.div
            className={cn(
              "relative overflow-hidden rounded-2xl p-1",
              "bg-gradient-to-r",
              config.gradient
            )}
            animate={{
              boxShadow: [
                `0 0 20px ${config.glowColor}`,
                `0 0 40px ${config.glowColor}`,
                `0 0 20px ${config.glowColor}`,
              ]
            }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            {/* Particles */}
            <div className="absolute inset-0 flex items-center justify-center overflow-visible pointer-events-none">
              {particles.map((i) => (
                <Particle key={i} delay={i * 0.05} config={config} />
              ))}
            </div>

            {/* Inner content */}
            <div className="relative bg-card/95 backdrop-blur-xl rounded-xl px-6 py-4">
              {/* Shimmer effect */}
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                animate={{ x: ['-100%', '200%'] }}
                transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 0.5 }}
              />

              <div className="relative flex items-center gap-4">
                {/* Icon with animation */}
                <motion.div
                  className={cn(
                    "w-14 h-14 rounded-xl flex items-center justify-center",
                    "bg-gradient-to-br",
                    config.gradient
                  )}
                  animate={{ 
                    rotate: [0, 10, -10, 0],
                    scale: [1, 1.1, 1]
                  }}
                  transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
                >
                  <Icon className="w-7 h-7 text-primary-foreground" />
                </motion.div>

                {/* Text content */}
                <div className="flex-1">
                  <motion.div 
                    className="flex items-center gap-2"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <PartyPopper className="w-4 h-4 text-accent" />
                    <span className={cn(
                      "text-sm font-bold bg-gradient-to-r bg-clip-text text-transparent",
                      config.gradient
                    )}>
                      {config.title}
                    </span>
                  </motion.div>
                  
                  <motion.p 
                    className="text-foreground font-semibold mt-1"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    {message}
                  </motion.p>

                  {xpReward && (
                    <motion.div 
                      className="flex items-center gap-1.5 mt-2"
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.4, type: "spring" }}
                    >
                      <motion.div
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-xp to-primary"
                        animate={{ scale: [1, 1.05, 1] }}
                        transition={{ duration: 0.8, repeat: Infinity }}
                      >
                        <Zap className="w-3 h-3 text-primary-foreground" />
                        <span className="text-xs font-bold text-primary-foreground">+{xpReward} XP</span>
                      </motion.div>
                    </motion.div>
                  )}
                </div>

                {/* Close button area - invisible but clickable */}
                <motion.button
                  onClick={onClose}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-foreground/10 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <span className="text-xs text-foreground">✕</span>
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Hook to manage achievements
export function useAchievements() {
  const [achievement, setAchievement] = useState<{
    type: AchievementType;
    message: string;
    xpReward?: number;
  } | null>(null);

  const showAchievement = (type: AchievementType, message: string, xpReward?: number) => {
    setAchievement({ type, message, xpReward });
  };

  const hideAchievement = () => {
    setAchievement(null);
  };

  return {
    achievement,
    showAchievement,
    hideAchievement,
  };
}
