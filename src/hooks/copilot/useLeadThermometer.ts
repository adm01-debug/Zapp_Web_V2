/**
 * CV-091 — Termômetro do lead.
 *
 * Temperatura 0–100 combinando:
 * - B·R·I·N·D·E preenchidos (40 pts)
 * - Velocidade de resposta (15 pts)
 * - Perguntas de compra explícitas (20 pts)
 * - Envio de logo (10 pts)
 * - Pedido de prazo / arte (15 pts)
 */
import { useMemo } from 'react';

export type TemperatureLevel = 'cold' | 'warm' | 'hot' | 'burning';

export interface BRINDEFields {
  budget?: number | null;
  responsible?: string | null;
  intention?: string | null;
  number?: number | null;
  date?: string | null;
  delivery?: string | null;
}

export interface LeadThermometerOptions {
  brinde: BRINDEFields;
  /** Tempo médio de resposta do cliente em minutos (null = sem histórico). */
  avgResponseMinutes?: number | null;
  /** Mensagens que contêm perguntas de compra explícitas. */
  buySignalCount?: number;
  /** Cliente enviou logo. */
  hasSentLogo?: boolean;
  /** Cliente pediu prazo ou arte. */
  hasPressedDeadline?: boolean;
}

export interface LeadTemperature {
  score: number;
  level: TemperatureLevel;
  label: string;
  breakdown: Record<string, number>;
}

const LEVEL_THRESHOLDS: Array<{ min: number; level: TemperatureLevel; label: string }> = [
  { min: 75, level: 'burning', label: 'Quente para fechar' },
  { min: 50, level: 'hot', label: 'Engajado' },
  { min: 25, level: 'warm', label: 'Em progresso' },
  { min: 0, level: 'cold', label: 'Início' },
];

function brindeScore(brinde: BRINDEFields): number {
  const fields = [brinde.budget, brinde.responsible, brinde.intention, brinde.number, brinde.date, brinde.delivery];
  const filled = fields.filter(v => v !== null && v !== undefined && v !== '').length;
  return Math.round((filled / 6) * 40);
}

function responseSpeedScore(avgMin?: number | null): number {
  if (!avgMin) return 0;
  if (avgMin <= 5) return 15;
  if (avgMin <= 15) return 10;
  if (avgMin <= 60) return 5;
  return 0;
}

export function useLeadThermometer(options: LeadThermometerOptions): LeadTemperature {
  const { brinde, avgResponseMinutes, buySignalCount = 0, hasSentLogo = false, hasPressedDeadline = false } = options;

  return useMemo(() => {
    const breakdown: Record<string, number> = {
      brinde: brindeScore(brinde),
      responseSpeed: responseSpeedScore(avgResponseMinutes),
      buySignals: Math.min(buySignalCount * 10, 20),
      logo: hasSentLogo ? 10 : 0,
      deadline: hasPressedDeadline ? 15 : 0,
    };
    const score = Math.min(Object.values(breakdown).reduce((a, b) => a + b, 0), 100);
    const { level, label } = LEVEL_THRESHOLDS.find(t => score >= t.min)!;
    return { score, level, label, breakdown };
  }, [brinde, avgResponseMinutes, buySignalCount, hasSentLogo, hasPressedDeadline]);
}
