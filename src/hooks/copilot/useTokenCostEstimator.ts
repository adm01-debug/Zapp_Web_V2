import { useState, useCallback } from 'react';

export interface UseTokenCostEstimatorOptions {
  pricePerMillionInputTokens?: number;
  pricePerMillionOutputTokens?: number;
}

export interface TokenUsage {
  conversationId: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  timestamp: string;
}

export interface CostSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  avgCostPerConversationUsd: number;
  conversationCount: number;
}

export interface TokenCostEstimatorResult {
  usages: TokenUsage[];
  summary: CostSummary;
  isLoading: boolean;
  error: string | null;
  recordUsage: (conversationId: string, inputTokens: number, outputTokens: number) => void;
  clearHistory: () => void;
}

const DEFAULT_INPUT_PRICE = 3.0;   // USD per 1M tokens
const DEFAULT_OUTPUT_PRICE = 15.0; // USD per 1M tokens

/**
 * CV-141 — Estimativa de custo de tokens por conversa.
 * Tracks token usage per conversation and computes running cost estimates.
 */
export function useTokenCostEstimator({
  pricePerMillionInputTokens = DEFAULT_INPUT_PRICE,
  pricePerMillionOutputTokens = DEFAULT_OUTPUT_PRICE,
}: UseTokenCostEstimatorOptions = {}): TokenCostEstimatorResult {
  const [usages, setUsages] = useState<TokenUsage[]>([]);
  const [isLoading] = useState(false);
  const [error] = useState<string | null>(null);

  const recordUsage = useCallback(
    (conversationId: string, inputTokens: number, outputTokens: number) => {
      const inputCost = (inputTokens / 1_000_000) * pricePerMillionInputTokens;
      const outputCost = (outputTokens / 1_000_000) * pricePerMillionOutputTokens;
      const estimatedCostUsd = inputCost + outputCost;

      setUsages(prev => [
        ...prev,
        { conversationId, inputTokens, outputTokens, estimatedCostUsd, timestamp: new Date().toISOString() },
      ]);
    },
    [pricePerMillionInputTokens, pricePerMillionOutputTokens],
  );

  const clearHistory = useCallback(() => setUsages([]), []);

  const summary: CostSummary = {
    totalInputTokens: usages.reduce((s, u) => s + u.inputTokens, 0),
    totalOutputTokens: usages.reduce((s, u) => s + u.outputTokens, 0),
    totalCostUsd: usages.reduce((s, u) => s + u.estimatedCostUsd, 0),
    avgCostPerConversationUsd:
      usages.length > 0
        ? usages.reduce((s, u) => s + u.estimatedCostUsd, 0) / usages.length
        : 0,
    conversationCount: usages.length,
  };

  return { usages, summary, isLoading, error, recordUsage, clearHistory };
}
