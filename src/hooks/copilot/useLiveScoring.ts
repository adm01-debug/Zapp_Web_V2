/**
 * CV-111 — Pontuação ao vivo da conversa.
 *
 * Calcula uma pontuação composta da qualidade da conversa baseada em:
 * velocidade de resposta, completude do B·R·I·N·D·E, sinais de compra,
 * e objeções tratadas. Proxy da saúde do negócio em tempo real.
 */
import { useMemo } from 'react';

export interface LiveConversationScore {
  total: number;
  breakdown: {
    responseSpeed: number;
    brindeFill: number;
    buySignals: number;
    objectionHandled: number;
  };
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  tip: string;
}

const BRINDE_KEYS = ['budget', 'responsavel', 'intencao', 'numero', 'data', 'entrega'] as const;

function gradeFromScore(score: number): LiveConversationScore['grade'] {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

export interface UseLiveScoringOptions {
  /** Minutos desde a primeira mensagem do cliente até a primeira resposta do vendedor. */
  responseMinutes: number;
  /** Campos do B·R·I·N·D·E preenchidos até agora. */
  brindeFilled: Partial<Record<typeof BRINDE_KEYS[number], boolean>>;
  /** Sinais de compra detectados (de usePurchaseSignals). */
  purchaseSignalWeight: number;
  /** Objeções detectadas que foram respondidas. */
  objectionsHandled: number;
  /** Total de objeções detectadas. */
  totalObjections: number;
}

export function useLiveScoring({
  responseMinutes,
  brindeFilled,
  purchaseSignalWeight,
  objectionsHandled,
  totalObjections,
}: UseLiveScoringOptions): LiveConversationScore {
  return useMemo(() => {
    // Speed: 25 pts — penaliza > 5 min
    const responseSpeed = Math.max(0, 25 - Math.floor(responseMinutes / 5) * 5);

    // BRINDE fill: 40 pts total — ~7 pts por campo
    const filledCount = BRINDE_KEYS.filter((k) => brindeFilled[k]).length;
    const brindeFill = Math.round((filledCount / BRINDE_KEYS.length) * 40);

    // Buy signals: 20 pts
    const buySignals = Math.min(20, Math.round(purchaseSignalWeight / 5));

    // Objection handling: 15 pts
    const objectionHandled = totalObjections === 0
      ? 15
      : Math.round((objectionsHandled / totalObjections) * 15);

    const total = responseSpeed + brindeFill + buySignals + objectionHandled;
    const grade = gradeFromScore(total);

    const worstDimension = [
      { label: 'velocidade de resposta', score: responseSpeed, max: 25 },
      { label: 'qualificação B·R·I·N·D·E', score: brindeFill, max: 40 },
      { label: 'sinais de compra', score: buySignals, max: 20 },
      { label: 'tratamento de objeções', score: objectionHandled, max: 15 },
    ].sort((a, b) => a.score / a.max - b.score / b.max)[0];

    const tip = `Ponto de melhoria: ${worstDimension.label}.`;

    return { total: Math.min(total, 100), breakdown: { responseSpeed, brindeFill, buySignals, objectionHandled }, grade, tip };
  }, [responseMinutes, brindeFilled, purchaseSignalWeight, objectionsHandled, totalObjections]);
}
