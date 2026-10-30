/**
 * CV-083 — Calculadora de prazo real.
 */
import { useMemo } from 'react';

export type DeadlineFeasibility = 'ok' | 'tight' | 'impossible';

export interface DeadlineResult {
  feasibility: DeadlineFeasibility;
  productionDays: number;
  lastOrderDate: Date | null;
  daysUntilEvent: number | null;
  message: string;
  alternatives: string[];
}

const PRODUCTION_DAYS: Record<string, number> = {
  caneta: 5, caneca: 7, camiseta: 10, squeeze: 8, mochila: 12, default: 10,
};

export function useDeadlineCalculator({ eventDate, productType = 'default', today = new Date() }: { eventDate: Date | null; productType?: string; today?: Date }): DeadlineResult {
  return useMemo(() => {
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
}
