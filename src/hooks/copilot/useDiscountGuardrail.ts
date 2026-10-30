/**
 * CV-075 — Guardrail de desconto.
 *
 * Impede que o vendedor ofereça desconto impulsivamente; sugere alternativas de valor.
 */
import { useMemo } from 'react';

export interface DiscountGuardrailResult {
  detected: boolean;
  valueAlternatives: string[];
  warningMessage: string;
}

const DISCOUNT_DRAFT_TRIGGERS = [
  'posso dar', 'consigo dar', 'dou um', 'faço por', 'coloco a', 'dou desconto',
  'por cento', 'desconto', 'abaixo do', 'mais barato para você',
];

const VALUE_ALTERNATIVES = [
  'Frete grátis acima de X unidades',
  'Arte personalizada grátis',
  'Prazo de pagamento estendido (30/60 dias)',
  'Amostra física grátis antes de fechar',
  'Acréscimo de unidades pelo mesmo preço',
  'Embalagem personalizada incluída',
];

export function useDiscountGuardrail({ draftText }: { draftText: string }): DiscountGuardrailResult {
  return useMemo(() => {
    if (!draftText) return { detected: false, valueAlternatives: [], warningMessage: '' };
    const lower = draftText.toLowerCase();
    const detected = DISCOUNT_DRAFT_TRIGGERS.some((t) => lower.includes(t));
    if (!detected) return { detected: false, valueAlternatives: [], warningMessage: '' };
    return {
      detected: true,
      valueAlternatives: VALUE_ALTERNATIVES,
      warningMessage: 'Antes de dar desconto, considere oferecer um benefício de valor equivalente sem cortar margem.',
    };
  }, [draftText]);
}
