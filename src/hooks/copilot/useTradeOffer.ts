/**
 * CV-076 — Oferta de troca de valor (trade offer).
 *
 * Quando cliente pede concessão, sugere pedir algo em troca.
 */
import { useMemo } from 'react';

export interface TradeOfferResult {
  triggered: boolean;
  tradeScript: string;
  tradeOptions: string[];
}

const CONCESSION_TRIGGERS = [
  'desconto', 'mais barato', 'preço melhor', 'você consegue baixar', 'tem como reduzir',
  'parcelar', 'prazo maior', 'mais tempo para pagar',
];

const TRADE_OPTIONS = [
  'Pagamento à vista ou antecipado',
  'Pedido de quantidade maior',
  'Sem arte personalizada (modelo padrão)',
  'Prazo de entrega mais longo',
  'Retirada no local',
  'Referência para outro cliente',
];

export function useTradeOffer({ clientText }: { clientText: string }): TradeOfferResult {
  return useMemo(() => {
    if (!clientText) return { triggered: false, tradeScript: '', tradeOptions: [] };
    const lower = clientText.toLowerCase();
    const triggered = CONCESSION_TRIGGERS.some((t) => lower.includes(t));
    if (!triggered) return { triggered: false, tradeScript: '', tradeOptions: [] };
    return {
      triggered: true,
      tradeScript: 'Posso ver o que consigo, mas para eu conseguir uma condição especial, você conseguiria me ajudar em algo?',
      tradeOptions: TRADE_OPTIONS,
    };
  }, [clientText]);
}
