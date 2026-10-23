import { useState, useCallback } from 'react';

export interface CompetitorItem {
  description: string;
  unitPrice: number | null;
  quantity: number | null;
  total: number | null;
}

export interface UseCompetitorQuoteOptions {
  /** Unit: BRL */
  ourBestPrice?: number;
}

export interface CompetitorQuoteState {
  items: CompetitorItem[];
  competitorTotal: number | null;
  ourAdvantage: string | null;
  isAnalyzing: boolean;
  error: string | null;
}

/**
 * CV-107 — DELEGADA a IA-154, IA-138.
 * Client sends a screenshot of a competitor's quote →
 * RADAR extracts items and prices and builds a comparison for the vendor (INTERNAL ONLY).
 */
export function useCompetitorQuoteAnalysis(options: UseCompetitorQuoteOptions = {}) {
  const { ourBestPrice } = options;
  const [state, setState] = useState<CompetitorQuoteState>({
    items: [],
    competitorTotal: null,
    ourAdvantage: null,
    isAnalyzing: false,
    error: null,
  });

  const analyze = useCallback(async (imageUrl: string) => {
    setState(s => ({ ...s, isAnalyzing: true, error: null }));
    try {
      const resp = await fetch('/api/ai-competitor-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: imageUrl }),
      });
      if (!resp.ok) throw new Error(`competitor analysis error ${resp.status}`);
      const data = await resp.json();
      const items: CompetitorItem[] = data.items ?? [];
      const competitorTotal: number | null = data.total ?? null;

      let ourAdvantage: string | null = null;
      if (ourBestPrice !== undefined && competitorTotal !== null) {
        const diff = competitorTotal - ourBestPrice;
        const pct = Math.round(Math.abs(diff) / competitorTotal * 100);
        ourAdvantage = diff > 0
          ? `Nossa proposta é ${pct}% mais barata (R$ ${diff.toFixed(2)} de diferença) — uso interno`
          : `Concorrente ${pct}% mais barato — revisar se há margem — uso interno`;
      }

      setState({ items, competitorTotal, ourAdvantage, isAnalyzing: false, error: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro na análise do concorrente';
      setState({ items: [], competitorTotal: null, ourAdvantage: null, isAnalyzing: false, error: msg });
    }
  }, [ourBestPrice]);

  const reset = useCallback(() => {
    setState({ items: [], competitorTotal: null, ourAdvantage: null, isAnalyzing: false, error: null });
  }, []);

  return { ...state, analyze, reset };
}
