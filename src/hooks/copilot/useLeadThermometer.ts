import { useMemo, useRef, useCallback } from 'react';

export type LeadTemperature = 'cold' | 'warm' | 'hot' | 'closing';

export interface BuySignal {
  type: 'order_question' | 'payment_question' | 'art_mention' | 'price_confirmation' | 'deadline_press';
  message: string;
  detectedAt: Date;
}

export interface ThermometerState {
  score: number;           // 0-100
  temperature: LeadTemperature;  // cold<30, warm 30-59, hot 60-84, closing 85+
  signals: BuySignal[];
  shouldSuggestClose: boolean;   // true when closing
  closeMessage?: string;
  brindeCompletion: number;     // 0-6 (how many BRINDE fields filled)
}

export interface UseLeadThermometerOptions {
  conversationId: string;
  messages: string[];
  brindeScore: number;  // 0-6
  avgResponseTimeMs?: number;  // lower = hotter
  onTemperatureChange?: (state: ThermometerState) => void;
}

const BUY_SIGNAL_PATTERNS: Array<{
  type: BuySignal['type'];
  patterns: RegExp[];
}> = [
  {
    type: 'order_question',
    patterns: [
      /como fa[çc]o o pedido/i,
      /como (eu )?compro/i,
      /como (eu )?fa[çc]o (para )?pedir/i,
      /quero (fazer|confirmar) o pedido/i,
    ],
  },
  {
    type: 'payment_question',
    patterns: [
      /aceita boleto/i,
      /dados banc[áa]rios/i,
      /pix/i,
      /forma[s]? de pagamento/i,
      /como (eu )?pago/i,
      /cart[ãa]o/i,
    ],
  },
  {
    type: 'art_mention',
    patterns: [
      /pode mandar a arte/i,
      /mandar (o )?arquivo/i,
      /logo(tipo)?/i,
      /vetor/i,
      /enviar a arte/i,
    ],
  },
  {
    type: 'price_confirmation',
    patterns: [
      /confirma[r]? o pre[çc]o/i,
      /esse (mesmo )?pre[çc]o/i,
      /valor (total|final)/i,
      /fica[ria]? quanto/i,
    ],
  },
  {
    type: 'deadline_press',
    patterns: [
      /prazo (para|pra)/i,
      /quando (chega|fica pronto|entrega)/i,
      /urgente/i,
      /preciso (para|pra) dia/i,
      /data do evento/i,
    ],
  },
];

function detectBuySignals(messages: string[]): BuySignal[] {
  const signals: BuySignal[] = [];
  const now = new Date();
  for (const message of messages) {
    for (const { type, patterns } of BUY_SIGNAL_PATTERNS) {
      if (patterns.some((p) => p.test(message))) {
        // Avoid duplicate types
        if (!signals.find((s) => s.type === type)) {
          signals.push({ type, message, detectedAt: now });
        }
      }
    }
  }
  return signals;
}

function responseSpeedBonus(avgResponseTimeMs?: number): number {
  if (avgResponseTimeMs === undefined) return 0;
  if (avgResponseTimeMs < 30_000) return 20;   // < 30s
  if (avgResponseTimeMs < 120_000) return 15;  // < 2min
  if (avgResponseTimeMs < 300_000) return 10;  // < 5min
  if (avgResponseTimeMs < 600_000) return 5;   // < 10min
  return 0;
}

function scoreToTemperature(score: number): LeadTemperature {
  if (score >= 85) return 'closing';
  if (score >= 60) return 'hot';
  if (score >= 30) return 'warm';
  return 'cold';
}

const CLOSE_MESSAGES: Record<string, string> = {
  order_question: 'O lead perguntou sobre o pedido — hora de fechar! Proponha o pedido agora.',
  payment_question: 'O lead perguntou sobre pagamento — avance para o fechamento com os dados de pagamento.',
  price_confirmation: 'O lead confirmou o preço — perfeito momento para fechar o pedido.',
  deadline_press: 'O lead está com prazo pressionado — use isso para fechar agora.',
  default: 'O lead está quente! Proponha o fechamento agora com uma oferta clara.',
};

export function useLeadThermometer(options: UseLeadThermometerOptions): {
  thermometer: ThermometerState;
  history: ThermometerState[];
} {
  const { conversationId, messages, brindeScore, avgResponseTimeMs, onTemperatureChange } = options;
  const historyRef = useRef<ThermometerState[]>([]);
  const prevTemperatureRef = useRef<LeadTemperature | null>(null);

  const thermometer = useMemo((): ThermometerState => {
    const signals = detectBuySignals(messages);
    const speedBonus = responseSpeedBonus(avgResponseTimeMs);
    const brindePoints = Math.min(brindeScore, 6) * 10;
    const signalPoints = Math.min(signals.length * 15, 45);
    const rawScore = brindePoints + speedBonus + signalPoints;
    const score = Math.min(100, rawScore);
    const temperature = scoreToTemperature(score);
    const shouldSuggestClose = temperature === 'closing';

    let closeMessage: string | undefined;
    if (shouldSuggestClose) {
      const topSignal = signals[0];
      closeMessage = topSignal
        ? (CLOSE_MESSAGES[topSignal.type] ?? CLOSE_MESSAGES.default)
        : CLOSE_MESSAGES.default;
    }

    return {
      score,
      temperature,
      signals: signals.slice(0, 3),
      shouldSuggestClose,
      closeMessage,
      brindeCompletion: Math.min(brindeScore, 6),
    };
  }, [conversationId, messages, brindeScore, avgResponseTimeMs]);

  // Track history and fire callback on temperature change
  useMemo(() => {
    if (prevTemperatureRef.current !== thermometer.temperature) {
      prevTemperatureRef.current = thermometer.temperature;
      historyRef.current = [...historyRef.current, thermometer].slice(-20);
      onTemperatureChange?.(thermometer);
    }
  }, [thermometer, onTemperatureChange]);

  return { thermometer, history: historyRef.current };
}
