/**
 * CV-078 — Alternativa de quantidade mínima.
 *
 * Quando o cliente precisa de menos que o mínimo de produção,
 * sugere produtos com mínimo menor ou kits reduzidos.
 * Une as duas implementações paralelas do CV-078 (antigo useMinQtyAlternative):
 * gatilhos das duas e as alternativas de composição (mix, estoque pronto, lote coletivo).
 */
import { useMemo } from 'react';

export interface QuantityAlternative {
  suggestedQty: number;
  alternativeProduct?: string;
  draftLine: string;
  /** Caminhos para chegar ao mínimo sem perder o pedido. */
  alternatives: string[];
}

const LOW_QTY_KEYWORDS = [
  'quantidade mínima', 'mínimo', 'minimo', 'muito mínimo', 'pedido pequeno',
  'não preciso tanto', 'pouco', 'menos que', 'só uns', 'só umas', 'pequeno pedido',
  'poucas unidades', 'só preciso de', 'quantidade pequena', 'não chego no',
];

const ALTERNATIVAS = [
  'Mistura de produtos diferentes (caneta + caneca = lote mínimo)',
  'Produto com estoque pronto (sem mínimo de personalização)',
  'Participação em lote coletivo com outro cliente',
];

const QTY_REGEX = /(\d+)\s*(?:unidades?|peças?|un\.?|pç\.?)/i;

export interface UseMinQuantityAlternativeOptions {
  lastClientMessage: string;
  productMinQty?: number;
}

export function useMinQuantityAlternative({
  lastClientMessage,
  productMinQty = 50,
}: UseMinQuantityAlternativeOptions): QuantityAlternative | null {
  return useMemo(() => {
    if (!lastClientMessage) return null;
    const text = lastClientMessage.toLowerCase();

    const hasKeyword = LOW_QTY_KEYWORDS.some((kw) => text.includes(kw));
    const qtyMatch = QTY_REGEX.exec(lastClientMessage);
    const requestedQty = qtyMatch ? parseInt(qtyMatch[1], 10) : null;

    const isBelowMin = (requestedQty !== null && requestedQty < productMinQty) || hasKeyword;
    if (!isBelowMin) return null;

    if (requestedQty !== null && requestedQty < 30) {
      return {
        suggestedQty: 30,
        alternativeProduct: 'Caneta ou chaveiro (mínimo 30 un)',
        draftLine: `Para ${requestedQty} peças, posso sugerir produtos com mínimo de 30 unidades — como canetas personalizadas ou chaveiros. Quer ver as opções?`,
        alternatives: ALTERNATIVAS,
      };
    }

    return {
      suggestedQty: productMinQty,
      draftLine: `O mínimo de produção para esse produto é ${productMinQty} peças. Posso montar um kit com modelos diferentes para atingir o mínimo — você distribui variedade e paga menos por peça. Qual seria o número ideal para você?`,
      alternatives: ALTERNATIVAS,
    };
  }, [lastClientMessage, productMinQty]);
}
