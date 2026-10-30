/**
 * CV-086 — Rascunho de proposta.
 *
 * Monta proposta comercial estruturada com base nos dados da conversa.
 */
import { useMemo } from 'react';

export interface QuoteLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface QuoteDraft {
  ready: boolean;
  clientName: string;
  items: QuoteLineItem[];
  totalValue: number;
  validity: string;
  paymentTerms: string;
  deliveryDate: string;
  observations: string[];
  textSummary: string;
}

export interface UseQuoteDraftOptions {
  clientName: string;
  items: Array<{ description: string; quantity: number; unitPrice: number }>;
  deliveryDays?: number;
  paymentTerms?: string;
  /** Current timestamp in ms; pass Date.now() from the caller. */
  now?: number;
}

export function useQuoteDraft({
  clientName,
  items,
  deliveryDays = 10,
  paymentTerms = '50% na aprovação + 50% na entrega',
  now = 0,
}: UseQuoteDraftOptions): QuoteDraft {
  return useMemo(() => {
    const ready = !!(clientName && items.length > 0 && items.every((i) => i.quantity > 0 && i.unitPrice > 0));
    if (!ready) {
      return { ready: false, clientName, items: [], totalValue: 0, validity: '', paymentTerms: '', deliveryDate: '', observations: [], textSummary: '' };
    }

    const lineItems: QuoteLineItem[] = items.map((i) => ({ ...i, total: i.quantity * i.unitPrice }));
    const totalValue = lineItems.reduce((s, i) => s + i.total, 0);
    const deliveryDate = new Date(now + deliveryDays * 86_400_000).toLocaleDateString('pt-BR');
    const validity = new Date(now + 5 * 86_400_000).toLocaleDateString('pt-BR');

    const textSummary = [
      `Proposta para ${clientName}`,
      '',
      ...lineItems.map((l) => `• ${l.description}: ${l.quantity}un × R$${l.unitPrice.toFixed(2)} = R$${l.total.toFixed(2)}`),
      '',
      `Total: R$${totalValue.toFixed(2)}`,
      `Pagamento: ${paymentTerms}`,
      `Prazo de entrega: ${deliveryDate}`,
      `Validade da proposta: ${validity}`,
    ].join('\n');

    return {
      ready: true,
      clientName,
      items: lineItems,
      totalValue,
      validity,
      paymentTerms,
      deliveryDate,
      observations: ['Arte incluída grátis', 'Frete a calcular conforme endereço'],
      textSummary,
    };
  }, [clientName, items, deliveryDays, paymentTerms, now]);
}
