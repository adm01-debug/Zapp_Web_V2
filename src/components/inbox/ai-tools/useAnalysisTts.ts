import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/integrations/supabase/client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { playTtsAudio, type TtsPlayback, type PlayTtsOptions } from '@/hooks/voice/playTtsAudio';
import { useUserSettings } from '@/hooks/system/useUserSettings';
import { toast } from 'sonner';

export function useAnalysisTts() {
  // 'Ouvir resumo' / 'Ouvir tudo' falam com a voz e a velocidade escolhidas no cabeçalho:
  // mesma fonte de verdade do seletor (`tts_voice_id` / `tts_speed`).
  const { settings } = useUserSettings();
  const [isTtsPlaying, setIsTtsPlaying] = useState(false);
  const [isTtsLoading, setIsTtsLoading] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [lastTtsText, setLastTtsText] = useState<string | null>(null);
  const ttsRef = useRef<TtsPlayback | null>(null);

  useEffect(() => {
    return () => {
      ttsRef.current?.stop();
    };
  }, []);

  const stopTts = useCallback(() => {
    if (ttsRef.current) {
      ttsRef.current.stop();
      ttsRef.current = null;
      setIsTtsPlaying(false);
      setIsTtsLoading(false);
    }
  }, []);

  const startTtsPlayback = useCallback((text: string) => {
    if (isTtsPlaying && ttsRef.current) {
      stopTts();
      return;
    }
    if (!text.trim()) return;

    setAutoplayBlocked(false);
    setLastTtsText(text);

    const supabaseUrl = SUPABASE_URL;
    const supabaseKey = SUPABASE_ANON_KEY;

    const ttsOptions: PlayTtsOptions = {
      voiceId: settings.tts_voice_id,
      speed: settings.tts_speed,
      onLoadingChange: setIsTtsLoading,
      onError: (err) => {
        if (err.message === 'AUTOPLAY_BLOCKED') return;
        toast.error('Erro ao gerar áudio: ' + err.message);
      },
      onAutoplayBlocked: () => {
        setAutoplayBlocked(true);
        setIsTtsPlaying(false);
        setIsTtsLoading(false);
      },
    };

    const playback = playTtsAudio(text, supabaseUrl, supabaseKey, ttsOptions);
    ttsRef.current = playback;
    setIsTtsPlaying(true);

    playback.promise
      .then(() => setIsTtsPlaying(false))
      .catch(() => setIsTtsPlaying(false));
  }, [isTtsPlaying, stopTts, settings.tts_voice_id, settings.tts_speed]);

  const handleRetryAutoplay = useCallback(() => {
    if (lastTtsText) {
      setAutoplayBlocked(false);
      startTtsPlayback(lastTtsText);
    }
  }, [lastTtsText, startTtsPlayback]);

  const handleDismissAutoplayWarning = useCallback(() => {
    setAutoplayBlocked(false);
    setLastTtsText(null);
  }, []);

  return {
    isTtsPlaying,
    isTtsLoading,
    autoplayBlocked,
    stopTts,
    startTtsPlayback,
    handleRetryAutoplay,
    handleDismissAutoplayWarning,
  };
}
