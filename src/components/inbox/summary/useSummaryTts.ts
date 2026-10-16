import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/integrations/supabase/client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { playTtsAudio, type TtsPlayback, type PlayTtsOptions } from '@/hooks/voice/playTtsAudio';
import { useUserSettings } from '@/hooks/system/useUserSettings';
import { toast } from 'sonner';

export function useSummaryTts(contactId?: string) {
  // 'Ouvir resumo' fala com a voz e a velocidade escolhidas no cabeçalho: mesma fonte de
  // verdade do seletor (`tts_voice_id` / `tts_speed`).
  const { settings } = useUserSettings();
  const ttsRef = useRef<TtsPlayback | null>(null);
  const [isTtsPlaying, setIsTtsPlaying] = useState(false);
  const [isTtsLoading, setIsTtsLoading] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [lastTtsText, setLastTtsText] = useState<string | null>(null);

  useEffect(() => {
    return () => { ttsRef.current?.stop(); ttsRef.current = null; };
  }, []);

  useEffect(() => {
    ttsRef.current?.stop(); ttsRef.current = null;
    setIsTtsPlaying(false); setIsTtsLoading(false); setAutoplayBlocked(false);
  }, [contactId]);

  const startTtsPlayback = useCallback((text: string) => {
    if (isTtsPlaying) {
      ttsRef.current?.stop(); ttsRef.current = null;
      setIsTtsPlaying(false); setIsTtsLoading(false);
      return;
    }
    if (!text.trim()) return;

    setAutoplayBlocked(false);
    setLastTtsText(text);

    const ttsOptions: PlayTtsOptions = {
      voiceId: settings.tts_voice_id,
      speed: settings.tts_speed,
      onLoadingChange: setIsTtsLoading,
      onError: (err) => {
        if (err.message === 'AUTOPLAY_BLOCKED') return;
        toast.error('Erro ao gerar áudio: ' + err.message);
      },
      onAutoplayBlocked: () => {
        setAutoplayBlocked(true); setIsTtsPlaying(false); setIsTtsLoading(false);
      },
    };

    const playback = playTtsAudio(text, SUPABASE_URL, SUPABASE_ANON_KEY, ttsOptions);
    ttsRef.current = playback;
    setIsTtsPlaying(true);
    playback.promise.then(() => setIsTtsPlaying(false)).catch(() => setIsTtsPlaying(false));
  }, [isTtsPlaying, settings.tts_voice_id, settings.tts_speed]);

  const handleRetryAutoplay = useCallback(() => {
    if (lastTtsText) { setAutoplayBlocked(false); startTtsPlayback(lastTtsText); }
  }, [lastTtsText, startTtsPlayback]);

  const handleDismissAutoplayWarning = useCallback(() => {
    setAutoplayBlocked(false); setLastTtsText(null);
  }, []);

  return {
    isTtsPlaying, isTtsLoading, autoplayBlocked, lastTtsText,
    startTtsPlayback, handleRetryAutoplay, handleDismissAutoplayWarning,
  };
}
