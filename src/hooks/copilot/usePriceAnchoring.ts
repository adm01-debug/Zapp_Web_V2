/**
 * CV-074 — Âncora de preço.
 *
 * Sugere técnica de ancoragem quando cliente menciona preço alto ou compara valores.
 * Local: `useMemo` sobre triggers. AI: `analyze()` chama `ai-price-anchor`.
 */
import { useMemo, useState, useCallback } from 'react';
import { invokeEdge } from '@/lib/invokeEdge';

export interface PriceAnchoringResult {
  triggered: boolean;
  anchorScript: string;
  costPerUseScript: string;
}

export interface AiPriceAnchoringResult extends PriceAnchoringResult {
  strategy?: string;
  reframing?: string;
  confidence?: number;
}

const PRICE_SENSITIVITY_TRIGGERS = [
  'caro', 'muito caro', 'preço alto', 'sai mais barato', 'barato', 'valor', 'custo',
  'quanto custa', 'preço por unidade', 'mais em conta',
];

export function usePriceAnchoring({
  clientText,
  messages,
}: {
  clientText: string;
  messages?: Array<{ content: string; sender: string; created_at?: string }>;
}): PriceAnchoringResult & {
  aiResult: AiPriceAnchoringResult | null;
  aiLoading: boolean;
  aiError: string | null;
  analyze: () => Promise<void>;
} {
  const [aiResult, setAiResult] = useState<AiPriceAnchoringResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

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
    if (!messages?.length && !clientText) return;
    setAiLoading(true);
    setAiError(null);
    const { data, error } = await invokeEdge<AiPriceAnchoringResult>('ai-price-anchor', {
      body: {
        messages: messages ?? [{ content: clientText, sender: 'contact', created_at: new Date().toISOString() }],
      },
    });
    if (error || !data) {
      setAiError(error?.message ?? 'Erro ao analisar âncora de preço');
    } else {
      setAiResult(data);
    }
    setAiLoading(false);
  }, [clientText, messages]);

  const active = aiResult ?? local;
  return { ...active, aiResult, aiLoading, aiError, analyze };
}
