import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { AlertTriangle, Loader2, MessageCircle } from 'lucide-react';
import type { VoiceAgentPhase } from '@/hooks/voice/types';

interface VoiceTranscriptAreaProps {
  phase: VoiceAgentPhase;
  partialTranscript: string;
  finalTranscript: string;
  agentResponse: string;
  error: string;
  colors: {
    primary: string;
    secondary: string;
    glow1: string;
    glow2: string;
  };
}

export function VoiceTranscriptArea({
  phase,
  partialTranscript,
  finalTranscript,
  agentResponse,
  error,
  colors,
}: VoiceTranscriptAreaProps) {
  const prefersReduced = useReducedMotion();

  return (
    <div className="w-full min-h-[56px] space-y-2" aria-live="polite" aria-atomic="true">
      <AnimatePresence mode="wait">
        {partialTranscript && (
          <motion.div
            key="partial"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center text-sm text-white/50 italic"
          >
            "{partialTranscript}"
          </motion.div>
        )}

        {finalTranscript && !partialTranscript && (
          <motion.div
            key="final"
            initial={{ opacity: 0, y: prefersReduced ? 0 : 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center text-sm text-white/80 font-medium"
          >
            🎤 "{finalTranscript}"
          </motion.div>
        )}

        {agentResponse && (
          <motion.div
            key="response"
            initial={{ opacity: 0, y: prefersReduced ? 0 : 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center text-sm font-medium px-3 py-2 rounded-xl"
            style={{
              background: `linear-gradient(135deg, ${colors.primary.replace('hsl(', 'hsla(').replace(')', ', 0.08)')}, ${colors.secondary.replace('hsl(', 'hsla(').replace(')', ', 0.08)')})`,
              border: `1px solid ${colors.primary.replace('hsl(', 'hsla(').replace(')', ', 0.15)')}`,
              color: 'rgba(255,255,255,0.85)',
            }}
          >
            <MessageCircle className="w-3 h-3 inline-block mr-1.5 opacity-60" />
            {agentResponse}
          </motion.div>
        )}

        {phase === 'processing' && !agentResponse && (
          <motion.div
            key="processing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-center gap-2 text-white/40 text-xs"
          >
            <Loader2 className="w-3 h-3 animate-spin" />
            Processando com IA...
          </motion.div>
        )}

        {phase === 'booting' && (
          <motion.div
            key="booting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-center gap-2 text-white/40 text-xs"
          >
            <Loader2 className="w-3 h-3 animate-spin" />
            Conectando microfone...
          </motion.div>
        )}

        {error && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col gap-1.5 items-center text-center px-3 py-2.5 rounded-xl bg-destructive/10 border border-destructive/20"
            role="alert"
          >
            <div className="flex items-center gap-2 text-destructive text-xs font-medium">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              {error}
            </div>
            <span className="text-3xs text-white/30">Toque no orbe para tentar novamente</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
