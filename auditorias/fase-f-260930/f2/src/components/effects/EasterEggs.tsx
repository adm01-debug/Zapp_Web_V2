import { useState, useEffect, useCallback, useRef, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Confetti, useCelebration } from './Confetti';
import { toast } from '@/hooks/ui/use-toast';
import { Sparkles, PartyPopper, Rocket, Ghost, Music } from 'lucide-react';

interface EasterEggsProviderProps {
  children: React.ReactNode;
}

// Konami Code: ↑ ↑ ↓ ↓ ← → ← → B A
const KONAMI_CODE = [
  'ArrowUp', 'ArrowUp', 
  'ArrowDown', 'ArrowDown', 
  'ArrowLeft', 'ArrowRight', 
  'ArrowLeft', 'ArrowRight', 
  'KeyB', 'KeyA'
];

// Secret codes
const SECRET_CODES: Record<string, { name: string; action: string }> = {
  'party': { name: 'Modo Festa', action: 'party' },
  'matrix': { name: 'Matrix Mode', action: 'matrix' },
  'disco': { name: 'Disco Mode', action: 'disco' },
  'lovable': { name: 'Lovable Easter Egg', action: 'lovable' },
};

export const EasterEggsProvider = forwardRef<HTMLDivElement, EasterEggsProviderProps>(function EasterEggsProvider({ children }, _ref) {
  // Progresso do Konami code e do texto digitado nao afetam a UI — ficam em
  // ref para nao re-renderizar o provider (e re-registrar o listener) a
  // cada tecla digitada.
  const konamiProgressRef = useRef<string[]>([]);
  const typedTextRef = useRef('');
  const [partyMode, setPartyMode] = useState(false);
  const [matrixMode, setMatrixMode] = useState(false);
  const { celebrate, celebrating } = useCelebration();

  // Valores da chuva do Matrix Mode gerados uma unica vez, no mount (lazy
  // initializer): Math.random() direto no render (mesmo dentro de useMemo)
  // e impuro e re-randomiza a cada re-render do provider, gerando "saltos"
  // visuais na animacao. So sao consumidos quando matrixMode fica true.
  const [matrixColumns] = useState(() => Array.from({ length: 20 }, () => ({
    duration: 3 + Math.random() * 2,
    delay: Math.random() * 2,
    chars: Array.from({ length: 30 }, () => String.fromCharCode(0x30A0 + Math.random() * 96)),
  })));

  const triggerKonamiEasterEgg = useCallback(() => {
    celebrate({
      title: '🎮 KONAMI CODE!',
      subtitle: 'Você desbloqueou um segredo!',
      emoji: '🕹️',
    });

    toast({
      title: '🎮 Konami Code Ativado!',
      description: '+30 vidas... ops, errado! Você ganhou +100 XP bônus!',
    });

    // Add rainbow effect to body
    document.body.classList.add('rainbow-mode');
    setTimeout(() => {
      document.body.classList.remove('rainbow-mode');
    }, 5000);
  }, [celebrate]);

  const triggerSecretCode = useCallback((name: string, action: string) => {
    switch (action) {
      case 'party':
        setPartyMode(true);
        celebrate({
          title: '🎉 MODO FESTA!',
          subtitle: 'Vamos celebrar!',
          emoji: '🥳',
        });
        setTimeout(() => setPartyMode(false), 10000);
        break;
      
      case 'matrix':
        setMatrixMode(true);
        toast({
          title: '💊 Matrix Mode',
          description: 'Você escolheu a pílula vermelha...',
        });
        setTimeout(() => setMatrixMode(false), 8000);
        break;
      
      case 'disco':
        document.body.classList.add('disco-mode');
        toast({
          title: '🪩 Disco Mode!',
          description: 'Brilhe como nos anos 70!',
        });
        setTimeout(() => {
          document.body.classList.remove('disco-mode');
        }, 8000);
        break;
      
      case 'lovable':
        celebrate({
          title: '💜 LOVABLE!',
          subtitle: 'Feito com amor 💜',
          emoji: '💜',
        });
        break;
    }
  }, [celebrate]);

  // Konami Code Detection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.code;
      const newProgress = [...konamiProgressRef.current, key].slice(-KONAMI_CODE.length);
      konamiProgressRef.current = newProgress;

      if (newProgress.join(',') === KONAMI_CODE.join(',')) {
        triggerKonamiEasterEgg();
        konamiProgressRef.current = [];
      }

      // Detect typed secret codes
      if (e.key && e.key.length === 1 && /[a-z]/i.test(e.key)) {
        const newTyped = (typedTextRef.current + e.key.toLowerCase()).slice(-10);
        typedTextRef.current = newTyped;

        Object.entries(SECRET_CODES).forEach(([code, { name, action }]) => {
          if (newTyped.endsWith(code)) {
            triggerSecretCode(name, action);
            typedTextRef.current = '';
          }
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [triggerKonamiEasterEgg, triggerSecretCode]);

  return (
    <>
      {children}
      
      {/* Party Mode Overlay */}
      <AnimatePresence>
        {partyMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 pointer-events-none z-50"
          >
            <Confetti isActive={true} particleCount={150} duration={10000} />
            <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-4">
              {[PartyPopper, Music, Sparkles, Rocket, Ghost].map((Icon, i) => (
                <motion.div
                  key={i}
                  animate={{
                    y: [0, -20, 0],
                    rotate: [0, 360],
                    scale: [1, 1.2, 1],
                  }}
                  transition={{
                    duration: 1,
                    delay: i * 0.2,
                    repeat: Infinity,
                  }}
                >
                  <Icon className="h-8 w-8 text-warning" />
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Matrix Mode Overlay */}
      <AnimatePresence>
        {matrixMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 pointer-events-none z-50 overflow-hidden"
          >
            {matrixColumns.map((column, i) => (
              <motion.div
                key={i}
                className="absolute text-success font-mono text-sm"
                style={{ left: `${i * 5}%` }}
                initial={{ top: '-100%' }}
                animate={{ top: '100%' }}
                transition={{
                  duration: column.duration,
                  delay: column.delay,
                  repeat: Infinity,
                }}
              >
                {column.chars.map((char, j) => (
                  <div key={j} style={{ opacity: 1 - j * 0.03 }}>
                    {char}
                  </div>
                ))}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* CSS for special effects */}
      <style>{`
        .rainbow-mode {
          animation: rainbow-bg 2s linear infinite;
        }
        
        @keyframes rainbow-bg {
          0% { filter: hue-rotate(0deg); }
          100% { filter: hue-rotate(360deg); }
        }
        
        .disco-mode {
          animation: disco-bg 0.5s linear infinite;
        }
        
        @keyframes disco-bg {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.3) saturate(1.5); }
        }
      `}</style>
    </>
  );
});

// Hook to trigger easter eggs programmatically
export function useEasterEggs() {
  const { celebrate } = useCelebration();

  const triggerEasterEgg = useCallback((type: 'konami' | 'shake' | 'party' | 'matrix') => {
    switch (type) {
      case 'konami':
        celebrate({ title: '🎮 KONAMI!', subtitle: 'Segredo desbloqueado!', emoji: '🕹️' });
        break;
      case 'party':
        celebrate({ title: '🎉 FESTA!', subtitle: 'Celebração!', emoji: '🥳' });
        break;
    }
  }, [celebrate]);

  return { triggerEasterEgg };
}
