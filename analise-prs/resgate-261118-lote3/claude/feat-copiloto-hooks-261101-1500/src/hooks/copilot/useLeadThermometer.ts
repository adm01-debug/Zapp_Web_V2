/**
 * CV-091 — Termômetro de lead.
 *
 * Resultado local: sincrônico via keyword scoring.
 * Resultado AI: async via edge `ai-lead-temperature` (invocar `analyze()`).
 */
import { useMemo, useState, useCallback, useRef } from 'react';
import { invokeEdge } from '@/lib/invokeEdge';

export type LeadTemperature = 'cold' | 'warm' | 'hot';

export interface LeadThermometerResult {
  temperature: LeadTemperature;
  score: number;
  signals: string[];
  recommendedAction: string;
}

export interface AiLeadTemperatureResult {
  temperature: LeadTemperature;
  score: number;
  nextAction: string;
  engagementScore: number;
}

export interface UseLeadThermometerReturn extends LeadThermometerResult {
  aiResult: AiLeadTemperatureResult | null;
  aiLoading: boolean;
  aiError: string | null;
  analyze: () => Promise<void>;
}

const HOT_SIGNALS = ['quero fechar', 'pode fazer o pedido', 'manda a proposta', 'preciso agora', 'quando posso pagar', 'aprovado', 'combinado'];
const WARM_SIGNALS = ['gostei', 'interessante', 'pode ser', 'vou verificar', 'me manda mais', 'qual o prazo', 'tem desconto'];
const COLD_SIGNALS = ['vou pensar', 'não sei', 'talvez', 'depois', 'semana que vem', 'não tenho orçamento'];

export function useLeadThermometer({
  messages,
}: {
  messages: Array<{ content: string; sender: string }>;
}): UseLeadThermometerReturn {
  const [aiResult, setAiResult] = useState<AiLeadTemperatureResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setAiLoading(true);
    setAiError(null);
    try {
      const { data, error } = await invokeEdge<AiLeadTemperatureResult>('ai-lead-temperature', {
        body: { messages },
      });
      if (error) { setAiError(error.message); return; }
      if (data) setAiResult(data);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setAiError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setAiLoading(false);
    }
  }, [messages]);

  return { ...local, aiResult, aiLoading, aiError, analyze };
}
