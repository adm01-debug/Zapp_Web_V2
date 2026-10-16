/**
 * CV-074/075/076: Price anchoring, discount guardrail, and trade-instead-of-discount.
 */
import { useState, useCallback, useMemo, useRef } from 'react';

export interface DiscountRequest {
  requestedPercent: number;
  currentPrice: number;
  vendorLimit: number;
}

export interface PriceAnchorSuggestion {
  type: 'anchor' | 'discount_refused' | 'trade_offer';
  message: string;
  tradeOptions?: string[];
}

export interface UsePriceAnchorOptions {
  vendorDiscountLimit?: number;
  onDiscountViolation?: (req: DiscountRequest) => void;
}

const DEFAULT_TRADE_ALTERNATIVES: string[] = [
  'Aumentar a quantidade (a partir de X unidades consigo melhorar o preço)',
  'Trocar o material por uma opção similar com custo menor',
  'Reduzir para gravação 1 cor (economiza em setup e produção)',
  'Flexibilizar o prazo de entrega (produção no timing normal)',
  'Frete a combinar (cliente retira ou usa transportadora própria)',
];

export function usePriceAnchor(options: UsePriceAnchorOptions = {}): {
  suggestion: PriceAnchorSuggestion | null;
  checkDiscount: (pct: number, price: number) => PriceAnchorSuggestion;
  tradeAlternatives: string[];
} {
  const { vendorDiscountLimit = 10, onDiscountViolation } = options;
  const [suggestion, setSuggestion] = useState<PriceAnchorSuggestion | null>(null);
  const onViolationRef = useRef(onDiscountViolation);
  onViolationRef.current = onDiscountViolation;

  const tradeAlternatives = useMemo(() => DEFAULT_TRADE_ALTERNATIVES, []);

  const checkDiscount = useCallback(
    (requestedPercent: number, currentPrice: number): PriceAnchorSuggestion => {
      const request: DiscountRequest = {
        requestedPercent,
        currentPrice,
        vendorLimit: vendorDiscountLimit,
      };

      let result: PriceAnchorSuggestion;

      if (requestedPercent <= vendorDiscountLimit) {
        result = {
          type: 'anchor',
          message: `Consigo aplicar ${requestedPercent}% de desconto. Antes de confirmar, vale reforçar o valor: nossa gravação é inclusa, o prazo é garantido e o frete está calculado. O preço final de R$ ${(currentPrice * (1 - requestedPercent / 100)).toFixed(2)} já reflete tudo isso.`,
        };
      } else if (requestedPercent <= vendorDiscountLimit + 10) {
        result = {
          type: 'trade_offer',
          message: `Um desconto de ${requestedPercent}% está acima do que posso autorizar agora. Posso oferecer ${vendorDiscountLimit}% diretamente, mas há outras formas de chegar a um valor melhor para você:`,
          tradeOptions: DEFAULT_TRADE_ALTERNATIVES,
        };
        if (onViolationRef.current) {
          onViolationRef.current(request);
        }
      } else {
        result = {
          type: 'discount_refused',
          message: `Um desconto de ${requestedPercent}% está além do que posso autorizar. Vou verificar com meu gestor, mas posso adiantar que alternativas como ajuste de quantidade ou prazo costumam resolver. Posso te ligar em breve com a resposta?`,
          tradeOptions: DEFAULT_TRADE_ALTERNATIVES,
        };
        if (onViolationRef.current) {
          onViolationRef.current(request);
        }
      }

      setSuggestion(result);
      return result;
    },
    [vendorDiscountLimit],
  );

  return { suggestion, checkDiscount, tradeAlternatives };
}
