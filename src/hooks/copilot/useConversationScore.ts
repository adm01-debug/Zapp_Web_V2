/**
 * CV-124 — Score da conversa de vendas.
 *
 * Calcula um score 0–100 para a conversa atual com base em dimensões
 * observáveis no front: completude do B·R·I·N·D·E, velocidade de resposta,
 * aceitação de sugestões do copilot e engajamento do cliente.
 */
import { useMemo } from 'react';

export interface ConversationScoreDimension {
  name: string;
  score: number;
  weight: number;
  detail: string;
}

export interface ConversationScoreResult {
  total: number;
  /** 0–100, inteiro. */
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  dimensions: ConversationScoreDimension[];
  /** Recomendação principal para melhorar o score. */
  topRecommendation: string;
}

export interface BrindeCompleteness {
  budget: boolean;
  responsible: boolean;
  intent: boolean;
  number: boolean;
  date: boolean;
  delivery: boolean;
}

export interface UseConversationScoreOptions {
  /** Completude do checklist B·R·I·N·D·E. */
  brinde: BrindeCompleteness;
  /** Tempo médio de resposta do vendedor em segundos. */
  avgResponseSeconds: number;
  /** Taxa de aceitação de sugestões 0–1. */
  suggestionAcceptanceRate: number;
  /** Número de mensagens do cliente (engajamento). */
  clientMessageCount: number;
}

function grade(score: number): ConversationScoreResult['grade'] {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 45) return 'D';
  return 'F';
}

export function useConversationScore({
  brinde,
  avgResponseSeconds,
  suggestionAcceptanceRate,
  clientMessageCount,
}: UseConversationScoreOptions): ConversationScoreResult {
  return useMemo(() => {
    // B·R·I·N·D·E completeness (40%)
    const brindeFields = Object.values(brinde);
    const brindeScore = (brindeFields.filter(Boolean).length / brindeFields.length) * 100;

    // Response speed (25%): < 30s = 100, < 2min = 70, < 5min = 40, >= 5min = 0
    let speedScore = 0;
    if (avgResponseSeconds < 30) speedScore = 100;
    else if (avgResponseSeconds < 120) speedScore = 70;
    else if (avgResponseSeconds < 300) speedScore = 40;

    // Suggestion acceptance (20%)
    const acceptanceScore = suggestionAcceptanceRate * 100;

    // Client engagement (15%): linear até 10 mensagens = 100
    const engagementScore = Math.min(clientMessageCount / 10, 1) * 100;

    const dimensions: ConversationScoreDimension[] = [
      {
        name: 'B·R·I·N·D·E',
        score: brindeScore,
        weight: 0.4,
        detail: `${brindeFields.filter(Boolean).length}/6 campos preenchidos`,
      },
      {
        name: 'Velocidade',
        score: speedScore,
        weight: 0.25,
        detail:
          avgResponseSeconds < 60
            ? `${avgResponseSeconds}s (excelente)`
            : `${Math.round(avgResponseSeconds / 60)}min`,
      },
      {
        name: 'Sugestões',
        score: acceptanceScore,
        weight: 0.2,
        detail: `${Math.round(suggestionAcceptanceRate * 100)}% aceitas`,
      },
      {
        name: 'Engajamento',
        score: engagementScore,
        weight: 0.15,
        detail: `${clientMessageCount} msgs do cliente`,
      },
    ];

    const total = Math.round(
      dimensions.reduce((sum, d) => sum + d.score * d.weight, 0),
    );

    const weakest = [...dimensions].sort((a, b) => a.score * a.weight - b.score * b.weight)[0];
    const topRecommendation =
      weakest.name === 'B·R·I·N·D·E'
        ? 'Complete o checklist B·R·I·N·D·E para aumentar o score.'
        : weakest.name === 'Velocidade'
        ? 'Responda em menos de 2 minutos para melhorar o score.'
        : weakest.name === 'Sugestões'
        ? 'Experimente as sugestões do RADAR — elas aumentam a taxa de conversão.'
        : 'Faça mais perguntas para engajar o cliente na conversa.';

    return { total, grade: grade(total), dimensions, topRecommendation };
  }, [brinde, avgResponseSeconds, suggestionAcceptanceRate, clientMessageCount]);
}
