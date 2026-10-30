/**
 * CV-078 — Alerta de quantidade mínima.
 *
 * Quando o cliente pede uma quantidade abaixo do mínimo do produto,
 * sugere alternativas: kits menores, produtos sem mínimo, ou
 * justifica o mínimo em termos de custo-benefício.
 */
import { useMemo } from 'react';

export interface MinQuantityAlert {
  triggered: boolean;
  requestedQty: number | null;
  minimumQty: number;
  alternatives: string[];
  justification: string;
  script: string;
}

const LOW_QTY_TRIGGERS = [
  /só\s+(?:preciso\s+de\s+)?(\d+)\s+(?:peças?|unidades?)/i,
  /(\d+)\s+(?:peças?|unidades?)\s+(?:só|apenas|somente)/i,
  /mínimo\s+(?:de\s+)?(\d+)/i,
  /quantidade\s+pequena/i,
  /poucos\s+(?:peças?|unidades?)/i,
  /poucas?\s+(?:peças?|unidades?)/i,
];

function extractQty(text: string): number | null {
  for (const pattern of LOW_QTY_TRIGGERS) {
    const m = text.match(pattern);
    if (m?.[1]) return parseInt(m[1], 10);
  }
  return null;
}

export interface UseMinQuantityAlertOptions {
  clientMessage: string;
  productMinQty?: number;
}

export function useMinQuantityAlert({
  clientMessage,
  productMinQty = 50,
}: UseMinQuantityAlertOptions): MinQuantityAlert {
  return useMemo(() => {
    const requestedQty = extractQty(clientMessage);
    const hasLowQtyLanguage = LOW_QTY_TRIGGERS.some((p) => p.test(clientMessage));

    if (!hasLowQtyLanguage && (requestedQty === null || requestedQty >= productMinQty)) {
      return { triggered: false, requestedQty: null, minimumQty: productMinQty, alternatives: [], justification: '', script: '' };
    }

    const triggered = requestedQty !== null ? requestedQty < productMinQty : hasLowQtyLanguage;
    if (!triggered) {
      return { triggered: false, requestedQty, minimumQty: productMinQty, alternatives: [], justification: '', script: '' };
    }

    return {
      triggered: true,
      requestedQty,
      minimumQty: productMinQty,
      alternatives: [
        `Kit sortido com ${productMinQty} peças em modelos variados.`,
        'Produtos sem pedido mínimo: canetas, blocos, bottons.',
        `Dividir o pedido em duas entregas menores no valor total de ${productMinQty} peças.`,
      ],
      justification: `O mínimo de ${productMinQty} peças garante custo unitário competitivo e qualidade de gravação.`,
      script: requestedQty
        ? `Para ${requestedQty} peças tenho algumas opções — posso te mostrar um kit misto ou um produto que não tem pedido mínimo?`
        : 'Para quantidades menores tenho alternativas que encaixam no seu budget. Posso te mostrar?',
    };
  }, [clientMessage, productMinQty]);
}
