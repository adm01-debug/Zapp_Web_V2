/**
 * CV-088 — Sugestão de upsell/cross-sell contextual.
 */
import { useMemo } from 'react';

export interface UpsellSuggestion {
  type: 'upsell' | 'crosssell';
  productSuggestion: string;
  reason: string;
  script: string;
}

const PRODUCT_UPSELLS: Record<string, UpsellSuggestion[]> = {
  caneta: [
    { type: 'upsell', productSuggestion: 'Caneta Premium com gravação laser', reason: 'Mais durável, percepção de valor maior', script: 'Para esse perfil de evento, a versão premium com gravação a laser passa uma imagem muito mais profissional. A diferença de preço por peça é pequena.' },
    { type: 'crosssell', productSuggestion: 'Caderno personalizado + caneta', reason: 'Kit escritório muito solicitado', script: 'Caderno + caneta combinados são o kit mais pedido para eventos corporativos — e o custo por kit ainda sai melhor.' },
  ],
  caneca: [
    { type: 'upsell', productSuggestion: 'Caneca térmica com gravação', reason: 'Uso diário, exposição constante da marca', script: 'A caneca térmica é usada todo dia, não só em casa. A exposição da marca é muito maior.' },
    { type: 'crosssell', productSuggestion: 'Kit café: caneca + sachê de café personalizado', reason: 'Kit presente diferenciado', script: 'Montar um kit com sachê de café personalizado deixa o brinde muito mais memorável.' },
  ],
  camiseta: [
    { type: 'upsell', productSuggestion: 'Camiseta dry-fit ou premium', reason: 'Qualidade percebida muito superior', script: 'Uma camiseta dry-fit ou de algodão pima é usada com muito mais frequência — o brinde trabalha por você por mais tempo.' },
  ],
  squeeze: [
    { type: 'upsell', productSuggestion: 'Squeeze inox com termostato', reason: 'Mantém temperatura, uso diário', script: 'O squeeze inox com termostato é usado nos treinos todo dia. Exposição da marca constante.' },
  ],
};

export function useUpsellSuggestion({ productMentioned }: { productMentioned: string | null }): UpsellSuggestion[] {
  return useMemo(() => {
    if (!productMentioned) return [];
    const lower = productMentioned.toLowerCase();
    for (const [key, suggestions] of Object.entries(PRODUCT_UPSELLS)) {
      if (lower.includes(key)) return suggestions;
    }
    return [];
  }, [productMentioned]);
}
