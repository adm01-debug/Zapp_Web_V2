import { SUPABASE_URL } from '@/integrations/supabase/client';
import { edgeAuthHeaders } from '@/lib/edgeAuthHeaders';
import { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { log } from '@/lib/logger';
import { attachMediaVolume } from '@/lib/mediaVolumeElement';
// Default voice: Custom voice from Voice Library
const DEFAULT_VOICE_ID = 'TY3h8ANhQUsJaa0Bga5F';

/**
 * HZ3-004-A — voz LOCAL do dispositivo (Web Speech API). Escolhida nos preferências, ela
 * lê no próprio navegador: o texto da mensagem NÃO sai do sistema. As vozes premium
 * (ElevenLabs) só entram quando o agente escolhe uma delas (`tts_voice_id`), e nesse caso
 * o seletor avisa que o texto é enviado ao provedor.
 */
export const LOCAL_VOICE_ID = 'local';
/** Voz do dispositivo escolhida pelo URI/nome do sintetizador: `local:<voiceURI>`. */
export const LOCAL_VOICE_PREFIX = 'local:';
/**
 * Teto de texto aceito pela Edge `elevenlabs-tts` (`ElevenLabsTTSSchema`: `z.string().max(5000)`).
 * Aplicado no cliente para o pedido premium não voltar 400 com o texto do cliente dentro.
 */
export const MAX_TTS_TEXT_LENGTH = 5000;

/** A voz vigente é do dispositivo (sem preferência também cai aqui)? */
export function isLocalVoiceId(voiceId?: string): boolean {
  return !voiceId || voiceId === LOCAL_VOICE_ID || voiceId.startsWith(LOCAL_VOICE_PREFIX);
}

/** 429 (limite), 5xx (inclui chave ausente e flag de IA desligada) caem para a voz local. */
export function deveCairParaVozLocal(status: number): boolean {
  return status === 429 || status >= 500;
}

function getSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null;
  return window.speechSynthesis ?? null;
}

