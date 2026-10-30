/**
 * CV-074 — Âncora de preço.
 *
 * Sugere técnica de ancoragem quando cliente menciona preço alto ou compara valores.
 */
import { useMemo } from 'react';

export interface PriceAnchoringResult {
  triggered: boolean;
  anchorScript: string;
  costPerUseScript: string;
}

const PRICE_SENSITIVITY_TRIGGERS = [
  'caro', 'muito caro', 'preço alto', 'sai mais barato', 'barato', 'valor', 'custo',
  'quanto custa', 'preço por unidade', 'mais em conta',
];

export function usePriceAnchoring({ clientText }: { clientText: string }): PriceAnchoringResult {
  return useMemo(() => {
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
}
