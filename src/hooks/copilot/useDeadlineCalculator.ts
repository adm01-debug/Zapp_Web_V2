/**
 * CV-083 — Calculadora de prazo real.
 *
 * Local: cálculo deterministico por data/produto. AI: `analyze()` chama `ai-deadline-calculator`
 * para extração de data da conversa + mensagem contextualizada.
 */
import { useMemo, useState, useCallback } from 'react';
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
  feasibility: DeadlineFeasibility;
  productionDays: number;
  daysUntilEvent: number | null;
  lastOrderDate: string | null;
  message: string;
  alternatives: string[];
  urgencyLevel: 'low' | 'medium' | 'high' | 'critical';
}

const PRODUCTION_DAYS: Record<string, number> = {
  caneta: 5, caneca: 7, camiseta: 10, squeeze: 8, mochila: 12, default: 10,
};

export function useDeadlineCalculator({
  eventDate,
  productType = 'default',
  today = new Date(),
  messages,
}: {
  eventDate: Date | null;
  productType?: string;
  today?: Date;
  messages?: Array<{ content: string; sender: string; created_at?: string }>;
}): DeadlineResult & {
  aiResult: AiDeadlineResult | null;
  aiLoading: boolean;
  aiError: string | null;
  analyze: () => Promise<void>;
} {
  const [aiResult, setAiResult] = useState<AiDeadlineResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

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
    if (!messages?.length) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const { data, error } = await invokeEdge<AiDeadlineResult>('ai-deadline-calculator', {
        body: {
          messages,
          eventDate: eventDate?.toISOString().split('T')[0],
          productType: productType !== 'default' ? productType : undefined,
        },
      });
      if (error || !data) {
        setAiError(error?.message ?? 'Erro ao calcular prazo');
      } else {
        setAiResult(data);
      }
    } finally {
      setAiLoading(false);
    }
  }, [messages, eventDate, productType]);

  const active: DeadlineResult = aiResult
    ? {
        feasibility: aiResult.feasibility,
        productionDays: aiResult.productionDays,
        daysUntilEvent: aiResult.daysUntilEvent,
        lastOrderDate: aiResult.lastOrderDate ? new Date(aiResult.lastOrderDate) : null,
        message: aiResult.message,
        alternatives: aiResult.alternatives,
      }
    : local;
  return { ...active, aiResult, aiLoading, aiError, analyze };
}
