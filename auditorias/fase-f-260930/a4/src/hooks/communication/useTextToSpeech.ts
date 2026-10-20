import { SUPABASE_URL } from '@/integrations/supabase/client';
import { edgeAuthHeaders } from '@/lib/edgeAuthHeaders';
import { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { log } from '@/lib/logger';
import { attachMediaVolume } from '@/lib/mediaVolumeElement';
// Default voice: Custom voice from Voice Library
const DEFAULT_VOICE_ID = 'TY3h8ANhQUsJaa0Bga5F';

interface UseTextToSpeechOptions {
  initialVoiceId?: string;
  initialSpeed?: number;
  useStreaming?: boolean;
  onVoiceChange?: (voiceId: string) => void;
  onSpeedChange?: (speed: number) => void;
}

export function useTextToSpeech(options: UseTextToSpeechOptions = {}) {
  // Desestruturado: e o que faz a regra de dependencias do `useCallback` enxergar valores
  // nomeados em vez de `options` (o objeto literal que o chamador recria a cada render).
  const { initialVoiceId, initialSpeed, useStreaming, onVoiceChange, onSpeedChange } = options;
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentMessageId, setCurrentMessageId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  // E — os dois effects que existiam aqui sincronizavam prop -> estado com `setState` sincrono
  // dentro do effect (regra react-hooks/set-state-in-effect: cascata de renders). Agora o valor
  // efetivo e derivado no render: a escolha local so vale enquanto a prop que a originou nao mudar,
  // entao uma prop nova volta a vencer o valor local — o mesmo comportamento que os effects davam,
  // sem estado espelhado e sem effect.
  const [voiceOverride, setVoiceOverride] = useState<{ valor: string; base?: string } | null>(null);
  const [speedOverride, setSpeedOverride] = useState<{ valor: number; base?: number } | null>(null);
  const voiceId =
    voiceOverride && voiceOverride.base === initialVoiceId
      ? voiceOverride.valor
      : initialVoiceId || DEFAULT_VOICE_ID;
  const speed =
    speedOverride && speedOverride.base === initialSpeed
      ? speedOverride.valor
      : initialSpeed || 1.0;

  // A taxa do elemento de audio e efeito externo (nao e estado do React): fica em effect, agora sem
  // `setState` dentro dele.
  useEffect(() => {
    if (audioRef.current && initialSpeed !== undefined) {
      audioRef.current.playbackRate = initialSpeed;
    }
  }, [initialSpeed]);

  const setVoiceId = useCallback((newVoiceId: string) => {
    setVoiceOverride({ valor: newVoiceId, base: initialVoiceId });
    onVoiceChange?.(newVoiceId);
  }, [initialVoiceId, onVoiceChange]);

  const setSpeed = useCallback((newSpeed: number) => {
    // Clamp speed between 0.5 and 2.0
    const clampedSpeed = Math.max(0.5, Math.min(2.0, newSpeed));
    setSpeedOverride({ valor: clampedSpeed, base: initialSpeed });
    // Update current audio playback rate if playing
    if (audioRef.current) {
      audioRef.current.playbackRate = clampedSpeed;
    }
    onSpeedChange?.(clampedSpeed);
  }, [initialSpeed, onSpeedChange]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setIsPlaying(false);
    setCurrentMessageId(null);
  }, []);

  const speak = useCallback(async (text: string, messageId?: string) => {
    // Stop any current playback
    stop();

    if (!text || text.trim() === '') {
      toast.error('Texto vazio para reproduzir');
      return;
    }

    // Clean text (remove emojis, special characters that don't make sense in speech)
    const cleanText = text
      .replace(/\[.*?\]/g, '') // Remove [Imagem], [Áudio], etc.
      .replace(/https?:\/\/\S+/g, 'link') // Replace URLs with "link"
      .trim();

    if (!cleanText) {
      toast.error('Nenhum texto para reproduzir');
      return;
    }

    setIsLoading(true);
    setCurrentMessageId(messageId || null);

    try {
      const endpoint = useStreaming
        ? 'elevenlabs-tts-stream'
        : 'elevenlabs-tts';
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/${endpoint}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(await edgeAuthHeaders()),
          },
          body: JSON.stringify({ 
            text: cleanText,
            voiceId
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Erro ao gerar áudio');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      audioUrlRef.current = audioUrl;

      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      // E36 — o TTS toca no volume global, não no volume do sistema.
      const detachMediaVolume = attachMediaVolume(audio);
      
      // Set playback rate
      audio.playbackRate = speed;

      audio.onplay = () => setIsPlaying(true);
      audio.onended = () => {
        detachMediaVolume();
        setIsPlaying(false);
        setCurrentMessageId(null);
        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
          audioUrlRef.current = null;
        }
      };
      audio.onerror = () => {
        detachMediaVolume();
        setIsPlaying(false);
        setCurrentMessageId(null);
        toast.error('Erro ao reproduzir áudio');
      };

      await audio.play();
    } catch (error) {
      log.error('TTS error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro ao gerar áudio';
      toast.error(errorMessage);
      setCurrentMessageId(null);
    } finally {
      setIsLoading(false);
    }
  }, [voiceId, speed, useStreaming, stop]);

  return {
    speak,
    stop,
    isLoading,
    isPlaying,
    currentMessageId,
    voiceId,
    setVoiceId,
    speed,
    setSpeed,
  };
}
