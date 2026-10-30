/**
 * CV-095 — Timing de follow-up.
 *
 * Sugere o melhor momento e script para o próximo contato.
 */
import { useMemo } from 'react';

export interface FollowUpSuggestion {
  whenDays: number;
  reason: string;
  script: string;
}

export function useFollowUpTiming({
  lastClientMessage,
  leadTemperature,
}: {
  lastClientMessage: string;
  leadTemperature: 'cold' | 'warm' | 'hot';
}): FollowUpSuggestion {
  return useMemo(() => {
    const lower = lastClientMessage.toLowerCase();

    if (lower.includes('semana que vem')) return { whenDays: 7, reason: 'Cliente pediu retorno semana que vem', script: 'Oi! Como combinado na semana passada, estou retornando. Posso adiantar alguma coisa?' };
    if (lower.includes('amanhã') || lower.includes('amanha')) return { whenDays: 1, reason: 'Cliente mencionou amanhã', script: 'Oi! Passando para ver se teve uma decisão sobre o pedido de ontem.' };
    if (lower.includes('depois de amanhã')) return { whenDays: 2, reason: 'Cliente mencionou depois de amanhã', script: 'Oi! Você mencionou que teria uma resposta hoje. Conseguiu verificar?' };

    if (leadTemperature === 'hot') return { whenDays: 1, reason: 'Lead quente — follow-up em 24h', script: 'Oi! Vi que não tivemos retorno sobre a proposta. Posso ajudar em alguma dúvida?' };
    if (leadTemperature === 'warm') return { whenDays: 3, reason: 'Lead morno — follow-up em 3 dias', script: 'Oi! Passando para ver se teve oportunidade de analisar. Ficou alguma dúvida?' };
    return { whenDays: 7, reason: 'Lead frio — follow-up em 7 dias', script: 'Oi! Estou por aqui caso precise de brindes para algum evento. Qualquer coisa, é só chamar!' };
  }, [lastClientMessage, leadTemperature]);
}
