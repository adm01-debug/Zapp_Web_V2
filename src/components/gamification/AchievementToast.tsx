import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Trophy, Zap, Clock, MessageSquare, Star, Flame, Rocket, Target, Award, PartyPopper, Crown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { secureRandomFloat } from '../../lib/secureRandom';
import { useCallback, useEffect, useState } from 'react';
import {
  useAgentCelebrations,
  type AgentCelebration,
} from '@/hooks/gamification/useAgentCelebrations';

export type AchievementType = 
  | 'fast_response' 
  | 'streak' 
  | 'first_message' 
  | 'resolution' 
  | 'perfect_rating'
  | 'level_up'
  | 'daily_goal'
  | 'speed_demon'
  | 'achievement';

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
  // Cabeçalho neutro: qualquer conquista que o servidor conceda sem visual próprio.
  achievement: {
    icon: Trophy,
    title: 'Conquista Desbloqueada!',
    gradient: 'from-primary via-success to-info',
    glowColor: 'hsl(142 72% 50% / 0.5)',
    particles: 'bg-success',
  },
};

interface AchievementToastProps {
  type: AchievementType;
  /** Cabeçalho do toast; sem ele, vale o título do tipo. */
  title?: string;
  message: string;
  /** Linha secundária (ex.: descrição da conquista). */
  description?: string;
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
        x: (secureRandomFloat() - 0.5) * 200,
        y: (secureRandomFloat() - 0.5) * 200,
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
  title,
  message, 
  description,
  xpReward, 
  isVisible, 
  onClose,
  duration = 5000 
}: AchievementToastProps) {
  const config = achievementConfigs[type];
  const Icon = config.icon;
  // Movimento reduzido: sem confete, sem brilho pulsante, sem rodinha no ícone.
  const reduzirMovimento = useReducedMotion() ?? false;
  const particles = reduzirMovimento ? [] : Array.from({ length: 20 }, (_, i) => i);

  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onClose]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={reduzirMovimento ? false : { opacity: 0, y: -100, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduzirMovimento ? { opacity: 0 } : { opacity: 0, y: -50, scale: 0.9 }}
          transition={reduzirMovimento ? { duration: 0 } : { 
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
            animate={reduzirMovimento ? undefined : {
              boxShadow: [
                `0 0 20px ${config.glowColor}`,
                `0 0 40px ${config.glowColor}`,
                `0 0 20px ${config.glowColor}`,
              ]
            }}
            transition={reduzirMovimento ? { duration: 0 } : { duration: 1.5, repeat: Infinity }}
          >
            {/* Particles */}
            {!reduzirMovimento && (
              <div
                data-testid="celebration-particles"
                aria-hidden="true"
                className="absolute inset-0 flex items-center justify-center overflow-visible pointer-events-none"
              >
                {particles.map((i) => (
                  <Particle key={i} delay={i * 0.05} config={config} />
                ))}
              </div>
            )}

            {/* Inner content */}
            <div className="relative bg-card/95 backdrop-blur-xl rounded-xl px-6 py-4">
              {/* Shimmer effect */}
              {!reduzirMovimento && (
                <motion.div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 0.5 }}
                />
              )}

              <div className="relative flex items-center gap-4">
                {/* Icon with animation */}
                <motion.div
                  className={cn(
                    "w-14 h-14 rounded-xl flex items-center justify-center",
                    "bg-gradient-to-br",
                    config.gradient
                  )}
                  animate={reduzirMovimento ? undefined : { 
                    rotate: [0, 10, -10, 0],
                    scale: [1, 1.1, 1]
                  }}
                  transition={reduzirMovimento ? { duration: 0 } : { duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
                >
                  <Icon className="w-7 h-7 text-primary-foreground" aria-hidden="true" />
                </motion.div>

                {/* Text content */}
                <div className="flex-1">
                  <motion.div 
                    className="flex items-center gap-2"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <PartyPopper className="w-4 h-4 text-accent" aria-hidden="true" />
                    <span className={cn(
                      "text-sm font-bold bg-gradient-to-r bg-clip-text text-transparent",
                      config.gradient
                    )}>
                      {title ?? config.title}
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

                  {description && (
                    <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
                  )}

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
                        <Zap className="w-3 h-3 text-primary-foreground" aria-hidden="true" />
                        <span className="text-xs font-bold text-primary-foreground">+{xpReward} XP</span>
                      </motion.div>
                    </motion.div>
                  )}
                </div>

                {/* Close button area - sempre alcançável pelo teclado */}
                <motion.button
                  type="button"
                  onClick={onClose}
                  aria-label="Fechar aviso de conquista"
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-foreground/10 flex items-center justify-center opacity-60 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-opacity"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <span className="text-xs text-foreground" aria-hidden="true">✕</span>
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Tipo de conquista gravado no banco → visual. Sem mapa, cai no cabeçalho neutro. */
const TIPO_PARA_VISUAL: Record<string, AchievementType> = {
  fast_response: 'fast_response',
  speed_demon: 'speed_demon',
  streak: 'streak',
  streak_master: 'streak',
  resolution: 'resolution',
  first_resolution: 'resolution',
  perfect_rating: 'perfect_rating',
  level_up: 'level_up',
  daily_goal: 'daily_goal',
  first_message: 'first_message',
};

export interface AchievementCelebrationToasterProps {
  /** Perfil a observar. Sem ele, o hook resolve o perfil do próprio usuário logado. */
  profileId?: string | null;
  enabled?: boolean;
  /** Quanto tempo cada celebração fica na tela antes de sair sozinha (ms). */
  duration?: number;
}

interface ApresentacaoToast {
  type: AchievementType;
  title?: string;
  message: string;
  description?: string;
  xpReward?: number;
}

/** Traduz o evento do hook para o que o toast mostra. */
function apresentacao(evento: AgentCelebration): ApresentacaoToast {
  if (evento.kind === 'level_up') {
    return {
      type: 'level_up',
      title: `Nível ${evento.level}!`,
      message: `Você subiu do nível ${evento.previousLevel} para o nível ${evento.level}`,
      xpReward: evento.xp && evento.xp > 0 ? evento.xp : undefined,
    };
  }
  return {
    type: TIPO_PARA_VISUAL[evento.achievementType] ?? 'achievement',
    message: evento.name || 'Nova conquista',
    description: evento.description ?? undefined,
    xpReward: evento.xpEarned > 0 ? evento.xpEarned : undefined,
  };
}

/**
 * Host do toast de gamificação no topo do app: lê `useAgentCelebrations` (o dado vivo do
 * banco — cadastro de conquista e subida de nível por gatilho do servidor) e mostra UMA
 * celebração por vez. A fila vive no hook: fechar aqui só tira o item da frente, sem
 * bloquear a tela nem repetir o que já foi visto. Região `aria-live="polite"` desde o
 * primeiro render, para o leitor de tela anunciar o que chega.
 */
export function AchievementCelebrationToaster({
  profileId = null,
  enabled = true,
  duration = 5000,
}: AchievementCelebrationToasterProps = {}) {
  const { celebrations, dismiss } = useAgentCelebrations({ profileId, enabled });
  const atual = celebrations[0] ?? null;
  const chaveAtual = atual?.key ?? null;

  const fechar = useCallback(() => {
    if (chaveAtual) dismiss(chaveAtual);
  }, [dismiss, chaveAtual]);

  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      {atual && (
        // `key` remonta o toast a cada celebração: animação e tempo recomeçam limpos.
        <AchievementToast
          key={chaveAtual ?? 'celebracao'}
          {...apresentacao(atual)}
          isVisible
          onClose={fechar}
          duration={duration}
        />
      )}
    </div>
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
