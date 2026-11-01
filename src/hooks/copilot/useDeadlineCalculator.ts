/**
 * CV-083 — Calculadora de prazo real.
 *
 * Resultado local: sincrônico via cálculo de dias.
 * Resultado AI: async via edge `ai-deadline-calculator` (invocar `analyze()`).
 */
import { useMemo, useState, useCallback, useRef } from 'react';
import { invokeEdge } from '@/lib/invokeEdge';

export type DeadlineFeasibility = 'ok' | 'tight' | 'impossible';

export interface DeadlineResult {
  feasibility: DeadlineFeasibility;
  productionDays: number;
  lastOrderDate: Date | null;
  daysUntilEvent: number | null;
  message: string;
  alternatives: string[];
}

export interface AiDeadlineResult {
  feasible: boolean | null;
  insufficient_data: boolean;
  suggestedDeadline: string | null;
  riskLevel: 'low' | 'medium' | 'high' | null;
  rushFeeApplicable: boolean | null;
  negotiationScript: string;
  alternativeOptions: string[];
}

export interface UseDeadlineCalculatorReturn extends DeadlineResult {
  aiResult: AiDeadlineResult | null;
  aiLoading: boolean;
  aiError: string | null;
  analyze: () => Promise<void>;
}

const PRODUCTION_DAYS: Record<string, number> = {
  caneta: 5, caneca: 7, camiseta: 10, squeeze: 8, mochila: 12, default: 10,
};

export function useDeadlineCalculator({
  eventDate,
  productType = 'default',
  today = new Date(),
  messages = [],
  requestedDeadline = '',
}: {
  eventDate: Date | null;
  productType?: string;
  today?: Date;
  messages?: Array<{ content: string; sender: string }>;
  requestedDeadline?: string;
}): UseDeadlineCalculatorReturn {
  const [aiResult, setAiResult] = useState<AiDeadlineResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const local = useMemo((): DeadlineResult => {
    if (!eventDate) return { feasibility: 'ok', productionDays: 0, lastOrderDate: null, daysUntilEvent: null, message: 'Informe a data do evento para calcular o prazo.', alternatives: [] };
    const prodDays = PRODUCTION_DAYS[productType] ?? PRODUCTION_DAYS.default;
    const msPerDay = 86_400_000;
    const daysUntilEvent = Math.floor((eventDate.getTime() - today.getTime()) / msPerDay);
    const lastOrderDate = new Date(eventDate.getTime() - prodDays * msPerDay);
    const alternatives: string[] = [];
    let feasibility: DeadlineFeasibility;
    let message: string;
    if (daysUntilEvent > prodDays + 3) {
      feasibility = 'ok';
      message = `Prazo confortável. Último dia para pedir: ${lastOrderDate.toLocaleDateString('pt-BR')}.`;
    } else if (daysUntilEvent >= prodDays) {
      feasibility = 'tight';
      message = `Prazo justo! Precisa fechar hoje para garantir.`;
      alternatives.push('Pagamento à vista para priorizar a produção');
    } else {
      feasibility = 'impossible';
      message = `Prazo insuficiente para produção personalizada (${prodDays} dias úteis).`;
      alternatives.push('Produto em estoque pronto para pronta-entrega');
      alternatives.push('Entrega parcial: parte na data, o restante depois');
      alternatives.push('Produto mais simples com prazo menor');
    }
    return { feasibility, productionDays: prodDays, lastOrderDate, daysUntilEvent, message, alternatives };
  }, [eventDate, productType, today]);

  const analyze = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setAiLoading(true);
    setAiError(null);
    try {
      const prodDays = PRODUCTION_DAYS[productType] ?? PRODUCTION_DAYS.default;
      const { data, error } = await invokeEdge<AiDeadlineResult>('ai-deadline-calculator', {
        body: { messages, requestedDeadline, productionDays: prodDays },
      });
      if (error) { setAiError(error.message); return; }
      if (data) setAiResult(data);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setAiError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setAiLoading(false);
    }
  }, [messages, requestedDeadline, productType]);

  return { ...local, aiResult, aiLoading, aiError, analyze };
}
