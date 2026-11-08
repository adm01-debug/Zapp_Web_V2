/**
 * CV-091 — Termômetro de lead.
 *
 * Local: score por sinais hot/warm/cold. AI: `analyze()` chama `ai-lead-temperature`
 * para análise multidimensional (interesse, urgência, capacidade).
 */
import { useMemo, useState, useCallback } from 'react';
import { invokeEdge } from '@/lib/invokeEdge';

export type LeadTemperature = 'cold' | 'warm' | 'hot';

export interface LeadThermometerResult {
  temperature: LeadTemperature;
  score: number;
  signals: string[];
  recommendedAction: string;
}

export interface AiLeadThermometerResult {
  temperature: number;
  temperatureLabel: 'cold' | 'warm' | 'hot';
  interestScore: number;
  urgencyScore: number;
  capacityScore: number;
  signals: string[];
  recommendedAction: string;
  nextBestOffer: string;
}

const HOT_SIGNALS = ['quero fechar', 'pode fazer o pedido', 'manda a proposta', 'preciso agora', 'quando posso pagar', 'aprovado', 'combinado'];
const WARM_SIGNALS = ['gostei', 'interessante', 'pode ser', 'vou verificar', 'me manda mais', 'qual o prazo', 'tem desconto'];
const COLD_SIGNALS = ['vou pensar', 'não sei', 'talvez', 'depois', 'semana que vem', 'não tenho orçamento'];

export function useLeadThermometer({
  messages,
}: {
  messages: Array<{ content: string; sender: string; created_at?: string }>;
}): LeadThermometerResult & {
  aiResult: AiLeadThermometerResult | null;
  aiLoading: boolean;
  aiError: string | null;
  analyze: () => Promise<void>;
} {
  const [aiResult, setAiResult] = useState<AiLeadThermometerResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const local = useMemo((): LeadThermometerResult => {
    const clientText = messages.filter((m) => m.sender === 'contact').map((m) => m.content.toLowerCase()).join(' ');
    if (!clientText) return { temperature: 'cold', score: 0, signals: [], recommendedAction: 'Qualifique o lead com perguntas abertas.' };
    const hotHits = HOT_SIGNALS.filter((s) => clientText.includes(s));
    const warmHits = WARM_SIGNALS.filter((s) => clientText.includes(s));
    const coldHits = COLD_SIGNALS.filter((s) => clientText.includes(s));
    const score = hotHits.length * 3 + warmHits.length * 1 - coldHits.length * 1;
    if (score >= 3 || hotHits.length > 0) return { temperature: 'hot', score, signals: hotHits, recommendedAction: 'Faça a proposta agora e sugira fechar.' };
    if (score >= 1) return { temperature: 'warm', score, signals: warmHits, recommendedAction: 'Aprofunde o interesse. Envie amostra ou mockup.' };
    return { temperature: 'cold', score, signals: coldHits, recommendedAction: 'Descubra o timing real. Pergunte sobre o próximo evento.' };
  }, [messages]);

  const analyze = useCallback(async () => {
    if (!messages.length) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const { data, error } = await invokeEdge<AiLeadThermometerResult>('ai-lead-temperature', {
        body: { messages },
      });
      if (error || !data) {
        setAiError(error?.message ?? 'Erro ao calcular temperatura do lead');
      } else {
        setAiResult(data);
      }
    } finally {
      setAiLoading(false);
    }
  }, [messages]);

  const active: LeadThermometerResult = aiResult
    ? {
        temperature: aiResult.temperatureLabel,
        score: aiResult.temperature,
        signals: aiResult.signals,
        recommendedAction: aiResult.recommendedAction,
      }
    : local;
  return { ...active, aiResult, aiLoading, aiError, analyze };
}
