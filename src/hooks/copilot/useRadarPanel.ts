/**
 * CV-051–060 — Fase 6 do RADAR: estado central do painel flutuante.
 *
 * Responsabilidades:
 *   CV-052: modo (mini/normal/foco) persistido por conversa no localStorage.
 *   CV-054: estado "pensando" com timeout automático de 10 s.
 *   CV-055: timeline de insights acumulados na sessão.
 *   CV-058: modo "não perturbe" — por conversa ou por 30 min globais.
 *   CV-059: fonte única de estado; aba IA e "Visão" lêem o mesmo store.
 */
import { useState, useCallback, useRef, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type RadarPanelMode = 'mini' | 'normal' | 'focus';

export interface RadarInsight {
  id: string;
  text: string;
  messageId?: string;
  timestamp: number;
}

export interface RadarPanelState {
  open: boolean;
  mode: RadarPanelMode;
  thinking: boolean;
  /** Mensagem exibida quando o timeout estoura (CV-054). */
  thinkingError: string | null;
  /** Histórico de insights da sessão (CV-055). */
  timeline: RadarInsight[];
  /** Mudo para esta conversa específica (CV-058). */
  mutedForConversation: boolean;
  /** Mudo global até este timestamp (CV-058). */
  globalMutedUntil: number;
}

export interface UseRadarPanelReturn extends RadarPanelState {
  toggle: () => void;
  setMode: (mode: RadarPanelMode) => void;
  startThinking: () => void;
  stopThinking: () => void;
  pushInsight: (text: string, messageId?: string) => void;
  muteForConversation: () => void;
  unmuteForConversation: () => void;
  muteGlobalFor30Min: () => void;
  unmuteGlobal: () => void;
  /** Verdadeiro quando qualquer mudo está ativo — sem processar nada (CV-058). */
  isMuted: boolean;
}

// ---------------------------------------------------------------------------
// Helpers de persistência
// ---------------------------------------------------------------------------

const THINKING_TIMEOUT_MS = 10_000;
const GLOBAL_MUTE_KEY = 'radar_panel_muted_until';
const CONV_MUTE_PREFIX = 'radar_muted_conv_';
const MODE_PREFIX = 'radar_mode_conv_';

function readGlobalMuteUntil(): number {
  try {
    return parseInt(localStorage.getItem(GLOBAL_MUTE_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function writeGlobalMuteUntil(until: number): void {
  try {
    if (until <= 0) localStorage.removeItem(GLOBAL_MUTE_KEY);
    else localStorage.setItem(GLOBAL_MUTE_KEY, String(until));
  } catch { /* private window */ }
}

function readConvMute(conversationId: string): boolean {
  try {
    return localStorage.getItem(CONV_MUTE_PREFIX + conversationId) === '1';
  } catch {
    return false;
  }
}

function writeConvMute(conversationId: string, muted: boolean): void {
  try {
    if (muted) localStorage.setItem(CONV_MUTE_PREFIX + conversationId, '1');
    else localStorage.removeItem(CONV_MUTE_PREFIX + conversationId);
  } catch { /* private window */ }
}

function readMode(conversationId: string): RadarPanelMode {
  try {
    const v = localStorage.getItem(MODE_PREFIX + conversationId);
    if (v === 'mini' || v === 'normal' || v === 'focus') return v;
  } catch { /* ignore */ }
  return 'normal';
}

function writeMode(conversationId: string, mode: RadarPanelMode): void {
  try {
    localStorage.setItem(MODE_PREFIX + conversationId, mode);
  } catch { /* private window */ }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useRadarPanel(conversationId: string): UseRadarPanelReturn {
  const [open, setOpen] = useState(false);
  const [mode, setModeState] = useState<RadarPanelMode>(() => readMode(conversationId));
  const [thinking, setThinking] = useState(false);
  const [thinkingError, setThinkingError] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<RadarInsight[]>([]);
  const [mutedForConversation, setMutedForConversation] = useState(() => readConvMute(conversationId));
  const [globalMutedUntil, setGlobalMutedUntil] = useState(() => readGlobalMuteUntil());

  const thinkingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insightCounter = useRef(0);

  // Recarrega estado quando a conversa muda
  useEffect(() => {
    setModeState(readMode(conversationId));
    setMutedForConversation(readConvMute(conversationId));
    setTimeline([]);
    setThinking(false);
    setThinkingError(null);
    if (thinkingTimerRef.current) clearTimeout(thinkingTimerRef.current);
  }, [conversationId]);

  // Limpa mute global expirado na montagem
  useEffect(() => {
    const until = readGlobalMuteUntil();
    if (until > 0 && Date.now() > until) {
      writeGlobalMuteUntil(0);
      setGlobalMutedUntil(0);
    }
  }, []);

  const toggle = useCallback(() => setOpen(prev => !prev), []);

  const setMode = useCallback((m: RadarPanelMode) => {
    setModeState(m);
    writeMode(conversationId, m);
  }, [conversationId]);

  const startThinking = useCallback(() => {
    setThinking(true);
    setThinkingError(null);
    if (thinkingTimerRef.current) clearTimeout(thinkingTimerRef.current);
    thinkingTimerRef.current = setTimeout(() => {
      setThinking(false);
      setThinkingError('Não consegui analisar agora — tentar de novo');
    }, THINKING_TIMEOUT_MS);
  }, []);

  const stopThinking = useCallback(() => {
    setThinking(false);
    setThinkingError(null);
    if (thinkingTimerRef.current) clearTimeout(thinkingTimerRef.current);
  }, []);

  const pushInsight = useCallback((text: string, messageId?: string) => {
    insightCounter.current += 1;
    setTimeline(prev => [
      ...prev,
      { id: `insight-${insightCounter.current}`, text, messageId, timestamp: Date.now() },
    ]);
  }, []);

  const muteForConversation = useCallback(() => {
    setMutedForConversation(true);
    writeConvMute(conversationId, true);
  }, [conversationId]);

  const unmuteForConversation = useCallback(() => {
    setMutedForConversation(false);
    writeConvMute(conversationId, false);
  }, [conversationId]);

  const muteGlobalFor30Min = useCallback(() => {
    const until = Date.now() + 30 * 60_000;
    setGlobalMutedUntil(until);
    writeGlobalMuteUntil(until);
  }, []);

  const unmuteGlobal = useCallback(() => {
    setGlobalMutedUntil(0);
    writeGlobalMuteUntil(0);
  }, []);

  const isMuted = mutedForConversation || (globalMutedUntil > 0 && Date.now() < globalMutedUntil);

  // cleanup
  useEffect(() => () => {
    if (thinkingTimerRef.current) clearTimeout(thinkingTimerRef.current);
  }, []);

  return {
    open, mode, thinking, thinkingError, timeline,
    mutedForConversation, globalMutedUntil, isMuted,
    toggle, setMode, startThinking, stopThinking,
    pushInsight, muteForConversation, unmuteForConversation,
    muteGlobalFor30Min, unmuteGlobal,
  };
}
