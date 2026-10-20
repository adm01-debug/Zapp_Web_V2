import { motion, useReducedMotion } from 'framer-motion';
import { Mic, Volume2, Loader2, Zap } from 'lucide-react';
import type { VoiceAgentPhase } from '@/hooks/voice/types';
import { usePhaseColors } from './usePhaseColors';

interface VoiceOrbProps {
  phase: VoiceAgentPhase;
  size?: number;
}

export function VoiceOrb({ phase, size = 200 }: VoiceOrbProps) {
  const colors = usePhaseColors(phase);
  const prefersReduced = useReducedMotion();
  const isActive = phase === 'listening' || phase === 'speaking' || phase === 'processing';
  const coreSize = size * 0.325;
  const highlightSize = size * 0.16;

  const pulseTransition = prefersReduced
    ? { duration: 0 }
    : { duration: isActive ? 2 : 4, repeat: Infinity, ease: 'easeInOut' as const };

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Deep ambient glow */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, ${colors.glow1} 0%, ${colors.glow2} 50%, transparent 70%)`,
          filter: 'blur(25px)',
        }}
        animate={prefersReduced ? {} : {
          scale: isActive ? [1, 1.15, 1] : [1, 1.05, 1],
          opacity: isActive ? [0.6, 0.8, 0.6] : [0.3, 0.4, 0.3],
        }}
        transition={pulseTransition}
      />

      {/* Flowing wave rings — skip if reduced motion */}
      {!prefersReduced && (
        <svg className="absolute inset-0" viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
          <defs>
            <filter id="voiceOrbWaveBlur">
              <feGaussianBlur stdDeviation="1" />
            </filter>
          </defs>
          {[92, 78, 65].map((radius, i) => {
            const r = (radius / 200) * size;
            const cx = size / 2;
            const cy = size / 2;
            return (
              <motion.circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={i === 0 ? colors.primary : i === 1 ? colors.secondary : colors.accent}
                strokeWidth={1}
                strokeOpacity={isActive ? 0.4 : 0.15}
                filter="url(#voiceOrbWaveBlur)"
                animate={{ rotate: i % 2 === 0 ? 360 : -360 }}
                transition={{ duration: 10 + i * 4, repeat: Infinity, ease: 'linear' }}
                style={{ transformOrigin: `${cx}px ${cy}px` }}
              />
            );
          })}
        </svg>
      )}

      {/* Light rays — skip if reduced motion */}
      {!prefersReduced && (
        <motion.div
          className="absolute inset-0"
          animate={{ rotate: 360 }}
          transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute"
              style={{
                left: '50%',
                top: '50%',
                width: 1,
                height: size * 0.35,
                background: `linear-gradient(to top, ${colors.primary.replace('hsl(', 'hsla(').replace(')', ', 0.25)')}, transparent)`,
                transformOrigin: 'bottom center',
                transform: `rotate(${i * 45}deg) translateY(-${size * 0.15}px)`,
              }}
              animate={{
                opacity: isActive ? [0.2, 0.5, 0.2] : [0.05, 0.15, 0.05],
                scaleY: isActive ? [0.8, 1.1, 0.8] : [0.6, 0.8, 0.6],
              }}
              transition={{ duration: 3 + i * 0.3, repeat: Infinity, ease: 'easeInOut' }}
            />
          ))}
        </motion.div>
      )}

      {/* Core orb */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: coreSize,
          height: coreSize,
          left: (size - coreSize) / 2,
          top: (size - coreSize) / 2,
          background: `radial-gradient(circle at 35% 35%, ${colors.primary}, ${colors.secondary} 60%, ${colors.accent})`,
          boxShadow: `
            0 0 ${size * 0.15}px ${colors.glow1},
            0 0 ${size * 0.3}px ${colors.glow2},
            inset 0 0 ${size * 0.1}px rgba(255,255,255,0.1)
          `,
        }}
        animate={prefersReduced ? {} : {
          scale: isActive ? [1, 1.08, 1] : [1, 1.03, 1],
        }}
        transition={prefersReduced ? {} : { duration: isActive ? 1.5 : 3, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Specular highlight */}
      <div
        className="absolute rounded-full"
        style={{
          width: highlightSize,
          height: highlightSize,
          left: size / 2 - highlightSize * 0.8,
          top: size / 2 - highlightSize * 0.8,
          background: 'radial-gradient(circle, rgba(255,255,255,0.35), transparent)',
        }}
      />

      {/* Phase icon */}
      <div
        className="absolute flex items-center justify-center"
        style={{
          width: coreSize,
          height: coreSize,
          left: (size - coreSize) / 2,
          top: (size - coreSize) / 2,
        }}
      >
        {phase === 'idle' && (
          <Mic className="w-6 h-6 text-white/60 drop-shadow-lg" />
        )}
        {phase === 'booting' && (
          <Loader2 className="w-6 h-6 text-white animate-spin drop-shadow-lg" />
        )}
        {phase === 'listening' && (
          <motion.div
            animate={prefersReduced ? {} : { scale: [1, 1.2, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          >
            <Mic className="w-6 h-6 text-white drop-shadow-lg" />
          </motion.div>
        )}
        {phase === 'processing' && (
          <motion.div
            animate={prefersReduced ? {} : { rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          >
            <Zap className="w-6 h-6 text-white drop-shadow-lg" />
          </motion.div>
        )}
        {phase === 'speaking' && (
          <motion.div
            animate={prefersReduced ? {} : { scale: [1, 1.15, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          >
            <Volume2 className="w-6 h-6 text-white drop-shadow-lg" />
          </motion.div>
        )}
        {phase === 'error' && (
          <motion.div
            animate={prefersReduced ? {} : { rotate: [0, 10, -10, 0] }}
            transition={{ duration: 0.5, repeat: Infinity }}
          >
            <Mic className="w-6 h-6 text-destructive drop-shadow-lg" />
          </motion.div>
        )}
      </div>
    </div>
  );
}
