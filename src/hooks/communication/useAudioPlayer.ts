import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { log } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_URL } from '@/config/supabase';
import { toast } from '@/hooks/ui/use-toast';
import { useMediaElementVolume } from '@/hooks/communication/useMediaElementVolume';
import {
  parseSupabaseStorageObjectUrl,
  PRIVATE_MEDIA_BUCKETS,
} from '@/lib/storage_object_reference';
import {
  pauseExclusiveAudio,
  playExclusiveAudio,
  registerExclusiveAudio,
} from '@/hooks/chat/useExclusiveAudio';
import { readAudioState, saveAudioState } from '@/lib/audioPlayerState';

interface UseAudioPlayerOptions {
  audioUrl: string;
  messageId: string;
}

const PRIVATE_AUDIO_BUCKETS = PRIVATE_MEDIA_BUCKETS;
const SUPABASE_STORAGE_ORIGINS = [new URL(SUPABASE_URL).origin] as const;
const SIGNED_URL_TTL_SECONDS = 3600;
const SIGNED_URL_REFRESH_AFTER_MS = 50 * 60 * 1000;

interface AudioPlaybackState {
  source: string;
  resolvedUrl: string;
  isPlaying: boolean;
  isLoading: boolean;
  hasError: boolean;
  progress: number;
  duration: number;
  currentTime: number;
}

function isPrivateAudioStorageUrl(url: string): boolean {
  return Boolean(parseSupabaseStorageObjectUrl(
    url,
    PRIVATE_AUDIO_BUCKETS,
    SUPABASE_STORAGE_ORIGINS
  ));
}

function createInitialPlaybackState(source: string): AudioPlaybackState {
  const requiresSigning = isPrivateAudioStorageUrl(source);
  return {
    source,
    resolvedUrl: requiresSigning ? '' : source,
    isPlaying: false,
    isLoading: requiresSigning,
    hasError: source === '',
    progress: 0,
    duration: 0,
    currentTime: 0,
  };
}

function createWaveformHeights(seed: string): number[] {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }

  return Array.from({ length: 30 }, (_, index) => {
    state = Math.imul(state ^ index, 2246822519);
    return 20 + (Math.abs(state) % 61);
  });
}

