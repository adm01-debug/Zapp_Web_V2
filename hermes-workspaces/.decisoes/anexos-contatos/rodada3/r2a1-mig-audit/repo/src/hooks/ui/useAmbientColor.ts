import { useMemo } from 'react';

type Sentiment = 'positive' | 'neutral' | 'negative' | string | null | undefined;

interface AmbientColors {
  /** Subtle background tint for the chat area */
  bgTint: string;
  /** Accent border color */
  borderAccent: string;
  /** CSS class to apply */
  className: string;
}

/**
 * Returns ambient color tokens based on AI-detected conversation sentiment.
 * Creates a subtle environmental mood shift without impacting readability.
 */
export function useAmbientColor(sentiment: Sentiment): AmbientColors {
  return useMemo(() => {
    switch (sentiment) {
      case 'positive':
        return {
          bgTint: 'hsl(var(--success) / 0.03)',
          borderAccent: 'hsl(var(--success) / 0.15)',
          className: 'ambient-positive',
        };
      case 'negative':
        return {
          bgTint: 'hsl(var(--destructive) / 0.02)',
          borderAccent: 'hsl(var(--destructive) / 0.12)',
          className: 'ambient-negative',
        };
      case 'neutral':
      default:
        return {
          bgTint: 'transparent',
          borderAccent: 'hsl(var(--border))',
          className: 'ambient-neutral',
        };
    }
  }, [sentiment]);
}
