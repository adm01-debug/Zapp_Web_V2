/**
 * CV-101 — Transcrição de áudio (stub).
 *
 * Integração com Whisper/edge function delegada (CV-021).
 */
import { useState, useCallback } from 'react';

export interface AudioTranscriptionResult {
  transcript: string;
  isLoading: boolean;
  error: string | null;
}

export function useAudioTranscription(): AudioTranscriptionResult & { transcribe: (blob: Blob) => Promise<void> } {
  const [transcript, setTranscript] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const transcribe = useCallback(async (_blob: Blob) => {
    setIsLoading(true);
    setError(null);
    try {
      // DELEGADO: chamar edge function copilot-live com action=transcribe
      setTranscript('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro na transcrição');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { transcript, isLoading, error, transcribe };
}
