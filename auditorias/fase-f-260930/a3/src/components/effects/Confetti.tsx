import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';

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

  const createParticles = useCallback(() => {
    const newParticles: Particle[] = [];
    
    for (let i = 0; i < particleCount; i++) {
      newParticles.push({
        id: i,
        x: Math.random() * 100,
        y: -10 - Math.random() * 20,
        rotation: Math.random() * 360,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: 8 + Math.random() * 8,
        velocityX: (Math.random() - 0.5) * 4,
        velocityY: 2 + Math.random() * 3,
        type: ['confetti', 'star', 'circle'][Math.floor(Math.random() * 3)] as Particle['type'],
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

  if (!showCelebration) return null;

  return createPortal(
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      <AnimatePresence>
        {particles.map((particle) => (
          <motion.div
            key={particle.id}
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
              duration: 2 + Math.random() * 2,
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
      <AnimatePresence>
        {show && createPortal(
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9998] flex items-center justify-center pointer-events-none"
          >
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 180, opacity: 0 }}
              transition={{ 
                type: 'spring', 
                stiffness: 200, 
                damping: 15,
                duration: 0.6 
              }}
              className="relative"
            >
              {/* Glow effect */}
              <motion.div
                animate={{ 
                  scale: [1, 1.2, 1],
                  opacity: [0.5, 0.8, 0.5]
                }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="absolute inset-0 bg-primary/30 rounded-full blur-3xl"
                style={{ transform: 'scale(2)' }}
              />
              
              {/* Main content */}
              <motion.div
                className="relative bg-card/95 backdrop-blur-xl border border-primary/30 rounded-3xl p-8 shadow-2xl text-center"
                style={{ 
                  boxShadow: '0 0 60px hsl(var(--primary) / 0.3), 0 0 120px hsl(var(--primary) / 0.1)' 
                }}
              >
                <motion.div
                  animate={{ 
                    scale: [1, 1.2, 1],
                    rotate: [0, 10, -10, 0]
                  }}
                  transition={{ duration: 0.5, repeat: 2 }}
                  className="text-6xl mb-4"
                >
                  {emoji}
                </motion.div>
                
                <motion.h2
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="font-display text-2xl font-bold text-foreground mb-2 bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent"
                >
                  {title}
                </motion.h2>
                
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-muted-foreground"
                >
                  {subtitle}
                </motion.p>

                {/* Sparkles around */}
                {[...Array(8)].map((_, i) => (
                  <motion.div
                    key={i}
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
          </motion.div>,
          document.body
        )}
      </AnimatePresence>
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
