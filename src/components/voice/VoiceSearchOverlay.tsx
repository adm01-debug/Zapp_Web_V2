import { useEffect, useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import type { VoiceAgentPhase } from '@/hooks/voice/types';
import { VoiceOrb } from './VoiceOrb';
import { FloatingParticles } from './FloatingParticles';
import { AudioFrequencyVisualizer } from './AudioFrequencyVisualizer';
import { usePhaseColors } from './usePhaseColors';
import { VoiceTranscriptArea } from './VoiceTranscriptArea';
import { VoiceSuggestions } from './VoiceSuggestions';

interface VoiceSearchOverlayProps {
  isOpen: boolean;
  phase: VoiceAgentPhase;
  partialTranscript: string;
  finalTranscript: string;
  agentResponse: string;
  error: string;
  onClose: () => void;
  onStartListening: () => Promise<void>;
  onStopListening: () => void;
  onStopSpeaking: () => void;
}

const PHASE_META: Record<VoiceAgentPhase, { title: string; subtitle: string }> = {
  idle: { title: 'Assistente de Voz', subtitle: 'Toque no orbe para começar' },
  booting: { title: 'Ativando microfone...', subtitle: 'Preparando sua conversa por voz' },
  listening: { title: 'Ouvindo...', subtitle: 'Fale seu comando agora' },
  processing: { title: 'Processando...', subtitle: 'Analisando seu comando com IA' },
  speaking: { title: 'Respondendo', subtitle: 'Toque no orbe para interromper' },
  error: { title: 'Erro', subtitle: 'Toque para tentar novamente' },
};

export function VoiceSearchOverlay({
  isOpen, phase, partialTranscript, finalTranscript, agentResponse, error,
  onClose, onStartListening, onStopListening, onStopSpeaking,
}: VoiceSearchOverlayProps) {
  const colors = usePhaseColors(phase);
  const meta = PHASE_META[phase];
  const prefersReduced = useReducedMotion();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Focus trap
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => closeButtonRef.current?.focus(), 100);
      const trapFocus = (e: KeyboardEvent) => {
        if (e.key !== 'Tab') return;
        const overlay = document.querySelector('[role="dialog"][aria-modal="true"]');
        if (!overlay) return;
        const focusable = overlay.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable.length === 0) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
        else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
      };
      window.addEventListener('keydown', trapFocus);
      return () => { clearTimeout(timer); window.removeEventListener('keydown', trapFocus); };
    }
  }, [isOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    if (isOpen) window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const hasAutoStarted = useRef(false);
  const startingRef = useRef(false);
  useEffect(() => {
    if (isOpen && phase === 'idle' && !hasAutoStarted.current && !startingRef.current) {
      hasAutoStarted.current = true; startingRef.current = true; setShowSuggestions(false);
      const timer = setTimeout(() => { onStartListening().finally(() => { startingRef.current = false; }); }, 80);
      return () => { clearTimeout(timer); startingRef.current = false; };
    }
    if (isOpen && phase === 'idle' && hasAutoStarted.current) { const timer = setTimeout(() => setShowSuggestions(true), 600); return () => clearTimeout(timer); }
    if (phase !== 'idle') setShowSuggestions(false);
    if (!isOpen) { hasAutoStarted.current = false; startingRef.current = false; setShowSuggestions(false); }
  }, [isOpen, phase, onStartListening]);

  const handleOrbClick = useCallback(() => {
    if (phase === 'idle' || phase === 'error') onStartListening();
    else if (phase === 'listening') onStopListening();
    else if (phase === 'speaking') onStopSpeaking();
    if (navigator.vibrate) navigator.vibrate(30);
  }, [phase, onStartListening, onStopListening, onStopSpeaking]);

  useEffect(() => {
    if (isOpen) { const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = prev; }; }
  }, [isOpen]);

  const isActive = phase === 'listening' || phase === 'speaking' || phase === 'processing';

  return createPortal(
    <AnimatePresence mode="wait">
      {isOpen && <motion.div key="voice-overlay" className="fixed inset-0 z-[9999] flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: prefersReduced ? 0.1 : 0.3 }} role="dialog" aria-modal="true" aria-label="Assistente de voz">
        <motion.div className="absolute inset-0" style={{ backdropFilter: 'blur(24px) saturate(1.2)', WebkitBackdropFilter: 'blur(24px) saturate(1.2)' }}
          animate={prefersReduced ? { backgroundColor: 'rgba(8, 8, 20, 0.75)' } : { backgroundColor: ['rgba(12, 12, 30, 0.55)', 'rgba(4, 4, 12, 0.82)', 'rgba(12, 12, 30, 0.55)'] }}
          transition={prefersReduced ? {} : { duration: 8, repeat: Infinity, ease: 'easeInOut' }} onClick={onClose}
        />
        <motion.div className="absolute inset-0 pointer-events-none"
          animate={{ background: `radial-gradient(ellipse 60% 50% at 50% 45%, ${colors.glow1.replace('hsl(', 'hsla(').replace(')', ', 0.07)')} 0%, transparent 70%)`, opacity: isActive ? [0.3, 0.6, 0.3] : 0.15 }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        />
        {!prefersReduced && <FloatingParticles phase={phase} />}

        <motion.div className="relative z-10 flex flex-col items-center gap-5 p-8 rounded-3xl max-w-[340px] w-full mx-4 overflow-visible" style={{ background: 'transparent' }}
          initial={prefersReduced ? {} : { scale: 0.9, y: 20 }} animate={prefersReduced ? {} : { scale: 1, y: 0 }} transition={prefersReduced ? {} : { duration: 0.4, ease: 'easeOut' }}
        >
          <motion.div className="absolute -inset-6 rounded-token-2xl pointer-events-none" style={{ filter: 'blur(28px)', background: `radial-gradient(ellipse at center, ${colors.glow1.replace('hsl(', 'hsla(').replace(')', ', 0.25)')}, ${colors.glow2.replace('hsl(', 'hsla(').replace(')', ', 0.15)')}, transparent 70%)` }}
            animate={prefersReduced ? {} : { opacity: isActive ? [0.6, 1, 0.6] : [0.4, 0.7, 0.4], scale: isActive ? [1, 1.06, 1] : [1, 1.03, 1] }}
            transition={prefersReduced ? {} : { duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          />
          <div className="absolute -inset-[1px] rounded-3xl pointer-events-none" style={{ border: `1px solid ${colors.glow1.replace('hsl(', 'hsla(').replace(')', ', 0.18)')}`, boxShadow: `0 0 30px 8px ${colors.glow1.replace('hsl(', 'hsla(').replace(')', ', 0.3)')}, 0 0 80px 20px ${colors.glow2.replace('hsl(', 'hsla(').replace(')', ', 0.18)')}, inset 0 0 30px 4px ${colors.glow1.replace('hsl(', 'hsla(').replace(')', ', 0.06)')}` }} />
          <div className="absolute inset-0 rounded-3xl pointer-events-none" style={{ background: 'rgba(8, 8, 18, 0.92)' }} />

          <div className="relative z-10 flex flex-col items-center gap-5 w-full">
            <div className="text-center">
              <motion.h2 className="text-lg font-bold text-white/90" key={meta.title} initial={{ opacity: 0, y: prefersReduced ? 0 : -5 }} animate={{ opacity: 1, y: 0 }}>{meta.title}</motion.h2>
              <motion.p className="text-xs text-white/40 mt-1" key={meta.subtitle} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>{meta.subtitle}</motion.p>
            </div>
            <button onClick={handleOrbClick} className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent rounded-full"
              aria-label={phase === 'listening' ? 'Parar de ouvir' : phase === 'speaking' ? 'Interromper resposta' : 'Começar a ouvir'}>
              <VoiceOrb phase={phase} size={180} />
            </button>
            <AudioFrequencyVisualizer phase={phase} />
            <VoiceTranscriptArea phase={phase} partialTranscript={partialTranscript} finalTranscript={finalTranscript} agentResponse={agentResponse} error={error} colors={colors} />
            <VoiceSuggestions visible={showSuggestions && phase === 'idle' && !agentResponse} />
            <div className="flex items-center justify-between w-full pt-1">
              <span className="text-[10px] text-white/20"><kbd className="px-1 py-0.5 rounded bg-white/[0.05] border border-white/10 text-[9px] font-mono">ESC</kbd>{' '}para fechar</span>
              <button ref={closeButtonRef} onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 transition-colors focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent border border-white/10" aria-label="Fechar assistente de voz">
                <X className="w-4 h-4 text-white/40" />
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>}
    </AnimatePresence>,
    document.body
  );
}
