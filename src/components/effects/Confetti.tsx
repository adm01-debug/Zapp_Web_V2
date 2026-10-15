import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { secureRandomFloat } from '../../lib/secureRandom';

interface Particle {
  id: number;
  x: number;
  y: number;
  rotation: number;
  color: string;
  size: number;
  velocityX: number;
  velocityY: number;
  type: 'confetti' | 'star' | 'circle';
}

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--secondary))',
  'hsl(142 76% 36%)', // green
  'hsl(45 93% 47%)',  // gold
  'hsl(280 87% 65%)', // purple
  'hsl(199 89% 48%)', // cyan
  'hsl(340 82% 52%)', // pink
];

interface ConfettiProps {
  isActive: boolean;
  duration?: number;
  particleCount?: number;
  onComplete?: () => void;
}

export function Confetti({ 
  isActive, 
  duration = 3000, 
  particleCount = 100,
  onComplete 
}: ConfettiProps) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [showCelebration, setShowCelebration] = useState(false);
  // Acessibilidade: com `prefers-reduced-motion: reduce` nada de confete —
  // ainda avisamos o chamador no fim da janela de celebração.
  const reduzirMovimento = useReducedMotion() ?? false;

  const createParticles = useCallback(() => {
    const newParticles: Particle[] = [];
    
    for (let i = 0; i < particleCount; i++) {
      newParticles.push({
        id: i,
        x: secureRandomFloat() * 100,
        y: -10 - secureRandomFloat() * 20,
        rotation: secureRandomFloat() * 360,
        color: COLORS[Math.floor(secureRandomFloat() * COLORS.length)],
        size: 8 + secureRandomFloat() * 8,
        velocityX: (secureRandomFloat() - 0.5) * 4,
        velocityY: 2 + secureRandomFloat() * 3,
        type: ['confetti', 'star', 'circle'][Math.floor(secureRandomFloat() * 3)] as Particle['type'],
      });
    }
    
    return newParticles;
  }, [particleCount]);

  useEffect(() => {
    if (isActive) {
      setParticles(createParticles());
      setShowCelebration(true);
      
      const timer = setTimeout(() => {
        setShowCelebration(false);
        setParticles([]);
        onComplete?.();
      }, duration);
      
      return () => clearTimeout(timer);
    }
  }, [isActive, duration, createParticles, onComplete]);

  if (reduzirMovimento || !showCelebration) return null;

  return createPortal(
    <div data-testid="confetti-layer" className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      <AnimatePresence>
        {particles.map((particle) => (
          <motion.div
            key={particle.id}
            data-testid="confetti-particle"
            initial={{
              x: `${particle.x}vw`,
              y: `${particle.y}vh`,
              rotate: 0,
              opacity: 1,
            }}
            animate={{
              x: `${particle.x + particle.velocityX * 20}vw`,
              y: '120vh',
              rotate: particle.rotation + 720,
              opacity: [1, 1, 0.8, 0],
            }}
            transition={{
              duration: 2 + secureRandomFloat() * 2,
              ease: 'easeOut',
            }}
            className="absolute"
            style={{
              width: particle.size,
              height: particle.size,
            }}
          >
            {particle.type === 'confetti' && (
              <div
                className="w-full h-full"
                style={{
                  backgroundColor: particle.color,
                  clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 80%)',
                }}
              />
            )}
            {particle.type === 'star' && (
              <svg viewBox="0 0 24 24" className="w-full h-full" style={{ fill: particle.color }}>
                <polygon points="12,2 15,9 22,9 17,14 19,22 12,17 5,22 7,14 2,9 9,9" />
              </svg>
            )}
            {particle.type === 'circle' && (
              <div
                className="w-full h-full rounded-full"
                style={{ backgroundColor: particle.color }}
              />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
}

interface CelebrationOverlayProps {
  isActive: boolean;
  title?: string;
  subtitle?: string;
  emoji?: string;
  onComplete?: () => void;
}

export function CelebrationOverlay({
  isActive,
  title = "Meta Alcançada!",
  subtitle = "Parabéns pelo excelente trabalho!",
  emoji = "🎉",
  onComplete
}: CelebrationOverlayProps) {
  const [show, setShow] = useState(false);
  // Acessibilidade: com movimento reduzido a mensagem aparece parada — sem
  // confete, sem brilho pulsante, sem faíscas e sem escala/rotação de entrada.
  const reduzirMovimento = useReducedMotion() ?? false;

  useEffect(() => {
    if (isActive) {
      setShow(true);
      const timer = setTimeout(() => {
        setShow(false);
        onComplete?.();
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [isActive, onComplete]);

  return (
    <>
      <Confetti isActive={isActive} />
      {show && createPortal(
        // O AnimatePresence precisa ficar DENTRO da porta: um filho-porta dentro
        // dele é descartado (provado em teste), e o overlay nunca aparecia.
        <AnimatePresence>
          <motion.div
            data-testid="celebration-overlay"
            initial={reduzirMovimento ? false : { opacity: 0 }}
            animate={reduzirMovimento ? undefined : { opacity: 1 }}
            exit={reduzirMovimento ? undefined : { opacity: 0 }}
            className="fixed inset-0 z-[9998] flex items-center justify-center pointer-events-none"
          >
            <motion.div
              initial={reduzirMovimento ? false : { scale: 0, rotate: -180 }}
              animate={reduzirMovimento ? undefined : { scale: 1, rotate: 0 }}
              exit={reduzirMovimento ? undefined : { scale: 0, rotate: 180, opacity: 0 }}
              transition={reduzirMovimento ? { duration: 0 } : { 
                type: 'spring', 
                stiffness: 200, 
                damping: 15,
                duration: 0.6 
              }}
              className="relative"
            >
              {/* Glow effect */}
              {!reduzirMovimento && (
                <motion.div
                  data-testid="celebration-glow"
                  animate={{ 
                    scale: [1, 1.2, 1],
                    opacity: [0.5, 0.8, 0.5]
                  }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="absolute inset-0 bg-primary/30 rounded-full blur-3xl"
                  style={{ transform: 'scale(2)' }}
                />
              )}
              
              {/* Main content */}
              <motion.div
                className="relative bg-card/95 backdrop-blur-xl border border-primary/30 rounded-3xl p-8 shadow-2xl text-center"
                style={{ 
                  boxShadow: '0 0 60px hsl(var(--primary) / 0.3), 0 0 120px hsl(var(--primary) / 0.1)' 
                }}
              >
                <motion.div
                  animate={reduzirMovimento ? undefined : { 
                    scale: [1, 1.2, 1],
                    rotate: [0, 10, -10, 0]
                  }}
                  transition={{ duration: 0.5, repeat: 2 }}
                  className="text-6xl mb-4"
                >
                  {emoji}
                </motion.div>
                
                <motion.h2
                  initial={reduzirMovimento ? false : { opacity: 0, y: 20 }}
                  animate={reduzirMovimento ? undefined : { opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="font-display text-2xl font-bold text-foreground mb-2 bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent"
                >
                  {title}
                </motion.h2>
                
                <motion.p
                  initial={reduzirMovimento ? false : { opacity: 0, y: 20 }}
                  animate={reduzirMovimento ? undefined : { opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-muted-foreground"
                >
                  {subtitle}
                </motion.p>

                {/* Sparkles around */}
                {!reduzirMovimento && [...Array(8)].map((_, i) => (
                  <motion.div
                    key={i}
                    data-testid="celebration-sparkle"
                    className="absolute w-2 h-2 bg-secondary rounded-full"
                    style={{
                      top: '50%',
                      left: '50%',
                    }}
                    animate={{
                      x: [0, Math.cos(i * 45 * Math.PI / 180) * 120],
                      y: [0, Math.sin(i * 45 * Math.PI / 180) * 120],
                      scale: [0, 1.5, 0],
                      opacity: [0, 1, 0],
                    }}
                    transition={{
                      duration: 1,
                      delay: 0.3 + i * 0.05,
                      repeat: 2,
                      repeatDelay: 0.5,
                    }}
                  />
                ))}
              </motion.div>
            </motion.div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

// Hook for triggering celebrations
export function useCelebration() {
  const [celebrating, setCelebrating] = useState(false);
  const [celebrationData, setCelebrationData] = useState<{
    title?: string;
    subtitle?: string;
    emoji?: string;
  }>({});

  const celebrate = useCallback((options?: {
    title?: string;
    subtitle?: string;
    emoji?: string;
  }) => {
    setCelebrationData(options || {});
    setCelebrating(true);
  }, []);

  const stopCelebrating = useCallback(() => {
    setCelebrating(false);
  }, []);

  return {
    celebrating,
    celebrationData,
    celebrate,
    stopCelebrating,
  };
}
