/**
 * CV-074 — Âncora de preço.
 *
 * Sugere técnica de ancoragem quando cliente menciona preço alto ou compara valores.
 * Resultado local: sincrônico via keyword matching.
 * Resultado AI: async via edge `ai-price-anchor` (invocar `analyze()`).
 */
import { useMemo, useState, useCallback, useRef } from 'react';
import { invokeEdge } from '@/lib/invokeEdge';

export interface PriceAnchoringResult {
  triggered: boolean;
  anchorScript: string;
  costPerUseScript: string;
}

export interface AiPriceAnchorResult {
  anchorScript: string;
  costPerUnitScript: string;
  psychologicalFraming: string;
  counterOffer: string | null;
}

export interface UsePriceAnchoringReturn extends PriceAnchoringResult {
  aiResult: AiPriceAnchorResult | null;
  aiLoading: boolean;
  aiError: string | null;
  analyze: () => Promise<void>;
}

const PRICE_SENSITIVITY_TRIGGERS = [
  'caro', 'muito caro', 'preço alto', 'sai mais barato', 'barato', 'valor', 'custo',
  'quanto custa', 'preço por unidade', 'mais em conta',
];

export function usePriceAnchoring({
  clientText,
  messages = [],
}: {
  clientText: string;
  messages?: Array<{ content: string; sender: string }>;
}): UsePriceAnchoringReturn {
  const [aiResult, setAiResult] = useState<AiPriceAnchorResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const local = useMemo((): PriceAnchoringResult => {
    if (!clientText) return { triggered: false, anchorScript: '', costPerUseScript: '' };
    const lower = clientText.toLowerCase();
    const triggered = PRICE_SENSITIVITY_TRIGGERS.some((t) => lower.includes(t));
    if (!triggered) return { triggered: false, anchorScript: '', costPerUseScript: '' };
    return {
      triggered: true,
      anchorScript: 'Comparando com o impacto que o brinde vai gerar no evento, o investimento por pessoa fica muito pequeno. Posso mostrar o cálculo?',
      costPerUseScript: 'Em brindes, o custo por impressão (quantas vezes a pessoa usa o item) costuma ser mais relevante do que o preço unitário. Uma caneca de qualidade dura 3 anos — o custo por dia de exposição da marca é centavos.',
    };
  }, [clientText]);

  const analyze = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setAiLoading(true);
    setAiError(null);
    try {
      const { data, error } = await invokeEdge<AiPriceAnchorResult>('ai-price-anchor', {
        body: { messages, clientText },
      });
      if (error) { setAiError(error.message); return; }
      if (data) setAiResult(data);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setAiError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setAiLoading(false);
    }
  }, [messages, clientText]);

  return { ...local, aiResult, aiLoading, aiError, analyze };
}
