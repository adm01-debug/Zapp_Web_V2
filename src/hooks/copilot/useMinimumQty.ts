/**
 * CV-078: Minimum quantity handler — detects when requested qty is below minimum.
 */
import { useMemo } from 'react';

export interface QtyAlternative {
  productId: string;
  name: string;
  minimumQty: number;
  priceRange: string;
}

export interface UseMinimumQtyOptions {
  requestedQty: number;
  productMinimumQty: number;
  alternatives?: QtyAlternative[];
}

export function useMinimumQty(options: UseMinimumQtyOptions): {
  belowMinimum: boolean;
  shortfall: number;
  alternatives: QtyAlternative[];
  suggestionMessage: string;
} {
  const { requestedQty, productMinimumQty, alternatives = [] } = options;

  const belowMinimum = requestedQty < productMinimumQty;
  const shortfall = belowMinimum ? productMinimumQty - requestedQty : 0;

  const filteredAlternatives = useMemo(
    () => alternatives.filter(alt => alt.minimumQty <= requestedQty),
    [alternatives, requestedQty],
  );

  const suggestionMessage = useMemo(() => {
    if (!belowMinimum) return '';

    if (filteredAlternatives.length > 0) {
      const names = filteredAlternatives.map(a => a.name).join(', ');
      return `Esse produto tem pedido mínimo de ${productMinimumQty} unidades. Para ${requestedQty} unidades, posso sugerir: ${names}. Ou podemos aumentar o pedido em ${shortfall} unidades para atender o mínimo atual.`;
    }

    return `Esse produto tem pedido mínimo de ${productMinimumQty} unidades. Você precisaria de mais ${shortfall} unidades para fechar o pedido. Posso verificar se há alternativas com pedido mínimo menor para a sua quantidade.`;
  }, [belowMinimum, productMinimumQty, requestedQty, shortfall, filteredAlternatives]);

  return {
    belowMinimum,
    shortfall,
    alternatives: filteredAlternatives,
    suggestionMessage,
  };
}
