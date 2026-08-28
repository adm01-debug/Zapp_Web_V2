import { useState, useCallback, useRef, useEffect } from 'react';
import { useScribe, CommitStrategy } from '@elevenlabs/react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import type { VoiceAgentPhase, VoiceAgentAction, UseVoiceAgentOptions, UseVoiceAgentReturn } from '../voice/types';
import { processVoiceTranscript } from '../voice/processTranscript';
import { playTtsAudio, type TtsPlayback } from '../voice/playTtsAudio';
import { logVoiceCommand } from '../voice/logVoiceCommand';
import { withRetry, friendlyErrorMessage } from '../voice/retry';

const SESSION_START_TIMEOUT_MS = 8000;
const ERROR_RESET_DELAY_MS = 5000;
const AUTO_RESTART_DELAY_MS = 800;

export type { VoiceAgentAction, VoiceAgentPhase };

export function useVoiceAgent(options?: UseVoiceAgentOptions): UseVoiceAgentReturn {
  const [phase, setPhase] = useState<VoiceAgentPhase>('idle');
  const [partialTranscript, setPartialTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [agentResponse, setAgentResponse] = useState('');
  const [error, setError] = useState('');

  const onActionRef = useRef(options?.onAction);
  const onErrorRef = useRef(options?.onError);
  const ttsRef = useRef<TtsPlayback | null>(null);
  const phaseRef = useRef<VoiceAgentPhase>('idle');
  const bootTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const autoRestartRef = useRef<ReturnType<typeof setTimeout>>();
  const errorResetRef = useRef<ReturnType<typeof setTimeout>>();
  const mountedRef = useRef(true);
  const processingAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    onActionRef.current = options?.onAction;
    onErrorRef.current = options?.onError;
  }, [options?.onAction, options?.onError]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Track mount status for async safety
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const supabaseUrl = SUPABASE_URL;
  const supabaseKey = SUPABASE_ANON_KEY;

  // Safe state setter — only updates if still mounted
  const safeSetPhase = useCallback((p: VoiceAgentPhase) => {
    if (mountedRef.current) setPhase(p);
  }, []);

  const clearAllTimers = useCallback(() => {
    clearTimeout(bootTimeoutRef.current);
    clearTimeout(autoRestartRef.current);
    clearTimeout(errorResetRef.current);
  }, []);

  const handleTranscript = useCallback(async (text: string) => {
    // Abort any in-flight processing
    processingAbortRef.current?.abort();
    const abortCtrl = new AbortController();
    processingAbortRef.current = abortCtrl;

    const startTime = Date.now();
    safeSetPhase('processing');
    if (mountedRef.current) setAgentResponse('');

    try {
      const result = await withRetry(() => {
        if (abortCtrl.signal.aborted) throw new Error('Aborted');
        return processVoiceTranscript(text, supabaseUrl, supabaseKey);
      });

      if (abortCtrl.signal.aborted || !mountedRef.current) return;

      setAgentResponse(result.response);
      safeSetPhase('speaking');

      try {
        const tts = playTtsAudio(result.response, supabaseUrl, supabaseKey);
        ttsRef.current = tts;
        await tts.promise;
      } catch (ttsErr) {
        log.warn('TTS playback failed, continuing silently', ttsErr);
      }

      if (!mountedRef.current) return;

      logVoiceCommand({
        transcript: text,
        action: result.action,
        response: result.response,
        data: result.data as Record<string, unknown>,
        durationMs: Date.now() - startTime,
        success: true,
      });

      onActionRef.current?.(result);

      safeSetPhase('idle');
      autoRestartRef.current = setTimeout(() => {
        if (mountedRef.current && scribe.isConnected) {
          safeSetPhase('listening');
        }
      }, AUTO_RESTART_DELAY_MS);
    } catch (err) {
      if (abortCtrl.signal.aborted || !mountedRef.current) return;

      const msg = friendlyErrorMessage(err);
      log.error('Voice processing error:', err);
      setError(msg);
      safeSetPhase('error');
      onErrorRef.current?.(msg);

      logVoiceCommand({
        transcript: text,
        action: 'error',
        response: msg,
        durationMs: Date.now() - startTime,
        success: false,
      });

      errorResetRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        setError('');
        safeSetPhase(scribe.isConnected ? 'listening' : 'idle');
      }, ERROR_RESET_DELAY_MS);
    }
  }, [supabaseUrl, supabaseKey, safeSetPhase]);

  const scribe = useScribe({
    modelId: 'scribe_v2_realtime',
    commitStrategy: CommitStrategy.VAD,
    onPartialTranscript: (data) => {
      if (mountedRef.current) setPartialTranscript(data.text);
    },
    onCommittedTranscript: (data) => {
      if (data.text.trim()) {
        if (mountedRef.current) {
          setFinalTranscript(data.text);
          setPartialTranscript('');
        }
        handleTranscript(data.text);
      }
    },
  });

  const startListening = useCallback(async () => {
    if (phaseRef.current === 'booting' || phaseRef.current === 'processing') return;

    clearAllTimers();
    safeSetPhase('booting');
    setPartialTranscript('');
    setFinalTranscript('');
    setAgentResponse('');
    setError('');

    try {
      const { data, error: tokenError } = await supabase.functions.invoke('elevenlabs-scribe-token');
      
      // Detect API key issues and give a user-friendly message
      if (tokenError) {
        const errMsg = typeof tokenError === 'object' && tokenError !== null 
          ? (tokenError as Record<string, unknown>).message || JSON.stringify(tokenError) 
          : String(tokenError);
        const isAuthError = String(errMsg).includes('401') || String(errMsg).toLowerCase().includes('invalid') || String(errMsg).toLowerCase().includes('api key');
        throw new Error(isAuthError 
          ? 'Chave da ElevenLabs inválida ou expirada. Atualize nas configurações do conector.' 
          : String(errMsg));
      }
      if (!data?.token) {
        throw new Error('Não foi possível obter token de transcrição. Verifique a configuração da ElevenLabs.');
      }

      if (!mountedRef.current) return;

      bootTimeoutRef.current = setTimeout(() => {
        if (phaseRef.current === 'booting' && mountedRef.current) {
          setError('Conexão com microfone demorou demais.');
          safeSetPhase('error');
          errorResetRef.current = setTimeout(() => {
            if (mountedRef.current) {
              setError('');
              safeSetPhase('idle');
            }
          }, ERROR_RESET_DELAY_MS);
        }
      }, SESSION_START_TIMEOUT_MS);

      await scribe.connect({
        token: data.token,
        microphone: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      clearTimeout(bootTimeoutRef.current);
      if (!mountedRef.current) return;
      safeSetPhase('listening');

      if (navigator.vibrate) navigator.vibrate(50);
    } catch (err) {
      clearTimeout(bootTimeoutRef.current);
      if (!mountedRef.current) return;
      const msg = friendlyErrorMessage(err);
      setError(msg);
      safeSetPhase('error');
      onErrorRef.current?.(msg);

      errorResetRef.current = setTimeout(() => {
        if (mountedRef.current) {
          setError('');
          safeSetPhase('idle');
        }
      }, ERROR_RESET_DELAY_MS);
    }
  }, [scribe, clearAllTimers, safeSetPhase]);

  const stopListening = useCallback(() => {
    scribe.disconnect();
    safeSetPhase('idle');
    setPartialTranscript('');
    clearTimeout(autoRestartRef.current);
  }, [scribe, safeSetPhase]);

  const stopSpeaking = useCallback(() => {
    ttsRef.current?.stop();
    ttsRef.current = null;
    safeSetPhase(scribe.isConnected ? 'listening' : 'idle');
  }, [scribe, safeSetPhase]);

  const reset = useCallback(() => {
    processingAbortRef.current?.abort();
    scribe.disconnect();
    ttsRef.current?.stop();
    ttsRef.current = null;
    clearAllTimers();
    safeSetPhase('idle');
    setPartialTranscript('');
    setFinalTranscript('');
    setAgentResponse('');
    setError('');
  }, [scribe, clearAllTimers, safeSetPhase]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      processingAbortRef.current?.abort();
      scribe.disconnect();
      ttsRef.current?.stop();
      clearTimeout(bootTimeoutRef.current);
      clearTimeout(autoRestartRef.current);
      clearTimeout(errorResetRef.current);
    };
  }, [scribe]);

  return {
    phase,
    partialTranscript,
    finalTranscript,
    agentResponse,
    error,
    startListening,
    stopListening,
    stopSpeaking,
    reset,
  };
}
