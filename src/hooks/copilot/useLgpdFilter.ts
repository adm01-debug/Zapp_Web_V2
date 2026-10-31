/**
 * CV-112 — Filtro LGPD.
 *
 * Detecta dados sensíveis na conversa que não devem ser reencaminhados sem consentimento.
 */
import { useMemo } from 'react';

export interface LgpdAlert {
  dataType: string;
  recommendation: string;
}

const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; dataType: string; recommendation: string }> = [
  { pattern: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/, dataType: 'CPF', recommendation: 'Não armazene CPF no chat. Use campo dedicado na ficha do cliente.' },
  { pattern: /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/, dataType: 'CNPJ', recommendation: 'CNPJ pode ser guardado na ficha — mova para o cadastro.' },
  { pattern: /\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}/, dataType: 'Cartão de crédito', recommendation: 'Nunca processe dados de cartão pelo chat.' },
  { pattern: /senha|password/i, dataType: 'Senha', recommendation: 'Nunca peça senhas pelo chat.' },
];

export function useLgpdFilter({ text }: { text: string }): LgpdAlert[] {
  return useMemo(() => {
    if (!text) return [];
    return SENSITIVE_PATTERNS
      .filter((p) => p.pattern.test(text))
      .map(({ dataType, recommendation }) => ({ dataType, recommendation }));
  }, [text]);
}
