/**
 * CV-077/079/080: "I'll think about it" detector, loss risk, and post-"no" recovery.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

export type LossRiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface LossSignal {
  type: 'delay' | 'sentiment_drop' | 'short_responses' | 'competitor_mention' | 'explicit_no';
  weight: number;
}

export interface LossRiskState {
  level: LossRiskLevel;
  signals: LossSignal[];
  score: number;
  recoveryScript: string[];
  followUpTask?: string;
}

export interface UseLossRiskOptions {
  conversationId: string;
  messages: string[];
  onRiskDetected?: (state: LossRiskState) => void;
}

const DELAY_KEYWORDS = [
  'vou pensar',
  'deixa ver',
  'vou conferir',
  'depois',
  'semana que vem',
  'não sei',
  'talvez',
  'verei',
  'quem sabe',
];

const COMPETITOR_KEYWORDS = [
  'outro fornecedor',
  'outro site',
  'comprar em',
  'mais barato',
  'vi em outro',
  'concorrente',
];

const EXPLICIT_NO_KEYWORDS = [
  'não quero',
  'não tenho interesse',
  'desisti',
  'não vou comprar',
  'cancelar',
  'deixa pra lá',
  'não preciso mais',
  'mudei de ideia',
];

const RECOVERY_SCRIPTS: Record<LossRiskLevel, string[]> = {
  none: [],
  low: [
    'Envie um resumo do que foi discutido com os próximos passos claros.',
    'Reforce o prazo ou disponibilidade do produto/estoque.',
  ],
  medium: [
    'Reconheça a hesitação: "Posso perguntar o que está te impedindo de avançar?"',
    'Ofereça algo concreto: amostra, simulação de pedido ou reserva sem compromisso.',
    'Defina um follow-up claro: "Posso dar um retorno amanhã às 10h?"',
  ],
  high: [
    '1. Reconheça sem pressão: "Entendo que você está avaliando — faz todo sentido."',
    '2. Descubra a causa raiz: "O que faltaria para você se sentir seguro em fechar?"',
    '3. Ofereça uma âncora: reserva por 48h, condição especial de pagamento ou amostra.',
    '4. Crie urgência legítima: data de validade da cotação ou disponibilidade de estoque.',
  ],
  critical: [
    '1. Feche com elegância: "Respeito totalmente sua decisão. Posso perguntar o que pesou mais?"',
    '2. Colha o aprendizado: ouça sem rebater — a causa real pode reverter em outra conversa.',
    '3. Deixe a porta aberta: "Fico à disposição para quando a demanda voltar. Posso enviar nosso catálogo?"',
    '4. Hook sazonal: "Nosso próximo lote especial de [produto] sai em [mês] — posso te avisar?"',
  ],
};

function scoreSignals(messages: string[]): { signals: LossSignal[]; score: number } {
  const signals: LossSignal[] = [];
  const combined = messages.slice(-5).join(' ').toLowerCase();
  const recent = messages.slice(-5);

  // Check for delay keywords
  if (DELAY_KEYWORDS.some(kw => combined.includes(kw))) {
    signals.push({ type: 'delay', weight: 20 });
  }

  // Check for competitor mentions
  if (COMPETITOR_KEYWORDS.some(kw => combined.includes(kw))) {
    signals.push({ type: 'competitor_mention', weight: 30 });
  }

  // Check for explicit "no"
  if (EXPLICIT_NO_KEYWORDS.some(kw => combined.includes(kw))) {
    signals.push({ type: 'explicit_no', weight: 50 });
  }

  // Check for short responses (last 3 messages from customer perspective)
  const shortResponseMessages = recent.filter(m => m.trim().length < 20);
  if (shortResponseMessages.length >= 2) {
    signals.push({ type: 'short_responses', weight: 15 });
  }

  const score = signals.reduce((sum, s) => sum + s.weight, 0);
  return { signals, score };
}

function scoreToLevel(score: number): LossRiskLevel {
  if (score === 0) return 'none';
  if (score <= 20) return 'low';
  if (score <= 40) return 'medium';
  if (score <= 60) return 'high';
  return 'critical';
}

const EMPTY_RISK_STATE: LossRiskState = {
  level: 'none',
  signals: [],
  score: 0,
  recoveryScript: [],
};

export function useLossRiskDetector(options: UseLossRiskOptions): {
  riskState: LossRiskState;
  dismiss: () => void;
} {
  const { messages, onRiskDetected } = options;
  const [riskState, setRiskState] = useState<LossRiskState>(EMPTY_RISK_STATE);
  const onRiskRef = useRef(onRiskDetected);
  onRiskRef.current = onRiskDetected;
  const dismissedMessagesRef = useRef<string[]>([]);

  const emptyState = useMemo(() => EMPTY_RISK_STATE, []);

  useEffect(() => {
    // Do not re-detect if the messages haven't changed since the last dismiss
    if (
      dismissedMessagesRef.current.length > 0 &&
      dismissedMessagesRef.current.join('\0') === messages.join('\0')
    ) {
      return;
    }
    dismissedMessagesRef.current = [];

    const { signals, score } = scoreSignals(messages);
    const level = scoreToLevel(score);

    const newState: LossRiskState = {
      level,
      signals,
      score,
      recoveryScript: RECOVERY_SCRIPTS[level],
      followUpTask:
        level === 'high' || level === 'critical'
          ? 'Agendar follow-up em 24h para entender a decisão'
          : undefined,
    };

    setRiskState(prev => {
      if (prev.level !== newState.level || prev.score !== newState.score) {
        if (newState.level !== 'none' && onRiskRef.current) {
          onRiskRef.current(newState);
        }
        return newState;
      }
      return prev;
    });
  }, [messages]);

  const dismiss = useCallback(() => {
    dismissedMessagesRef.current = messages;
    setRiskState(emptyState);
  }, [messages, emptyState]);

  return { riskState, dismiss };
}
