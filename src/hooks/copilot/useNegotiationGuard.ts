/**
 * CV-116 — Guarda de negociação.
 *
 * Detecta quando o vendedor está cedendo demais em uma negociação:
 * múltiplas concessões consecutivas, sem reciprocidade do cliente.
 * Sugere pausa e reancoragem de valor.
 */
import { useMemo } from 'react';

export interface NegotiationGuardResult {
  alert: boolean;
  concessionCount: number;
  /** Padrão detectado. */
  pattern: 'one_sided' | 'reciprocal' | 'none';
  suggestion: string;
  script: string;
}

const SELLER_CONCESSION_PATTERNS = [
  /posso\s+(?:dar|incluir|adicionar|fazer)/i,
  /desconto\s+de/i,
  /incluo\s+o\s+frete/i,
  /aumento\s+o\s+prazo/i,
  /acrescento/i,
];

const CLIENT_RECIPROCITY_PATTERNS = [
  /fechar?\b/i,
  /confirmar?\b/i,
  /aceito\b/i,
  /ok\b/i,
  /combinado\b/i,
  /aumentar?\s+a\s+quantidade/i,
];

export interface UseNegotiationGuardOptions {
  sellerMessages: Array<{ content: string }>;
  clientMessages: Array<{ content: string }>;
}

export function useNegotiationGuard({
  sellerMessages,
  clientMessages,
}: UseNegotiationGuardOptions): NegotiationGuardResult {
  return useMemo(() => {
    const recentSeller = sellerMessages.slice(-5);
    const recentClient = clientMessages.slice(-5);

    const concessionCount = recentSeller.filter((m) =>
      SELLER_CONCESSION_PATTERNS.some((p) => p.test(m.content)),
    ).length;

    const clientReciprocated = recentClient.some((m) =>
      CLIENT_RECIPROCITY_PATTERNS.some((p) => p.test(m.content)),
    );

    if (concessionCount < 2) {
      return { alert: false, concessionCount, pattern: 'none', suggestion: '', script: '' };
    }

    const pattern = clientReciprocated ? 'reciprocal' : 'one_sided';

    if (pattern === 'reciprocal') {
      return { alert: false, concessionCount, pattern, suggestion: 'Negociação equilibrada — continue.', script: '' };
    }

    return {
      alert: true,
      concessionCount,
      pattern: 'one_sided',
      suggestion: `${concessionCount} concessões sem reciprocidade. Pare de ceder e reancore no valor.`,
      script: 'Fiz algumas adaptações para facilitar. Para avançar, preciso entender: o que te impede de confirmar agora?',
    };
  }, [sellerMessages, clientMessages]);
}
