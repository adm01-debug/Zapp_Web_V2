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
  /**
   * R2-INB-041 — cleanup do bind de volume (subscribers do store + ganho WebAudio) da
   * fala vigente. Fica numa ref porque o `detach` devolvido por `attachMediaVolume` se
   * perdia dentro de `onended`/`onerror`: parar a fala ou desmontar o painel descartava
   * o Audio mantendo a inscrição dele no store global.
   */
  const detachRef = useRef<(() => void) | null>(null);

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

  /**
   * R2-INB-041 — solta a fala corrente de modo idempotente: pausa, desliga os handlers,
   * executa o `detach` do bind de volume, revoga a URL e limpa as refs. Não mexe em estado
   * React para poder rodar também no cleanup de unmount.
   */
  const releasePlayback = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.onplay = null;
      audio.onended = null;
      audio.onerror = null;
    }
    audioRef.current = null;
    detachRef.current?.();
    detachRef.current = null;
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    releasePlayback();
    setIsPlaying(false);
    setCurrentMessageId(null);
  }, [releasePlayback]);

  // R2-INB-041 — desmontar o painel descarta o player: solta o bind em vez de deixá-lo
  // inscrito no store global (a reprodução em si já morre com o elemento).
  useEffect(() => () => {
    releasePlayback();
  }, [releasePlayback]);

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
      detachRef.current = attachMediaVolume(audio);

      // Set playback rate
      audio.playbackRate = speed;

      // R2-INB-041 — ended e erro passam pelo MESMO caminho idempotente de liberação do
      // bind. Só a fala vigente pode soltar o player: uma fala antiga que termina depois
      // de outra assumir não pode derrubar o bind da que a substituiu.
      const releaseOwnPlayback = () => {
        if (audioRef.current !== audio) return;
        releasePlayback();
        setIsPlaying(false);
        setCurrentMessageId(null);
      };

      audio.onplay = () => setIsPlaying(true);
      audio.onended = releaseOwnPlayback;
      audio.onerror = () => {
        releaseOwnPlayback();
        toast.error('Erro ao reproduzir áudio');
      };

      await audio.play();
    } catch (error) {
      log.error('TTS error:', error);
      // R2-INB-041 — falha ao tocar também descarta o player: solta o bind e a URL.
      releasePlayback();
      const errorMessage = error instanceof Error ? error.message : 'Erro ao gerar áudio';
      toast.error(errorMessage);
      setCurrentMessageId(null);
    } finally {
      setIsLoading(false);
    }
  }, [voiceId, speed, useStreaming, stop, releasePlayback]);

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