/** Resolve a voz do dispositivo pelo URI/nome configurado (`local:<voiceURI>`). */
function resolveDeviceVoice(synth: SpeechSynthesis, voiceId: string): SpeechSynthesisVoice | null {
  if (!voiceId.startsWith(LOCAL_VOICE_PREFIX)) return null;
  const alvo = voiceId.slice(LOCAL_VOICE_PREFIX.length).trim();
  if (!alvo) return null;
  const vozes = typeof synth.getVoices === 'function' ? synth.getVoices() : [];
  return vozes.find((v) => v.voiceURI === alvo || v.name === alvo) ?? null;
}

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
   * HZ3-004-A — fala local vigente. Guarda o texto, a mensagem e o trecho ainda não lido
   * (só a troca de velocidade ao vivo precisa retomar do ponto: a Web Speech não aceita
   * mudar a taxa durante a fala).
   */
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const localSpeechRef = useRef<{ texto: string; messageId?: string; lido: number } | null>(null);
  /**
   * R2-INB-041 — cleanup do bind de volume (subscribers do store + ganho WebAudio) da
   * fala vigente. Fica numa ref porque o `detach` devolvido por `attachMediaVolume` se
   * perdia dentro de `onended`/`onerror`: parar a fala ou desmontar o painel descartava
   * o Audio mantendo a inscrição dele no store global.
   */
  const detachRef = useRef<(() => void) | null>(null);
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

  /**
   * HZ3-004-A — cancela a fala local vigente (idempotente). Só mexe no sintetizador
   * quando existe fala NOSSA em curso: não derruba a fala de outro componente que use
   * `speechSynthesis` por conta própria.
   */
  const stopLocalSpeech = useCallback(() => {
    const utterance = utteranceRef.current;
    if (!utterance) return;
    utterance.onstart = null;
    utterance.onboundary = null;
    utterance.onend = null;
    utterance.onerror = null;
    utteranceRef.current = null;
    localSpeechRef.current = null;
    getSpeechSynthesis()?.cancel();
  }, []);

  /**
   * R2-INB-041 — solta a fala corrente de modo idempotente: pausa, desliga os handlers,
   * executa o `detach` do bind de volume, revoga a URL e limpa as refs. Não mexe em estado
   * React para poder rodar também no cleanup de unmount.
   */
  const releasePlayback = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
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
    stopLocalSpeech();
  }, [stopLocalSpeech]);

  // R2-INB-040 — invalida a geração vigente: o que estiver em voo não cria mais Audio
  // (a resposta é descartada) e o pedido HTTP é abortado.
  const invalidatePending = useCallback(() => {
    requestIdRef.current += 1;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  /**
   * HZ3-004-A — assume a voz do dispositivo: a fala local passa a ser a geração vigente
   * (um pedido de rede atrasado não pode tomar a reprodução) e o texto é lido no navegador,
   * sem chamada nenhuma à Edge. `lido` retoma do trecho não lido e `rate` aplica a
   * velocidade vigente.
   */
  const startLocalSpeech = useCallback(
    (texto: string, messageId?: string, lido = 0, rate = speed) => {
      const synth = getSpeechSynthesis();
      const Utterance = typeof SpeechSynthesisUtterance !== 'undefined' ? SpeechSynthesisUtterance : null;
      localSpeechRef.current = null;
      if (!synth || !Utterance) {
        if (mountedRef.current) toast.error('Voz do dispositivo não disponível neste navegador');
        return;
      }

      invalidatePending();
      const requestId = requestIdRef.current;

      const utterance = new Utterance(texto.slice(lido));
      utterance.rate = rate;
      const voz = resolveDeviceVoice(synth, voiceId);
      if (voz) utterance.voice = voz;

      utteranceRef.current = utterance;
      localSpeechRef.current = { texto, messageId, lido };

      utterance.onstart = () => {
        if (requestIdRef.current !== requestId || !mountedRef.current) return;
        setIsLoading(false);
        setIsPlaying(true);
      };
      utterance.onboundary = (evento) => {
        if (utteranceRef.current !== utterance) return;
        localSpeechRef.current = { texto, messageId, lido: lido + (evento.charIndex || 0) };
      };
      utterance.onend = () => {
        if (utteranceRef.current !== utterance) return;
        utteranceRef.current = null;
        localSpeechRef.current = null;
        if (!mountedRef.current) return;
        setIsLoading(false);
        setIsPlaying(false);
        setCurrentMessageId(null);
      };
      utterance.onerror = () => {
        if (utteranceRef.current !== utterance) return;
        utteranceRef.current = null;
        localSpeechRef.current = null;
        if (!mountedRef.current) return;
        setIsLoading(false);
        setIsPlaying(false);
        setCurrentMessageId(null);
        toast.error('Erro ao usar a voz do dispositivo');
      };

      setCurrentMessageId(messageId || null);
      setIsLoading(true);
      synth.speak(utterance);
    },
    [voiceId, speed, invalidatePending],
  );

  const stop = useCallback(() => {
    invalidatePending();
    releasePlayback();
    if (!mountedRef.current) return;
    setIsLoading(false);
    setIsPlaying(false);
    setCurrentMessageId(null);
  }, [invalidatePending, releasePlayback]);

  // R2-INB-040/R2-INB-041 — desmontar invalida o pedido em voo e solta o player/bind
  // vigente sem tentar gravar estado React depois que o hook saiu da árvore. HZ3-004-A:
  // a fala local é cancelada no sintetizador (o navegador continuaria lendo sem isso).
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      invalidatePending();
      releasePlayback();
    };
  }, [invalidatePending, releasePlayback]);

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
    // HZ3-004-A — troca ao vivo na voz local: o sintetizador não aceita mudar a taxa no meio
    // da fala, então o trecho ainda não lido recomeça na velocidade nova.
    const falaLocal = localSpeechRef.current;
    if (falaLocal) {
      const restante = falaLocal.texto.slice(falaLocal.lido);
      stopLocalSpeech();
      if (restante.trim()) startLocalSpeech(falaLocal.texto, falaLocal.messageId, falaLocal.lido, clampedSpeed);
    }
    onSpeedChange?.(clampedSpeed);
  }, [initialSpeed, onSpeedChange, startLocalSpeech, stopLocalSpeech]);

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

    // HZ3-004-A — caminho padrão: a voz do dispositivo lê no navegador, sem rede e sem
    // mandar o texto da mensagem para fora do sistema.
    if (isLocalVoiceId(voiceId)) {
      startLocalSpeech(cleanText, messageId);
      return;
    }

    const requestId = requestIdRef.current;
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setCurrentMessageId(messageId || null);

    // HZ3-004-B — teto do servidor aplicado no cliente: acima dele a Edge responderia 400 e
    // o pedido carregaria o texto inteiro do cliente para depois ser recusado.
    const textoPedido =
      cleanText.length > MAX_TTS_TEXT_LENGTH ? cleanText.slice(0, MAX_TTS_TEXT_LENGTH) : cleanText;
    if (textoPedido.length !== cleanText.length) {
      toast.info(`Mensagem longa: a voz premium lê os primeiros ${MAX_TTS_TEXT_LENGTH} caracteres`);
    }

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
            text: textoPedido,
            voiceId
          }),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // HZ3-004-B — 429 (limite) e 5xx (chave ausente, provedor fora, IA desligada por flag)
        // caem para a voz local em vez de só mostrar toast: o agente continua ouvindo.
        if (deveCairParaVozLocal(response.status)) {
          if (requestIdRef.current !== requestId || !mountedRef.current) return;
          log.warn('TTS premium indisponível; caindo para a voz do dispositivo', { status: response.status });
          toast.info('Voz premium indisponível: usando a voz do dispositivo');
          startLocalSpeech(cleanText, messageId);
          return;
        }
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
      detachRef.current = attachMediaVolume(audio);

      // Set playback rate
      audio.playbackRate = speed;

      // R2-INB-041 — ended e erro passam pelo MESMO caminho idempotente de liberação do
      // bind. Só a fala vigente pode soltar o player: uma fala antiga que termina depois
      // de outra assumir não pode derrubar o bind da que a substituiu.
      const releaseOwnPlayback = () => {
        if (requestIdRef.current !== requestId || audioRef.current !== audio) return false;
        releasePlayback();
        return true;
      };

      audio.onplay = () => {
        if (requestIdRef.current === requestId && mountedRef.current) setIsPlaying(true);
      };
      audio.onended = () => {
        if (!releaseOwnPlayback() || !mountedRef.current) return;
        setIsPlaying(false);
        setCurrentMessageId(null);
      };
      audio.onerror = () => {
        if (!releaseOwnPlayback() || !mountedRef.current) return;
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
      // R2-INB-041 — falha ao tocar também descarta o player: solta o bind e a URL.
      releasePlayback();
      if (mountedRef.current) {
        const errorMessage = error instanceof Error ? error.message : 'Erro ao gerar áudio';
        toast.error(errorMessage);
        setIsPlaying(false);
        setCurrentMessageId(null);
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      // Só a geração vigente desliga o próprio loading: a obsoleta não mexe no estado
      // (a queda para a voz local já assumiu a geração e mantém o loading da fala).
      if (requestIdRef.current === requestId && mountedRef.current) setIsLoading(false);
    }
  }, [voiceId, speed, useStreaming, stop, releasePlayback, startLocalSpeech]);

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
