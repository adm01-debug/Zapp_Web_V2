import { useMemo } from 'react';

export type AudioTone = 'urgent' | 'irritated' | 'enthusiastic' | 'neutral';

export interface UseAudioToneDetectorOptions {
  /** Duration in seconds of the audio message */
  durationSeconds?: number;
  /** Transcribed text — tone is inferred from text when audio signal unavailable */
  transcription?: string | null;
  /** Provider-level tone signal, when available */
  providerTone?: AudioTone | null;
}

export interface AudioToneResult {
  tone: AudioTone | null;
  confidence: number;
  /** false when the capability is not supported by the current setup */
  isSupported: boolean;
  label: string;
}

const URGENT_PATTERNS = /urgent[eê]|rápid[ao]|preciso hoje|para amanhã|corre[nd]o|logo|agora/i;
const IRRITATED_PATTERNS = /isso é absurd|não aceit|ridícul|que demor|cansad|péssim|horrível/i;
const ENTHUSIASTIC_PATTERNS = /ador[eio]i|perfeito|ótim[ao]|excelent|amei|incrível|top/i;

const TONE_LABELS: Record<AudioTone, string> = {
  urgent: '⚡ Urgência',
  irritated: '😤 Irritação',
  enthusiastic: '🌟 Entusiasmo',
  neutral: '😐 Neutro',
};

/**
 * CV-102 — Tom de voz do áudio.
 * Detects urgency, irritation or enthusiasm from audio.
 * Falls back to text-based heuristics when provider tone is unavailable.
 */
export function useAudioToneDetector(options: UseAudioToneDetectorOptions = {}): AudioToneResult {
  const { durationSeconds, transcription, providerTone } = options;

  return useMemo(() => {
    if (providerTone) {
      return { tone: providerTone, confidence: 0.9, isSupported: true, label: TONE_LABELS[providerTone] };
    }

    if (!transcription) {
      return { tone: null, confidence: 0, isSupported: false, label: '' };
    }

    let tone: AudioTone = 'neutral';
    let confidence = 0.5;

    if (IRRITATED_PATTERNS.test(transcription)) {
      tone = 'irritated'; confidence = 0.75;
    } else if (URGENT_PATTERNS.test(transcription)) {
      tone = 'urgent';
      // Short audio with urgent text → higher confidence
      confidence = durationSeconds && durationSeconds < 10 ? 0.8 : 0.65;
    } else if (ENTHUSIASTIC_PATTERNS.test(transcription)) {
      tone = 'enthusiastic'; confidence = 0.70;
    }

    if (tone === 'neutral') return { tone: null, confidence: 0, isSupported: true, label: '' };
    return { tone, confidence, isSupported: true, label: TONE_LABELS[tone] };
  }, [durationSeconds, transcription, providerTone]);
}
