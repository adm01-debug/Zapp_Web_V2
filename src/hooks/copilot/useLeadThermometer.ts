/**
 * CV-091 — Termômetro de lead.
 *
 * Calcula o "calor" do lead com base em sinais de engajamento da conversa.
 */
import { useMemo } from 'react';

export type LeadTemperature = 'cold' | 'warm' | 'hot';

export interface LeadThermometerResult {
  temperature: LeadTemperature;
  score: number;
  signals: string[];
  recommendedAction: string;
}

const HOT_SIGNALS = ['quero fechar', 'pode fazer o pedido', 'manda a proposta', 'preciso agora', 'quando posso pagar', 'aprovado', 'combinado'];
const WARM_SIGNALS = ['gostei', 'interessante', 'pode ser', 'vou verificar', 'me manda mais', 'qual o prazo', 'tem desconto'];
const COLD_SIGNALS = ['vou pensar', 'não sei', 'talvez', 'depois', 'semana que vem', 'não tenho orçamento'];

export function useLeadThermometer({
  messages,
}: {
  messages: Array<{ content: string; sender: string }>;
}): LeadThermometerResult {
  return useMemo(() => {
    const clientText = messages.filter((m) => m.sender === 'contact').map((m) => m.content.toLowerCase()).join(' ');
    if (!clientText) return { temperature: 'cold', score: 0, signals: [], recommendedAction: 'Qualifique o lead com perguntas abertas.' };

    const hotHits = HOT_SIGNALS.filter((s) => clientText.includes(s));
    const warmHits = WARM_SIGNALS.filter((s) => clientText.includes(s));
    const coldHits = COLD_SIGNALS.filter((s) => clientText.includes(s));
    const score = hotHits.length * 3 + warmHits.length * 1 - coldHits.length * 1;

    if (score >= 3 || hotHits.length > 0) {
      return { temperature: 'hot', score, signals: hotHits, recommendedAction: 'Faça a proposta agora e sugira fechar.' };
    }
    if (score >= 1) {
      return { temperature: 'warm', score, signals: warmHits, recommendedAction: 'Aprofunde o interesse. Envie amostra ou mockup.' };
    }
    return { temperature: 'cold', score, signals: coldHits, recommendedAction: 'Descubra o timing real. Pergunte sobre o próximo evento.' };
  }, [messages]);
}
