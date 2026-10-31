/**
 * CV-087/088 — Sugestão de upsell/cross-sell contextual.
 *
 * Une as duas implementações paralelas (antigo useUpsell, CV-087): produtos e
 * sugestões das duas, com o incremento estimado no ticket quando conhecido.
 */
import { useMemo } from 'react';

export interface UpsellSuggestion {
  type: 'upsell' | 'crosssell';
  productSuggestion: string;
  reason: string;
  script: string;
  /** Incremento estimado no ticket (%), quando medido. */
  ticketIncreasePct?: number;
}

const PRODUCT_UPSELLS: Record<string, UpsellSuggestion[]> = {
  caneta: [
    { type: 'upsell', productSuggestion: 'Caneta Premium com gravação laser', reason: 'Mais durável, percepção de valor maior', script: 'Para esse perfil de evento, a versão premium com gravação a laser passa uma imagem muito mais profissional. A diferença de preço por peça é pequena.' },
    { type: 'upsell', productSuggestion: 'Caneta metálica', reason: 'Acabamento premium para o mesmo propósito', script: 'Esse pedido de canetas ficaria ainda mais especial em versão metálica — custo só 30% maior, mas impacto muito maior. Posso mostrar?', ticketIncreasePct: 30 },
    { type: 'crosssell', productSuggestion: 'Caderno personalizado + caneta', reason: 'Kit escritório muito solicitado', script: 'Caderno + caneta combinados são o kit mais pedido para eventos corporativos — e o custo por kit ainda sai melhor.' },
  ],
  caneca: [
    { type: 'upsell', productSuggestion: 'Caneca térmica com gravação', reason: 'Uso diário, exposição constante da marca', script: 'A caneca térmica é usada todo dia, não só em casa. A exposição da marca é muito maior.' },
    { type: 'crosssell', productSuggestion: 'Kit café: caneca + sachê de café personalizado', reason: 'Kit presente diferenciado', script: 'Montar um kit com sachê de café personalizado deixa o brinde muito mais memorável.' },
  ],
  camiseta: [
    { type: 'upsell', productSuggestion: 'Camiseta dry-fit ou premium', reason: 'Qualidade percebida muito superior', script: 'Uma camiseta dry-fit ou de algodão pima é usada com muito mais frequência — o brinde trabalha por você por mais tempo.' },
    { type: 'crosssell', productSuggestion: 'Boné bordado', reason: 'Complementa o uniforme e aumenta a exposição de marca', script: 'Para completar o kit de uniforme, posso incluir bonés bordados no mesmo estilo. Interesse?', ticketIncreasePct: 40 },
  ],
  ecobag: [
    { type: 'crosssell', productSuggestion: 'Kit ecobag + squeeze', reason: 'Kit sustentabilidade com maior percepção de valor', script: 'Montamos um kit ecobag + squeeze personalizado — o par tem apelo de sustentabilidade e faz muito mais sucesso que a ecobag sozinha. Posso cotar?', ticketIncreasePct: 50 },
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