export function useAudioPlayer({ audioUrl, messageId }: UseAudioPlayerOptions) {
  const [playbackState, setPlaybackState] = useState<AudioPlaybackState>(() =>
    createInitialPlaybackState(audioUrl)
  );
  /**
   * A velocidade sobrevive ao desmonte do balão (lista virtualizada do chat): quem guarda é
   * `src/lib/audioPlayerState.ts`, por `messageId`, então remontar devolve o 1,5x escolhido
   * em vez de recomeçar em 1x.
   */
  const [playbackRate, setPlaybackRate] = useState(
    () => readAudioState(messageId)?.playbackRate ?? 1.0
  );
  const audioRef = useRef<HTMLAudioElement>(null);
  const resolvedAtRef = useRef({ source: '', timestamp: 0 });
  /** Espelho da velocidade para os listeners do elemento não dependerem do render. A
   * sincronização é por efeito: escrever ref durante o render é violação do lint ratchet. */
  const playbackRateRef = useRef(playbackRate);
  useEffect(() => {
    playbackRateRef.current = playbackRate;
  }, [playbackRate]);
  /** Ponto guardado, reaplicado UMA vez, quando os metadados do áudio chegam. */
  const pendingRestoreRef = useRef(0);
  const restoredRef = useRef(false);
  const mountedRef = useRef(true);

  // E11 — volume é global (D2/E12): não entra no `playbackState` da mensagem, então
  // trocar de áudio no balão não zera nem recria o valor escolhido pelo atendente.
  const mediaVolume = useMediaElementVolume(audioRef);

  // Deriving the initial state for a new prop makes a previous message's URL
  // and playback flags impossible to leak during the transition render.
  const activeState = playbackState.source === audioUrl
    ? playbackState
    : createInitialPlaybackState(audioUrl);
  const {
    resolvedUrl,
    isPlaying,
    isLoading,
    hasError,
    progress,
    duration,
    currentTime,
  } = activeState;

  const updatePlaybackState = useCallback((patch: Partial<AudioPlaybackState>) => {
    setPlaybackState((current) => ({
      ...(current.source === audioUrl ? current : createInitialPlaybackState(audioUrl)),
      ...patch,
      source: audioUrl,
    }));
  }, [audioUrl]);

  const waveformHeights = useMemo(
    () => createWaveformHeights(messageId),
    [messageId]
  );

  const resolveAudioUrl = useCallback(async (url: string): Promise<string> => {
    const objectReference = parseSupabaseStorageObjectUrl(
      url,
      PRIVATE_AUDIO_BUCKETS,
      SUPABASE_STORAGE_ORIGINS
    );
    if (!objectReference) return url;

    const { data, error } = await supabase.storage
      .from(objectReference.bucket)
      .createSignedUrl(objectReference.path, SIGNED_URL_TTL_SECONDS);

    if (error || !data?.signedUrl) {
      throw error || new Error('Failed to sign private audio object');
    }

    return data.signedUrl;
  }, []);

  const refreshPrivateSource = useCallback(async (): Promise<string> => {
    const freshUrl = await resolveAudioUrl(audioUrl);
    updatePlaybackState({ resolvedUrl: freshUrl, isLoading: false, hasError: false });
    resolvedAtRef.current = { source: audioUrl, timestamp: Date.now() };
    return freshUrl;
  }, [audioUrl, resolveAudioUrl, updatePlaybackState]);

  useEffect(() => {
    let active = true;
    if (!isPrivateAudioStorageUrl(audioUrl)) {
      return () => { active = false; };
    }

    // Resolve before assigning <audio src>. This prevents the browser from
    // preloading an expired signed URL and emitting the observed HTTP 400.
    void resolveAudioUrl(audioUrl)
      .then((freshUrl) => {
        if (!active) return;
        updatePlaybackState({ resolvedUrl: freshUrl, isLoading: false, hasError: false });
        resolvedAtRef.current = { source: audioUrl, timestamp: Date.now() };
      })
      .catch((error) => {
        if (!active) return;
        log.error('Failed to resolve private audio URL:', error);
        updatePlaybackState({ isLoading: false, hasError: true });
      });

    return () => { active = false; };
  }, [audioUrl, resolveAudioUrl, updatePlaybackState]);

  /** Instância do `<audio>` que o React não solta: o `ref` do JSX fica `null` antes das
   * limpezas de efeito, então desmontar/exclusividade precisam do elemento capturado aqui. */
  const elementRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    elementRef.current = audio;

    const handleLoadedMetadata = () => {
      const d = audio.duration;
      const known = isFinite(d) && !isNaN(d) ? d : 0;
      updatePlaybackState({ duration: known, isLoading: false, hasError: false });

      // Remontou com o mesmo `messageId`: devolve a velocidade e o ponto onde parou. A
      // reaplicação acontece UMA vez por elemento — `load()` (renovação da URL assinada)
      // dispara `loadedmetadata` de novo e não pode saltar a reprodução para trás.
      audio.playbackRate = playbackRateRef.current;
      if (!restoredRef.current && pendingRestoreRef.current > 0) {
        const limit = known > 0 ? known : pendingRestoreRef.current;
        audio.currentTime = Math.min(pendingRestoreRef.current, limit);
      }
      restoredRef.current = true;
    };
    const handleTimeUpdate = () => {
      updatePlaybackState({
        currentTime: audio.currentTime,
        ...(audio.duration && isFinite(audio.duration)
          ? { progress: (audio.currentTime / audio.duration) * 100 }
          : {}),
      });
      if (audio.currentTime > 0) saveAudioState(messageId, { currentTime: audio.currentTime });
    };
    // `play`/`pause` do PRÓPRIO elemento: é assim que o botão acompanha uma pausa que não
    // veio dele (o store de exclusividade, os controles do sistema, outro player).
    const handlePlay = () => {
      playExclusiveAudio(messageId);
      updatePlaybackState({ isPlaying: true, isLoading: false, hasError: false });
    };
    const handlePause = () => updatePlaybackState({ isPlaying: false });
    // `ratechange` NÃO adota a velocidade do elemento: o `load()` (renovação da URL assinada)
    // reinicia para 1x e dispara o evento. Quem manda é a escolha do atendente, então o
    // listener reafirma o valor guardado — sem isso a velocidade voltaria a 1x sozinha.
    const handleRateChange = () => {
      const escolhida = playbackRateRef.current;
      if (audio.playbackRate !== escolhida) audio.playbackRate = escolhida;
      // Grava só em sessão de escuta (`currentTime > 0`): velocidade escolhida antes de o
      // áudio começar não vira memória, e o teto de entradas fica para quem foi ouvido.
      if (audio.currentTime > 0) saveAudioState(messageId, { playbackRate: escolhida });
    };
    const handleEnded = () => {
      // Fim do áudio: solta a exclusividade e o ponto volta ao começo (não retomar no fim).
      pauseExclusiveAudio(messageId);
      saveAudioState(messageId, { currentTime: 0, paused: true });
      updatePlaybackState({ isPlaying: false, progress: 0, currentTime: 0 });
    };
    const handleError = () => {
      log.error('Audio error:', messageId);
      updatePlaybackState({ isPlaying: false, isLoading: false, hasError: true });
    };
    const handleWaiting = () => updatePlaybackState({ isLoading: true });
    const handleCanPlay = () => updatePlaybackState({ isLoading: false });

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ratechange', handleRateChange);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ratechange', handleRateChange);
    };
  }, [resolvedUrl, messageId, updatePlaybackState]);

  /**
   * A01/D02 no balão da conversa: o MESMO store da aba Arquivos. Tocar este áudio assume a
   * exclusividade (pausando quem tocava) e um áudio de outro cartão pausa este — uma conversa
   * com vários balões (e a aba Arquivos aberta) nunca toca dois sons ao mesmo tempo.
   *
   * A limpeza do registro PAUSA o elemento e libera o dono do áudio: desmontar (rolar o balão
   * para fora da janela virtualizada, trocar de conversa) não deixa som fantasma. Antes de
   * soltar, a posição e a velocidade vão para o store — a remontagem devolve o ponto perdido.
   */
  useEffect(() => {
    mountedRef.current = true;
    const saved = readAudioState(messageId);
    if (saved && saved.currentTime > 0) pendingRestoreRef.current = saved.currentTime;

    const persist = () => {
      const audio = elementRef.current ?? audioRef.current;
      if (!audio) return;
      // Só sessão de ESCUTA vira memória: balão que apenas apareceu na lista (a virtualização
      // monta e desmonta dezenas ao rolar) não ganha entrada — senão o teto de 200 entradas
      // seria gasto com áudios que ninguém ouviu, expulsando os que estavam sendo ouvidos.
      if (audio.currentTime <= 0) return;
      saveAudioState(messageId, {
        currentTime: audio.currentTime,
        playbackRate: audio.playbackRate,
        paused: audio.paused,
      });
    };

    const unregister = registerExclusiveAudio(messageId, {
      pause: () => {
        (elementRef.current ?? audioRef.current)?.pause();
        persist();
        if (mountedRef.current) updatePlaybackState({ isPlaying: false });
      },
    });

    return () => {
      mountedRef.current = false;
      persist();
      unregister();
    };
  }, [messageId, updatePlaybackState]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      saveAudioState(messageId, { currentTime: audio.currentTime, paused: true });
      // Clique de pausa do atendente: solta a exclusividade para outro áudio poder tocar.
      pauseExclusiveAudio(messageId);
      updatePlaybackState({ isPlaying: false });
      return;
    }

    const isPrivateStorageObject = isPrivateAudioStorageUrl(audioUrl);
    const signedUrlIsStale = isPrivateStorageObject &&
      (resolvedAtRef.current.source !== audioUrl ||
        Date.now() - resolvedAtRef.current.timestamp >= SIGNED_URL_REFRESH_AFTER_MS);
    let refreshedBeforePlay = false;

    if (hasError || !resolvedUrl || signedUrlIsStale) {
      updatePlaybackState({ isLoading: true, hasError: false });
      try {
        const freshUrl = isPrivateStorageObject
          ? await refreshPrivateSource()
          : await resolveAudioUrl(audioUrl);
        audio.src = freshUrl;
        audio.load();
        // `load()` reinicia o elemento: a velocidade escolhida volta nele (o `loadedmetadata`
        // também reaplica, mas ele pode não chegar antes do `play()`).
        audio.playbackRate = playbackRateRef.current;
        refreshedBeforePlay = true;
      } catch (error) {
        log.error('Failed to refresh audio before playback:', error);
        updatePlaybackState({ hasError: true, isLoading: false });
        toast({ title: 'Erro ao carregar áudio', variant: 'destructive' });
        return;
      }
    }

    updatePlaybackState({ isLoading: true });
    try {
      await audio.play();
      playExclusiveAudio(messageId);
      updatePlaybackState({ isPlaying: true, isLoading: false, hasError: false });
    } catch (playError) {
      updatePlaybackState({ isPlaying: false });
      try {
        if (isPrivateStorageObject && !refreshedBeforePlay) {
          const freshUrl = await refreshPrivateSource();
          audio.src = freshUrl; audio.load();
          audio.playbackRate = playbackRateRef.current;
          await audio.play();
          playExclusiveAudio(messageId);
          updatePlaybackState({ isPlaying: true, isLoading: false, hasError: false });
        } else {
          log.error('Audio playback failed after source resolution:', playError);
          updatePlaybackState({ isLoading: false, hasError: true });
          toast({ title: 'Erro ao reproduzir', description: 'O arquivo de áudio expirou ou foi removido. Tente recarregar a conversa.', variant: 'destructive' });
        }
      } catch {
        updatePlaybackState({ isLoading: false, hasError: true });
        toast({ title: 'Erro ao reproduzir', description: 'Não foi possível carregar o áudio. Verifique sua conexão.', variant: 'destructive' });
      }
    }
  }, [
    isPlaying,
    hasError,
    audioUrl,
    messageId,
    resolvedUrl,
    resolveAudioUrl,
    refreshPrivateSource,
    updatePlaybackState,
  ]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
  }, [duration]);

  const cycleSpeed = useCallback(() => {
    const speeds = [1, 1.25, 1.5, 1.75, 2, 0.5, 0.75];
    const nextIndex = (speeds.indexOf(playbackRate) + 1) % speeds.length;
    const newRate = speeds[nextIndex];
    setPlaybackRate(newRate);
    playbackRateRef.current = newRate;
    if (audioRef.current) audioRef.current.playbackRate = newRate;
    // A velocidade vai para o store aqui também: o `ratechange` do elemento não é garantido
    // em todo navegador, e é ela que a remontagem precisa devolver. Mesma regra da escrita:
    // só em sessão de escuta (o balão precisa ter posição para virar memória).
    if ((elementRef.current?.currentTime ?? 0) > 0) {
      saveAudioState(messageId, { playbackRate: newRate });
    }
  }, [playbackRate, messageId]);

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '0:00';
    return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
  };

  return {
    audioRef, resolvedUrl, isPlaying, isLoading, hasError,
    playbackRate, progress, duration, currentTime, waveformHeights,
    togglePlay, handleSeek, cycleSpeed, formatTime, resolveAudioUrl,
    volume: mediaVolume.volume,
    muted: mediaVolume.muted,
    gain: mediaVolume.gain,
    setVolume: mediaVolume.setVolume,
    setMuted: mediaVolume.setMuted,
    toggleMuted: mediaVolume.toggleMuted,
    isMediaVolumeSupported: mediaVolume.isSupported,
  };
}
