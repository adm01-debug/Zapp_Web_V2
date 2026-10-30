/**
 * CV-124 — Score da conversa de vendas (B·R·I·N·D·E).
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
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  dimensions: ConversationScoreDimension[];
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

export function useConversationScore({ brinde, avgResponseSeconds, suggestionAcceptanceRate, clientMessageCount }: { brinde: BrindeCompleteness; avgResponseSeconds: number; suggestionAcceptanceRate: number; clientMessageCount: number }): ConversationScoreResult {
  return useMemo(() => {
    const brindeFields = Object.values(brinde);
    const brindeScore = (brindeFields.filter(Boolean).length / brindeFields.length) * 100;
    let speedScore = 0;
    if (avgResponseSeconds < 30) speedScore = 100;
    else if (avgResponseSeconds < 120) speedScore = 70;
    else if (avgResponseSeconds < 300) speedScore = 40;
    const acceptanceScore = suggestionAcceptanceRate * 100;
    const engagementScore = Math.min(clientMessageCount / 10, 1) * 100;
    const dimensions: ConversationScoreDimension[] = [
      { name: 'B·R·I·N·D·E', score: brindeScore, weight: 0.4, detail: `${brindeFields.filter(Boolean).length}/6 campos preenchidos` },
      { name: 'Velocidade', score: speedScore, weight: 0.25, detail: avgResponseSeconds < 60 ? `${avgResponseSeconds}s (excelente)` : `${Math.round(avgResponseSeconds / 60)}min` },
      { name: 'Sugestões', score: acceptanceScore, weight: 0.2, detail: `${Math.round(suggestionAcceptanceRate * 100)}% aceitas` },
      { name: 'Engajamento', score: engagementScore, weight: 0.15, detail: `${clientMessageCount} msgs do cliente` },
    ];
    const total = Math.round(dimensions.reduce((sum, d) => sum + d.score * d.weight, 0));
    const grade = total >= 90 ? 'A' : total >= 75 ? 'B' : total >= 60 ? 'C' : total >= 45 ? 'D' : 'F';
    const weakest = [...dimensions].sort((a, b) => a.score * a.weight - b.score * b.weight)[0];
    const topRecommendation = weakest.name === 'B·R·I·N·D·E' ? 'Complete o checklist B·R·I·N·D·E para aumentar o score.' : weakest.name === 'Velocidade' ? 'Responda em menos de 2 minutos para melhorar o score.' : weakest.name === 'Sugestões' ? 'Experimente as sugestões do RADAR — elas aumentam a taxa de conversão.' : 'Faça mais perguntas para engajar o cliente na conversa.';
    return { total, grade, dimensions, topRecommendation };
  }, [brinde, avgResponseSeconds, suggestionAcceptanceRate, clientMessageCount]);
}
