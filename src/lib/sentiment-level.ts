import { normalizeSentiment, type Sentiment } from '@/lib/ai-vocabulary';

/**
 * Nível de sentimento que a INTERFACE exibe (tingimento do chat, selo, emoji).
 *
 * Este módulo não é um segundo vocabulário: o vocabulário canônico do banco é
 * pt-BR (`positivo|neutro|negativo|critico`, ver `src/lib/ai-vocabulary.ts`) e
 * aqui só traduzimos esse valor para o nível EN que os componentes já usavam.
 * A leitura do valor cru passa SEMPRE por `normalizeSentiment`, de modo que o
 * legado EN ainda gravado por `ai-auto-tag`/`chatbot-l1` (`positive`,
 * `critical`) cai no mesmo nível do canônico — quem consome não precisa saber a
 * origem do token.
 *
 * Regras:
 *   - `critico`/`critical` é o extremo da escala: vira `critical`, nunca neutro;
 *   - desconhecido/ausente/inválido devolve `null` — o consumidor decide, e
 *     nenhum componente pode indexar config com um valor inventado.
 */
export const SENTIMENT_LEVELS = ['positive', 'neutral', 'negative', 'critical'] as const;
export type SentimentLevel = (typeof SENTIMENT_LEVELS)[number];

const CANONICAL_TO_LEVEL: Readonly<Record<Sentiment, SentimentLevel>> = {
  positivo: 'positive',
  neutro: 'neutral',
  negativo: 'negative',
  critico: 'critical',
};

/** Traduz o valor CRU do banco (pt-BR canônico ou legado EN) no nível da interface; desconhecido → `null`. */
export function sentimentLevel(raw: unknown): SentimentLevel | null {
  const { value } = normalizeSentiment(raw);
  return value === null ? null : CANONICAL_TO_LEVEL[value];
}
