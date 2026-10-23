/**
 * CV-092 — Sinais de compra explícitos.
 *
 * Detecta frases que indicam intenção imediata de compra e sugere fechamento.
 * Alerta "hora de fechar" com precisão ≥ 85%.
 */
import { useState, useEffect, useCallback, useRef } from 'react';

export interface BuySignalDetectorOptions {
  messages: string[];
  onSignalDetected?: (signal: BuySignal) => void;
}

export interface BuySignal {
  type: 'payment' | 'artwork' | 'order_process' | 'shipping_info' | 'closing_question';
  matchedPhrase: string;
  confidence: number;
  closingSuggestion: string;
}

const SIGNAL_PATTERNS: Array<{ pattern: RegExp; type: BuySignal['type']; confidence: number; suggestion: string }> = [
  {
    pattern: /como (faço|fa[cç]o|realizo|efetuo) (o pedido|a compra|o pagamento)/i,
    type: 'order_process',
    confidence: 0.95,
    suggestion: 'Cliente quer saber como comprar. Hora de fechar: envie o link de pedido ou guie para o próximo passo.',
  },
  {
    pattern: /aceita (boleto|pix|cart[aã]o|transfer[eê]ncia)/i,
    type: 'payment',
    confidence: 0.90,
    suggestion: 'Cliente perguntou sobre pagamento. Confirme a forma e proponha fechar agora.',
  },
  {
    pattern: /(pode|manda|envia|me passa) (a arte|o arquivo|o layout|o vetor)/i,
    type: 'artwork',
    confidence: 0.85,
    suggestion: 'Cliente quer a arte — sinal de comprometimento. Confirme os dados e feche o pedido.',
  },
  {
    pattern: /(qual|como é|quanto é|me fala) (o frete|a entrega|o prazo de entrega)/i,
    type: 'shipping_info',
    confidence: 0.80,
    suggestion: 'Cliente perguntou sobre entrega. Forneça o prazo e converta: "Posso incluir frete calculado no pedido agora?"',
  },
  {
    pattern: /(vamos fechar|bora fechar|quero confirmar|quero fazer o pedido|pode confirmar)/i,
    type: 'closing_question',
    confidence: 0.98,
    suggestion: 'Cliente declarou intenção de fechar. Responda rápido — dentro de 1 minuto se possível.',
  },
];

function detectSignal(messages: string[]): BuySignal | null {
  const combined = messages.slice(-5).join(' ');
  for (const { pattern, type, confidence, suggestion } of SIGNAL_PATTERNS) {
    const match = combined.match(pattern);
    if (match) {
      return { type, matchedPhrase: match[0], confidence, closingSuggestion: suggestion };
    }
  }
  return null;
}

export function useBuySignalDetector({
  messages,
  onSignalDetected,
}: BuySignalDetectorOptions): {
  signal: BuySignal | null;
  signalCount: number;
  dismiss: () => void;
} {
  const [signal, setSignal] = useState<BuySignal | null>(null);
  const [signalCount, setSignalCount] = useState(0);
  const onSignalRef = useRef(onSignalDetected);
  useEffect(() => { onSignalRef.current = onSignalDetected; });

  useEffect(() => {
    const detected = detectSignal(messages);
    setSignal(prev => {
      if (detected && prev?.matchedPhrase !== detected.matchedPhrase) {
        setSignalCount(c => c + 1);
        if (onSignalRef.current) onSignalRef.current(detected);
      }
      return detected;
    });
  }, [messages]);

  const dismiss = useCallback(() => setSignal(null), []);

  return { signal, signalCount, dismiss };
}
