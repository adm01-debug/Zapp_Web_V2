/**
 * CV-080 — Script pós-rejeição.
 *
 * Quando o cliente rejeita a proposta, sugere ao vendedor como encerrar
 * com dignidade, manter o relacionamento e plantar semente de retorno futuro.
 * Une as duas implementações paralelas do CV-080 (antigo useRejectionRecovery):
 * gatilhos das duas e a ação de follow-up para o vendedor.
 */
import { useMemo } from 'react';

export interface PostRejectionScript {
  detected: boolean;
  closingScript: string;
  futureHookScript: string;
  followUpDays: number;
  /** Orientação para o vendedor (não enviar ao cliente). */
  followUpAction: string;
}

const REJECTION_TRIGGERS = [
  'não vou fechar', 'não preciso mais', 'cancelar', 'não quero', 'obrigado mas não',
  'já comprei', 'fechei com outro', 'não vou precisar', 'desistir', 'desisti',
  'não tenho interesse', 'pode encerrar', 'não vai dar', 'não vai rolar', 'vou passar dessa vez',
];

const FOLLOW_UP_DIAS = 90;

export interface UsePostRejectionOptions {
  clientMessage: string;
}

export function usePostRejection({ clientMessage }: UsePostRejectionOptions): PostRejectionScript {
  return useMemo(() => {
    const lower = (clientMessage ?? '').toLowerCase();
    const detected = REJECTION_TRIGGERS.some((t) => lower.includes(t));

    if (!detected) {
      return { detected: false, closingScript: '', futureHookScript: '', followUpDays: 0, followUpAction: '' };
    }

    return {
      detected: true,
      closingScript: 'Que pena não ter conseguido atender dessa vez! Fico à disposição para quando precisar. Posso guardar seu perfil e te enviar um portfólio para agilizar na próxima?',
      futureHookScript: 'Daqui a 3 meses vou te mandar nossas novidades — às vezes a necessidade aparece de surpresa. Pode ser?',
      followUpDays: FOLLOW_UP_DIAS,
      followUpAction: `Adicionar à lista de follow-up em ${FOLLOW_UP_DIAS} dias com mensagem de relacionamento.`,
    };
  }, [clientMessage]);
}
