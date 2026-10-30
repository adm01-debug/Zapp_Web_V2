/**
 * CV-102 — Análise de tom de áudio.
 *
 * Avalia o tom emocional de mensagens de voz transcritas (raiva, frustração,
 * entusiasmo, neutro) para alertar o vendedor sobre o estado emocional do cliente.
 * Opera sobre o texto transcrito; não processa áudio bruto no front.
 */
import { useMemo } from 'react';

export type AudioToneType = 'angry' | 'frustrated' | 'enthusiastic' | 'neutral' | 'uncertain';

export interface AudioToneResult {
  tone: AudioToneType;
  confidence: number;
  signals: string[];
  suggestion: string;
}

const TONE_SIGNALS: Record<AudioToneType, string[]> = {
  angry: ['absurdo', 'inaceitável', 'péssimo', 'horrível', 'ridículo', 'uma vergonha', 'não aguento', 'que raiva', 'furioso', 'indignado', 'exijo', 'imediatamente'],
  frustrated: ['já falei', 'de novo', 'não entende', 'sempre assim', 'toda vez', 'cansei', 'paciência', 'demora muito', 'complicado demais', 'difícil'],
  enthusiastic: ['adorei', 'perfeito', 'maravilhoso', 'incrível', 'amei', 'top', 'ótimo', 'excelente', 'fantástico', 'que legal', 'vou querer', 'quero muito'],
  uncertain: ['não sei', 'talvez', 'pode ser', 'não tenho certeza', 'depende', 'vou pensar', 'preciso ver', 'não sei não', 'acho que'],
  neutral: [],
};

const TONE_SUGGESTIONS: Record<AudioToneType, string> = {
  angry: 'Tom agressivo detectado — valide a insatisfação antes de apresentar soluções.',
  frustrated: 'Cliente frustrado — reconheça a dificuldade e simplifique a proposta.',
  enthusiastic: 'Cliente entusiasmado — avance para confirmação e próximos passos.',
  uncertain: 'Cliente indeciso — ofereça comparativo claro ou uma garantia.',
  neutral: 'Tom neutro — prossiga normalmente.',
};

export function useAudioTone({ transcribedText, enabled = true }: { transcribedText: string; enabled?: boolean }): AudioToneResult | null {
  return useMemo(() => {
    if (!enabled || !transcribedText.trim()) return null;
    const lower = transcribedText.toLowerCase();
    let bestTone: AudioToneType = 'neutral';
    let bestHits = 0;
    const foundSignals: string[] = [];
    for (const [tone, keywords] of Object.entries(TONE_SIGNALS) as [AudioToneType, string[]][]) {
      if (tone === 'neutral') continue;
      const hits = keywords.filter((kw) => lower.includes(kw));
      if (hits.length > bestHits) { bestHits = hits.length; bestTone = tone; foundSignals.splice(0, foundSignals.length, ...hits); }
    }
    const confidence = bestHits === 0 ? 0.5 : Math.min(bestHits * 0.3, 1);
    return { tone: bestTone, confidence, signals: foundSignals, suggestion: TONE_SUGGESTIONS[bestTone] };
  }, [transcribedText, enabled]);
}
