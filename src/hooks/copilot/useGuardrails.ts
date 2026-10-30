/**
 * CV-111 — Guardrails de qualidade da resposta.
 *
 * Verifica se a mensagem viola regras de negócio antes de ser enviada.
 */
import { useMemo } from 'react';

export interface GuardrailViolation {
  rule: string;
  severity: 'warning' | 'block';
  message: string;
}

const GUARDRAIL_RULES: Array<{ pattern: string; rule: string; severity: 'warning' | 'block'; message: string }> = [
  { pattern: 'entrego amanhã', rule: 'prazo_irreal', severity: 'warning', message: 'Prazo de 1 dia provavelmente não é possível para produto personalizado.' },
  { pattern: '100% garantido', rule: 'garantia_absoluta', severity: 'warning', message: 'Evite garantias absolutas sem embasamento.' },
  { pattern: 'mais barato do mercado', rule: 'preco_nao_verificado', severity: 'warning', message: 'Não afirme ser o mais barato sem verificar.' },
  { pattern: 'grátis', rule: 'falso_gratis', severity: 'warning', message: 'Confirme que o item realmente é grátis antes de prometer.' },
];

export function useGuardrails({ draftText }: { draftText: string }): GuardrailViolation[] {
  return useMemo(() => {
    if (!draftText) return [];
    const lower = draftText.toLowerCase();
    return GUARDRAIL_RULES
      .filter((r) => lower.includes(r.pattern))
      .map(({ rule, severity, message }) => ({ rule, severity, message }));
  }, [draftText]);
}
