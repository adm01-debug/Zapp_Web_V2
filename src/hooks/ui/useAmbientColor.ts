import { useMemo } from 'react';
import { sentimentLevel } from '@/lib/sentiment-level';

interface AmbientColors {
  /** Subtle background tint for the chat area */
  bgTint: string;
  /** Accent border color */
  borderAccent: string;
  /** CSS class to apply */
  className: string;
}

const POSITIVE: AmbientColors = {
  bgTint: 'hsl(var(--success) / 0.03)',
  borderAccent: 'hsl(var(--success) / 0.15)',
  className: 'ambient-positive',
};

const NEGATIVE: AmbientColors = {
  bgTint: 'hsl(var(--destructive) / 0.02)',
  borderAccent: 'hsl(var(--destructive) / 0.12)',
  className: 'ambient-negative',
};

const NEUTRAL: AmbientColors = {
  bgTint: 'transparent',
  borderAccent: 'hsl(var(--border))',
  className: 'ambient-neutral',
};

/**
 * Returns ambient color tokens based on AI-detected conversation sentiment.
 * Creates a subtle environmental mood shift without impacting readability.
 *
 * Lê o valor CRU do banco (canônico pt-BR `positivo|neutro|negativo|critico`
 * ou o legado EN ainda gravado por `ai-auto-tag`/`chatbot-l1`) através do
 * mapeador único
 * `sentimentLevel`: antes da correção só `positive`/`negative` acendiam e o
 * valor canônico do banco caía sempre no neutro (tinta morta). Desconhecido ou
 * ausente continua neutro — nenhum valor inventado vira cor.
 */
export function useAmbientColor(sentiment: unknown): AmbientColors {
  return useMemo(() => {
    switch (sentimentLevel(sentiment)) {
      case 'positive':
        return POSITIVE;
      case 'negative':
      case 'critical':
        return NEGATIVE;
      default:
        // 'neutral', desconhecido e ausente: sem tingimento.
        return NEUTRAL;
    }
  }, [sentiment]);
}
