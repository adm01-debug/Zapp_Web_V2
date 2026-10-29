import { useState, useEffect, useMemo } from 'react';

export type SLAStatus = 'ok' | 'warning' | 'breached';

export interface SLATimerState {
  firstResponse: {
    status: SLAStatus;
    remainingMs: number;
    breached: boolean;
  };
  worstStatus: SLAStatus;
}

interface UseSLACalculationParams {
  firstMessageAt: Date;
  firstResponseAt?: Date | null;
  firstResponseMinutes: number;
  /**
   * Minutos decorridos a partir dos quais o indicador entra em alerta (laranja).
   * Se omitido, o alerta dispara quando restam 30% do prazo, com pelo menos
   * 1 minuto de antecedencia.
   */
  warningMinutes?: number;
}

/** Fracao do prazo que resta quando o alerta automatico dispara (30%). */
const DEFAULT_WARNING_RATIO = 0.3;
/** Antecedencia minima do alerta automatico, em minutos. */
const MIN_WARNING_MINUTES = 1;

/**
 * Limiar de atencao em ms, na forma que `calculateStatus` espera (minutos
 * DECORRIDOS). O parametro explicito manda; sem ele, o alerta dispara quando
 * restam 30% do prazo, com pelo menos 1 minuto de antecedencia.
 */
function resolveWarningMs(warningMinutes: number | undefined, totalMs: number): number {
  if (warningMinutes != null) return warningMinutes * 60_000;
  const attentionRemainingMs = Math.max(
    totalMs * DEFAULT_WARNING_RATIO,
    MIN_WARNING_MINUTES * 60_000
  );
  return totalMs - attentionRemainingMs;
}

function calculateStatus(
  remainingMs: number,
  totalMs: number,
  warningMs: number,
  completed: boolean,
  completedAt?: Date | null,
  deadline?: Date
): { status: SLAStatus; remainingMs: number; breached: boolean } {
  if (completed && completedAt && deadline) {
    const breached = completedAt > deadline;
    return { status: breached ? 'breached' : 'ok', remainingMs: 0, breached };
  }

  if (remainingMs <= 0) {
    return { status: 'breached', remainingMs, breached: true };
  }
  // alerta (laranja) quando os minutos decorridos atingem warningMinutes,
  // ou seja, restante <= total - warning
  if (remainingMs <= totalMs - warningMs) {
    return { status: 'warning', remainingMs, breached: false };
  }
  return { status: 'ok', remainingMs, breached: false };
}

function compute(params: UseSLACalculationParams, nowMs: number): SLATimerState {
  const now = new Date(nowMs);
  const frDeadline = new Date(params.firstMessageAt.getTime() + params.firstResponseMinutes * 60_000);
  const totalMs = params.firstResponseMinutes * 60_000;
  const warningMs = resolveWarningMs(params.warningMinutes, totalMs);

  const firstResponse = calculateStatus(
    frDeadline.getTime() - now.getTime(),
    totalMs,
    warningMs,
    !!params.firstResponseAt,
    params.firstResponseAt,
    frDeadline
  );

  return { firstResponse, worstStatus: firstResponse.status };
}

export function formatTimeRemaining(ms: number): string {
  const absMs = Math.abs(ms);
  const totalSeconds = Math.floor(absMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours > 0) return `${hours}h ${remainingMinutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function useSLACalculation(params: UseSLACalculationParams): SLATimerState {
  // relogio derivado: tick assincrono via interval (nunca setState sincrono no effect)
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (params.firstResponseAt) return;
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [params.firstResponseAt]);

  return useMemo(() => compute(params, nowMs), [params, nowMs]);
}
