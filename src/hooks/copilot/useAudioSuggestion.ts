import { useState, useCallback } from 'react';

export interface UseAudioSuggestionOptions {
  /** Voice ID configured for this account */
  voiceId?: string;
}

export interface AudioSuggestionState {
  audioUrl: string | null;
  isGenerating: boolean;
  error: string | null;
}

/**
 * CV-108 — Áudio sugerido.
 * Converts a suggestion text to audio via existing TTS before the vendor decides to send.
 * The vendor always listens first — audio is never sent automatically.
 */
export function useAudioSuggestion(options: UseAudioSuggestionOptions = {}) {
  const { voiceId } = options;
  const [state, setState] = useState<AudioSuggestionState>({
    audioUrl: null,
    isGenerating: false,
    error: null,
  });

  const generate = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setState(s => ({ ...s, isGenerating: true, error: null, audioUrl: null }));
    try {
      const resp = await fetch('/api/ai-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice_id: voiceId }),
      });
      if (!resp.ok) throw new Error(`TTS error ${resp.status}`);
      const blob = await resp.blob();
      const audioUrl = URL.createObjectURL(blob);
      setState({ audioUrl, isGenerating: false, error: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao gerar áudio';
      setState({ audioUrl: null, isGenerating: false, error: msg });
    }
  }, [voiceId]);

  const clear = useCallback(() => {
    setState(prev => {
      if (prev.audioUrl) URL.revokeObjectURL(prev.audioUrl);
      return { audioUrl: null, isGenerating: false, error: null };
    });
  }, []);

  return { ...state, generate, clear };
}
