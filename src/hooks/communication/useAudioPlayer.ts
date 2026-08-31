import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { log } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_URL } from '@/config/supabase';
import { toast } from '@/hooks/ui/use-toast';
import {
  parseSupabaseStorageObjectUrl,
  PRIVATE_MEDIA_BUCKETS,
} from '@/lib/storage_object_reference';

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
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const resolvedAtRef = useRef({ source: '', timestamp: 0 });

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

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      const d = audio.duration;
      updatePlaybackState({
        duration: isFinite(d) && !isNaN(d) ? d : 0,
        isLoading: false,
        hasError: false,
      });
    };
    const handleTimeUpdate = () => {
      updatePlaybackState({
        currentTime: audio.currentTime,
        ...(audio.duration && isFinite(audio.duration)
          ? { progress: (audio.currentTime / audio.duration) * 100 }
          : {}),
      });
    };
    const handleEnded = () => updatePlaybackState({ isPlaying: false, progress: 0, currentTime: 0 });
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

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('canplay', handleCanPlay);
    };
  }, [resolvedUrl, messageId, updatePlaybackState]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
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
      updatePlaybackState({ isPlaying: true, isLoading: false, hasError: false });
    } catch (playError) {
      updatePlaybackState({ isPlaying: false });
      try {
        if (isPrivateStorageObject && !refreshedBeforePlay) {
          const freshUrl = await refreshPrivateSource();
          audio.src = freshUrl; audio.load();
          await audio.play();
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
    if (audioRef.current) audioRef.current.playbackRate = newRate;
  }, [playbackRate]);

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '0:00';
    return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
  };

  return {
    audioRef, resolvedUrl, isPlaying, isLoading, hasError,
    playbackRate, progress, duration, currentTime, waveformHeights,
    togglePlay, handleSeek, cycleSpeed, formatTime, resolveAudioUrl,
  };
}
