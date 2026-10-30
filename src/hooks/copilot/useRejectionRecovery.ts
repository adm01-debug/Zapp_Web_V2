/**
 * CV-080 — Recuperação pós-rejeição.
 *
 * Após perder uma venda, sugere script para manter o relacionamento.
 */
import { useMemo } from 'react';

export interface RejectionRecoveryResult {
  triggered: boolean;
  recoveryScript: string;
  followUpAction: string;
}

const REJECTION_TRIGGERS = ['fechei com outro', 'já comprei', 'vou passar dessa vez', 'não preciso mais', 'cancelar', 'desisti', 'não vai rolar'];

export function useRejectionRecovery({ clientText }: { clientText: string }): RejectionRecoveryResult {
  return useMemo(() => {
    if (!clientText) return { triggered: false, recoveryScript: '', followUpAction: '' };
    const lower = clientText.toLowerCase();
    const triggered = REJECTION_TRIGGERS.some((t) => lower.includes(t));
    if (!triggered) return { triggered: false, recoveryScript: '', followUpAction: '' };
    return {
      triggered: true,
      recoveryScript: 'Entendo! Fico feliz que você encontrou uma solução. Se precisar de algo para o próximo evento, pode contar comigo. Posso guardar seu perfil para agilizar na próxima?',
      followUpAction: 'Adicionar à lista de follow-up em 60 dias com mensagem de relacionamento.',
    };
  }, [clientText]);
}
