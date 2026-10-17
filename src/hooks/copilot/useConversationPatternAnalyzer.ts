import { useState, useCallback } from 'react';

export interface ConversationPattern {
  patternId: string;
  name: string;
  description: string;
  occurrences: number;
  avgOutcome: 'order' | 'next-step' | 'lost';
  successRate: number;
  triggerStage: string;
  exampleQuotes: string[];
}

export interface UseConversationPatternAnalyzerOptions {
  vendorId: string;
  teamId?: string;
  lookbackDays?: number;
}

export interface ConversationPatternAnalyzerState {
  patterns: ConversationPattern[];
  isFetching: boolean;
  error: string | null;
  analyzePatterns: () => Promise<void>;
}

/**
 * CV-131 — Detector de padrões de sucesso/falha em conversas históricas.
 * GET /api/radar-pattern-analysis?vendor_id=...&lookback_days=...
 */
export function useConversationPatternAnalyzer({
  vendorId,
  teamId,
  lookbackDays = 30,
}: UseConversationPatternAnalyzerOptions): ConversationPatternAnalyzerState {
  const [patterns, setPatterns] = useState<ConversationPattern[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyzePatterns = useCallback(async () => {
    setIsFetching(true);
    setError(null);
    try {
      const params = new URLSearchParams({ vendor_id: vendorId, lookback_days: String(lookbackDays) });
      if (teamId) params.set('team_id', teamId);
      const res = await fetch(`/api/radar-pattern-analysis?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ConversationPattern[] = await res.json();
      setPatterns(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao analisar padrões');
    } finally {
      setIsFetching(false);
    }
  }, [vendorId, teamId, lookbackDays]);

  return { patterns, isFetching, error, analyzePatterns };
}
