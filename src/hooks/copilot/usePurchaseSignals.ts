/**
 * CV-092 — Sinais de compra.
 *
 * Detecta sinais explícitos e implícitos de intenção de compra.
 */
import { useMemo } from 'react';

export interface PurchaseSignal {
  type: 'explicit' | 'implicit';
  signal: string;
  confidence: number;
}

const EXPLICIT_SIGNALS = ['quero comprar', 'vamos fechar', 'pode fazer o pedido', 'manda o boleto', 'como pago', 'pix', 'boleto', 'fatura'];
const IMPLICIT_SIGNALS = ['qual o prazo de entrega', 'tem nota fiscal', 'emite nf', 'dados para emitir', 'cnpj para a nf', 'como funciona o pagamento'];

export function usePurchaseSignals({ clientText }: { clientText: string }): PurchaseSignal[] {
  return useMemo(() => {
    if (!clientText) return [];
    const lower = clientText.toLowerCase();
    const signals: PurchaseSignal[] = [];
    for (const s of EXPLICIT_SIGNALS) {
      if (lower.includes(s)) signals.push({ type: 'explicit', signal: s, confidence: 0.95 });
    }
    for (const s of IMPLICIT_SIGNALS) {
      if (lower.includes(s)) signals.push({ type: 'implicit', signal: s, confidence: 0.7 });
    }
    return signals;
  }, [clientText]);
}
