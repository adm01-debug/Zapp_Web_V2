import { useState, useCallback } from 'react';

export interface UseAudioTranscriptionOptions {
  onTranscribed?: (text: string) => void;
}

export interface AudioTranscriptionState {
  transcription: string | null;
  isTranscribing: boolean;
  error: string | null;
}

/**
 * CV-101 — DELEGADA a IA-121, IA-124.
 * Connects to existing ai-transcribe-audio edge function.
 * Transcription is fed back into BRINDE analysis as plain text.
 */
export function useAudioTranscription(options: UseAudioTranscriptionOptions = {}) {
  const { onTranscribed } = options;
  const [state, setState] = useState<AudioTranscriptionState>({
    transcription: null,
    isTranscribing: false,
    error: null,
  });

  const transcribe = useCallback(async (audioUrl: string, _conversationId: string) => {
    setState(s => ({ ...s, isTranscribing: true, error: null }));
    try {
      const resp = await fetch('/api/ai-transcribe-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio_url: audioUrl }),
      });
      if (!resp.ok) throw new Error(`transcription error ${resp.status}`);
      const { text } = await resp.json();
      setState({ transcription: text, isTranscribing: false, error: null });
      onTranscribed?.(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro na transcrição';
      setState({ transcription: null, isTranscribing: false, error: msg });
    }
  }, [onTranscribed]);

  const reset = useCallback(() => {
    setState({ transcription: null, isTranscribing: false, error: null });
  }, []);

  return { ...state, transcribe, reset };
}
