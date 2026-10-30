/**
 * CV-078 — Alternativa para quantidade mínima.
 *
 * Quando cliente não consegue atingir o mínimo, sugere composições ou alternativos.
 */
import { useMemo } from 'react';

export interface MinQtyResult {
  triggered: boolean;
  mixSuggestion: string;
  alternatives: string[];
}

const MIN_QTY_TRIGGERS = ['mínimo', 'minimo', 'poucas unidades', 'só preciso de', 'quantidade pequena', 'não chego no', 'menos que'];

export function useMinQtyAlternative({ clientText }: { clientText: string }): MinQtyResult {
  return useMemo(() => {
    if (!clientText) return { triggered: false, mixSuggestion: '', alternatives: [] };
    const lower = clientText.toLowerCase();
    const triggered = MIN_QTY_TRIGGERS.some((t) => lower.includes(t));
    if (!triggered) return { triggered: false, mixSuggestion: '', alternatives: [] };
    return {
      triggered: true,
      mixSuggestion: 'Posso montar um kit com modelos diferentes para atingir o mínimo de produção — você distribui variedade e paga menos por peça.',
      alternatives: [
        'Mistura de produtos diferentes (caneta + caneca = lote mínimo)',
        'Produto com estoque pronto (sem mínimo de personalização)',
        'Participação em lote coletivo com outro cliente',
      ],
    };
  }, [clientText]);
}
