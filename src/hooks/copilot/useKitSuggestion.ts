/**
 * CV-088 — Sugestão de kits temáticos.
 */
import { useMemo } from 'react';

export interface KitSuggestion {
  kitName: string;
  items: string[];
  theme: string;
  script: string;
  estimatedMultiplier: number;
}

const PRODUCT_KITS: Array<{ triggers: string[]; kit: KitSuggestion }> = [
  { triggers: ['caneta', 'bloco', 'caderno'], kit: { kitName: 'Kit Escritório', items: ['Caneta metálica', 'Bloco de anotações', 'Porta-cartão'], theme: 'Produtividade / Corporativo', script: 'Posso montar um Kit Escritório com caneta + bloco + porta-cartão — perfeito para eventos corporativos e treinamentos. Interesse?', estimatedMultiplier: 2.5 } },
  { triggers: ['squeeze', 'garrafa', 'copo'], kit: { kitName: 'Kit Fitness', items: ['Squeeze', 'Toalha personalizada', 'Porta-suplemento'], theme: 'Bem-estar / Academia', script: 'Para ação de bem-estar, um Kit Fitness (squeeze + toalha + porta-suplemento) é muito mais impactante que o squeeze sozinho. Posso cotar?', estimatedMultiplier: 2.8 } },
  { triggers: ['ecobag', 'sacola', 'bag'], kit: { kitName: 'Kit Sustentabilidade', items: ['Ecobag', 'Copo reutilizável', 'Canudo de bambu'], theme: 'ESG / Sustentabilidade', script: 'Para uma ação de ESG, um Kit Sustentabilidade (ecobag + copo reutilizável + canudo de bambu) transmite o conceito completo. Interesse em cotar?', estimatedMultiplier: 2.2 } },
  { triggers: ['camiseta', 'camisa', 'uniforme'], kit: { kitName: 'Kit Uniforme', items: ['Camiseta', 'Boné', 'Mochila'], theme: 'Uniformização / Eventos', script: 'Para uniformização completa, posso incluir boné e mochila no pedido — kit muito mais impactante. Quer que eu calcule?', estimatedMultiplier: 3.0 } },
];

export function useKitSuggestion({ messages }: { messages: Array<{ content: string; sender: string }> }): KitSuggestion | null {
  return useMemo(() => {
    const allText = messages.map((m) => m.content).join(' ').toLowerCase();
    for (const { triggers, kit } of PRODUCT_KITS) {
      if (triggers.some((t) => allText.includes(t))) return kit;
    }
    return null;
  }, [messages]);
}
