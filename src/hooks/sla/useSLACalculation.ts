import { useState, useEffect, useCallback } from 'react';

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
}

function calculateStatus(
  remainingMs: number,
  totalMs: number,
  completed: boolean,
  completedAt?: Date | null,
  deadline?: Date
): { status: SLAStatus; remainingMs: number; breached: boolean } {
  if (completed && completedAt && deadline) {
    const breached = completedAt > deadline;
    return { status: breached ? 'breached' : 'ok', remainingMs: 0, breached };
  }

  const warningThreshold = totalMs * 0.3;
  if (remainingMs <= 0) {
    return { status: 'breached', remainingMs, breached: true };
  }
  if (remainingMs <= warningThreshold) {
    return { status: 'warning', remainingMs, breached: false };
  }
  return { status: 'ok', remainingMs, breached: false };
}

function compute(params: UseSLACalculationParams): SLATimerState {
  const now = new Date();
  const frDeadline = new Date(params.firstMessageAt.getTime() + params.firstResponseMinutes * 60_000);

  const firstResponse = calculateStatus(
    frDeadline.getTime() - now.getTime(),
    params.firstResponseMinutes * 60_000,
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
  const [state, setState] = useState<SLATimerState>(() => compute(params));

  const recompute = useCallback(() => setState(compute(params)), [
    params.firstMessageAt,
    params.firstResponseAt,
    params.firstResponseMinutes,
  ]);

  useEffect(() => {
    recompute();
    if (params.firstResponseAt) return;
    const interval = setInterval(recompute, 1000);
    return () => clearInterval(interval);
  }, [recompute, params.firstResponseAt]);

  return state;
}
