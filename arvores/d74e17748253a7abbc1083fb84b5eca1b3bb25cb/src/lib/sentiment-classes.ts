import { normalizeSentiment, type Sentiment } from '@/lib/ai-vocabulary';

/**
 * Classe de 3 vias que os widgets do Dashboard exibem (Positivo/Neutro/Negativo).
 *
 * Este módulo NÃO é um segundo vocabulário: ele não declara alias nem traduz
 * legado. Ele apenas CONSOME o vocabulário canônico (`src/lib/ai-vocabulary.ts`,
 * reexport do módulo do edge) e agrupa o valor canônico na classe de exibição.
 * O legado EN (positive/negative/neutral/critical) chega traduzido pelo próprio
 * normalizador canônico.
 *
 * Regras (IA-SENTIMENT-001):
 *   - `critico` pertence à classe negativa — é o extremo da escala, não neutro;
 *   - desconhecido/ausente (`null`) NÃO é classe: o consumidor decide, e nenhum
 *     widget pode contá-lo como 'neutro' por um `else` de conveniência.
 */
export type SentimentClass = Extract<Sentiment, 'positivo' | 'neutro' | 'negativo'>;

/** Classe de exibição do sentimento cru, ou `null` quando não é reconhecido. */
export function classifySentiment(raw: unknown): SentimentClass | null {
  const { value } = normalizeSentiment(raw);
  if (value === null) return null;
  if (value === 'critico') return 'negativo';
  return value;
}
