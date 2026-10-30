/**
 * CV-080 — Script pós-rejeição.
 *
 * Quando o cliente rejeita a proposta, sugere ao vendedor como encerrar
 * com dignidade, manter o relacionamento e plantar semente de retorno futuro.
 */
import { useMemo } from 'react';

export interface PostRejectionScript {
  detected: boolean;
  closingScript: string;
  futureHookScript: string;
  followUpDays: number;
}

const REJECTION_TRIGGERS = [
  'não vou fechar', 'não preciso mais', 'cancelar', 'não quero', 'obrigado mas não',
  'já comprei em outro', 'fechei com outro', 'não vou precisar', 'desistir',
  'não tenho interesse', 'pode encerrar', 'não vai dar',
];

export interface UsePostRejectionOptions {
  clientMessage: string;
}

export function usePostRejection({ clientMessage }: UsePostRejectionOptions): PostRejectionScript {
  return useMemo(() => {
    const lower = clientMessage.toLowerCase();
    const detected = REJECTION_TRIGGERS.some((t) => lower.includes(t));

    if (!detected) {
      return { detected: false, closingScript: '', futureHookScript: '', followUpDays: 0 };
    }

    return {
      detected: true,
      closingScript: 'Que pena não ter conseguido atender dessa vez! Fico à disposição para quando precisar. Posso te enviar um portfólio para referência futura?',
      futureHookScript: 'Daqui a 3 meses vou te mandar nossas novidades — às vezes a necessidade aparece de surpresa. Pode ser?',
      followUpDays: 90,
    };
  }, [clientMessage]);
}
