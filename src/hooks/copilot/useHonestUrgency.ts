/**
 * CV-084 — Urgência honesta.
 *
 * Cria gatilho de urgência REAL baseado em dados reais. Nunca fake urgency.
 */
import { useMemo } from 'react';

export interface HonestUrgencyResult {
  hasRealUrgency: boolean;
  urgencyType: 'deadline' | 'stock' | 'queue' | null;
  urgencyMessage: string;
  callToAction: string;
}

export function useHonestUrgency({
  daysUntilEvent,
  productionDays,
  stockUnits,
  queueDays,
}: {
  daysUntilEvent: number | null;
  productionDays: number;
  stockUnits?: number;
  queueDays?: number;
}): HonestUrgencyResult {
  return useMemo(() => {
    if (daysUntilEvent !== null && daysUntilEvent <= productionDays + 2) {
      return {
        hasRealUrgency: true,
        urgencyType: 'deadline',
        urgencyMessage: `Seu evento é em ${daysUntilEvent} dias e precisamos de ${productionDays} para produzir.`,
        callToAction: 'Confirme o pedido hoje para garantir a entrega.',
      };
    }
    if (stockUnits !== undefined && stockUnits <= 20) {
      return {
        hasRealUrgency: true,
        urgencyType: 'stock',
        urgencyMessage: `Estoque limitado: apenas ${stockUnits} unidades disponíveis.`,
        callToAction: 'Reserve agora para garantir a quantidade.',
      };
    }
    if (queueDays !== undefined && queueDays >= 5) {
      return {
        hasRealUrgency: true,
        urgencyType: 'queue',
        urgencyMessage: `Fila de produção atual: ${queueDays} dias de espera.`,
        callToAction: 'Quanto antes fechar, mais cedo entra na fila.',
      };
    }
    return { hasRealUrgency: false, urgencyType: null, urgencyMessage: '', callToAction: '' };
  }, [daysUntilEvent, productionDays, stockUnits, queueDays]);
}
