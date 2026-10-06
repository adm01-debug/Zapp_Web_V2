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
  // Desligamento do ganho de volume (`attachMediaVolume`) do Audio vigente.
  const detachVolumeRef = useRef<(() => void) | null>(null);
  // R2-INB-040 — geração vigente do pedido de TTS. Toda resposta em voo só pode criar
  // e tocar `Audio` enquanto ainda for a geração atual; parar, iniciar outra fala ou
  // desmontar incrementa a geração e aborta o fetch pendente.
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

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

  // R2-INB-040 — pausa e libera o Audio e a object URL da geração vigente. Não mexe em
  // estado do React: também roda na desmontagem, quando não existe mais componente.
  const releaseAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.onplay = null;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.currentTime = 0;
      audioRef.current = null;
    }
    if (detachVolumeRef.current) {
      detachVolumeRef.current();
      detachVolumeRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  // R2-INB-040 — invalida a geração vigente: o que estiver em voo não cria mais Audio
  // (a resposta é descartada) e o pedido HTTP é abortado.
  const invalidatePending = useCallback(() => {
    requestIdRef.current += 1;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  // R2-INB-040 — desmontar (a troca de conversa remonta o ChatPanel por `key`) invalida o
  // pedido em voo e libera o Audio vigente: nada continua tocando depois do painel sair.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      invalidatePending();
      releaseAudio();
    };
  }, [invalidatePending, releaseAudio]);

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
    invalidatePending();
    releaseAudio();
    if (!mountedRef.current) return;
    setIsLoading(false);
    setIsPlaying(false);
    setCurrentMessageId(null);
  }, [invalidatePending, releaseAudio]);

  const speak = useCallback(async (text: string, messageId?: string) => {
    // Invalida a geração anterior (aborta o fetch em voo e libera o Audio) e assume a
    // vigente. R2-INB-040: um pedido repetido não pode resultar em duas falas.
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

    const requestId = requestIdRef.current;
    const controller = new AbortController();
    abortRef.current = controller;

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
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Erro ao gerar áudio');
      }

      const audioBlob = await response.blob();

      // R2-INB-040 — só a geração vigente, com o hook montado, cria e toca o Audio.
      // A resposta de um pedido já invalidado (outro clique, stop ou desmontagem) morre aqui.
      if (requestIdRef.current !== requestId || !mountedRef.current) return;

      const audioUrl = URL.createObjectURL(audioBlob);
      audioUrlRef.current = audioUrl;

      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      // E36 — o TTS toca no volume global, não no volume do sistema.
      detachVolumeRef.current = attachMediaVolume(audio);

      // Set playback rate
      audio.playbackRate = speed;

      audio.onplay = () => setIsPlaying(true);
      audio.onended = () => {
        if (requestIdRef.current !== requestId) return;
        releaseAudio();
        setIsPlaying(false);
        setCurrentMessageId(null);
      };
      audio.onerror = () => {
        if (requestIdRef.current !== requestId) return;
        releaseAudio();
        setIsPlaying(false);
        setCurrentMessageId(null);
        toast.error('Erro ao reproduzir áudio');
      };

      await audio.play();
    } catch (error) {
      // R2-INB-040 — abortar o pedido é cancelamento, não erro de reprodução:
      // não reporta falha de uma fala que o usuário (ou a desmontagem) já descartou.
      if (controller.signal.aborted) return;
      log.error('TTS error:', error);
      if (requestIdRef.current !== requestId) return;
      releaseAudio();
      if (mountedRef.current) {
        const errorMessage = error instanceof Error ? error.message : 'Erro ao gerar áudio';
        toast.error(errorMessage);
        setIsPlaying(false);
        setCurrentMessageId(null);
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      // Só a geração vigente desliga o próprio loading: a obsoleta não mexe no estado.
      if (requestIdRef.current === requestId && mountedRef.current) setIsLoading(false);
    }
  }, [voiceId, speed, useStreaming, stop, releaseAudio]);

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
