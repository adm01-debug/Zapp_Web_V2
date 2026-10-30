/**
 * CV-087 — Sugestão de upsell.
 *
 * Quando o cliente está próximo de fechar, sugere produtos complementares
 * ou versão premium do produto escolhido. Nunca substitui — complementa.
 */
import { useMemo } from 'react';

export interface UpsellSuggestion {
  type: 'upgrade' | 'complement' | 'bundle';
  productLabel: string;
  reason: string;
  script: string;
  /** Incremento estimado no ticket (%). */
  ticketIncreasePct: number;
}

const BUY_SIGNAL_TRIGGERS = [
  'quanto fica', 'fecha', 'confirmar', 'aceito', 'vamos', 'ok',
  'pode ser', 'tudo bem', 'combinado', 'fechar', 'quero',
];

const PRODUCT_UPSELLS: Record<string, UpsellSuggestion> = {
  caneta: {
    type: 'upgrade',
    productLabel: 'Caneta metálica',
    reason: 'Acabamento premium para o mesmo propósito.',
    script: 'Esse pedido de canetas ficaria ainda mais especial em versão metálica — custo só 30% maior mas impacto muito maior. Posso mostrar?',
    ticketIncreasePct: 30,
  },
  camiseta: {
    type: 'complement',
    productLabel: 'Boné bordado',
    reason: 'Complementa o uniforme e aumenta a exposição de marca.',
    script: 'Para completar o kit de uniforme, posso incluir bonés bordados no mesmo estilo. Interesse?',
    ticketIncreasePct: 40,
  },
  ecobag: {
    type: 'bundle',
    productLabel: 'Kit ecobag + squeeze',
    reason: 'Kit sustentabilidade com maior percepção de valor.',
    script: 'Montamos um kit ecobag + squeeze personalizado — o par tem apelo de sustentabilidade e vai fazer muito mais sucesso que a ecobag só. Posso cotar?',
    ticketIncreasePct: 50,
  },
};

export interface UseUpsellOptions {
  clientMessage: string;
  messages: Array<{ content: string; sender: string }>;
}

export function useUpsell({ clientMessage, messages }: UseUpsellOptions): UpsellSuggestion | null {
  return useMemo(() => {
    const lower = clientMessage.toLowerCase();
    const hasBuySignal = BUY_SIGNAL_TRIGGERS.some((t) => lower.includes(t));
    if (!hasBuySignal) return null;

    const allText = messages.map((m) => m.content).join(' ').toLowerCase();
    for (const [product, upsell] of Object.entries(PRODUCT_UPSELLS)) {
      if (allText.includes(product)) return upsell;
    }

    return {
      type: 'complement',
      productLabel: 'Produto complementar',
      reason: 'Amplia o ticket e o impacto da ação.',
      script: 'Posso sugerir um produto complementar para montar um kit completo? Aumenta muito o impacto sem grande aumento de custo.',
      ticketIncreasePct: 30,
    };
  }, [clientMessage, messages]);
}
